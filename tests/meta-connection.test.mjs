import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Database from 'better-sqlite3';
function compile(path,deps={},globals={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,URL,AbortSignal,Error,Number,Math,JSON,Response,fetch,...globals,require:n=>{if(!(n in deps))throw new Error(`Unexpected import ${n}`);return deps[n];}});return exports;
}
function provider(data,status=200){return compile('src/app/api/lib/meta-token.ts',{}, {fetch:async()=>new Response(JSON.stringify(data),{status})});}
const pure=provider({});
const info={type:'SYSTEM_USER',expiresAt:null,dataAccessExpiresAt:null,scopes:['ads_read','business_management'],checkedAt:new Date().toISOString()};
function tokens({persistent=true,conn=null,local=null,failWrite=false,failCache=false}={}) {
 const writes=[];const api=compile('src/app/api/lib/tokens.ts',{
 './meta-token':pure,
 './db':{getConnection:()=>local,upsertConnection:entry=>{if(failCache)throw new Error('ephemeral disk failed');writes.push({kind:'local',entry});}},
 './shopify-client':{},'./crypto':{},
 './supabase-persistence':{isSupabasePersistenceEnabled:()=>persistent,getPersistentConnection:async()=>conn,upsertPersistentConnection:async entry=>{if(failWrite)throw new Error('database unavailable');writes.push({kind:'cloud',entry});}},
 });return {api,writes};
}
test('Meta expiry handles seconds, milliseconds and verified no-expiry without extending it',()=>{
 assert.equal(pure.metaExpiry(1795844096),1795844096000);assert.equal(pure.metaExpiry(1795844096000),1795844096000);assert.equal(pure.metaExpiry(0),null);assert.throws(()=>pure.metaExpiry(NaN));assert.equal(pure.effectiveMetaExpiry(2000,1000),1000);
});
test('provider-verified system token can have no scheduled expiry; missing expiry is not permanent',async()=>{
 const p=provider({data:{is_valid:true,type:'SYSTEM_USER',expires_at:0,data_access_expires_at:0,scopes:['ads_read']}});assert.equal((await p.inspectMetaToken('secret')).expiresAt,null);
 await assert.rejects(()=>provider({data:{is_valid:true,type:'USER',scopes:['ads_read']}}).inspectMetaToken('secret'),/could not validate/);
 await assert.rejects(()=>provider({data:{is_valid:true,type:'USER',expires_at:100,scopes:['ads_read']}}).inspectMetaToken('secret'),/expired/);
});
test('expired or permissionless tokens cannot replace a working connection; provider errors are redacted',async()=>{
 await assert.rejects(()=>provider({data:{is_valid:false}}).inspectMetaToken('secret'),/rejected/);
 await assert.rejects(()=>provider({data:{is_valid:true,type:'SYSTEM_USER',expires_at:0,scopes:['public_profile']}}).inspectMetaToken('secret'),/permission/);
 await assert.rejects(()=>provider({error:{code:190,message:'secret leaked upstream'}},400).inspectMetaToken('secret'),e=>!e.message.includes('secret'));
});
test('Supabase is authoritative and a missing remote connection never revives stale SQLite tokens',async()=>{
 const {api}=tokens({local:{store_id:'s',access_token:'stale',expires_at:null}});assert.equal(await api.getMetaToken('s'),null);assert.equal((await api.getMetaConnectionHealth('s')).health.status,'missing');
});
test('cloud write failure cannot appear as locally connected, and cloud success survives local cache failure',async()=>{
 const bad=tokens({failWrite:true});await assert.rejects(()=>bad.api.setMetaToken('s',{accessToken:'secret',metaInfo:info}));assert.equal(bad.writes.length,0);
 const good=tokens({failCache:true});await good.api.setMetaToken('s',{accessToken:'secret',metaInfo:info});assert.equal(good.writes.length,1);assert.equal(good.writes[0].kind,'cloud');assert.equal(good.writes[0].entry.expiresAt,null);
});
test('Meta replacement preserves saved account information and stores real expiry and validation metadata',async()=>{
 const {api,writes}=tokens({conn:{account_id:'act_1',account_name:'Saved account'}});await api.setMetaToken('s',{accessToken:'secret',metaInfo:{...info,type:'USER',expiresAt:Date.now()+60000}});assert.equal(writes[0].entry.accountId,'act_1');assert.equal(writes[0].entry.accountName,'Saved account');assert.equal(JSON.parse(writes[0].entry.metadata).validation,'valid');assert.equal(writes[0].kind,'cloud');assert.equal(writes[1].kind,'local');
});
test('expired/revoked status differs from missing; valid system tokens show no scheduled expiry',async()=>{
 for(const [conn,status] of [[null,'missing'],[{expires_at:1},'expired'],[{metadata:JSON.stringify({validation:'invalid'})},'invalid'],[{metadata:JSON.stringify(info)},'connected']]){const {api}=tokens({conn:conn?{store_id:'s',access_token:'secret',...conn}:null});const h=(await api.getMetaConnectionHealth('s')).health;assert.equal(h.status,status);assert.equal(h.noScheduledExpiry,status==='connected');}
});
test('SQLite clears a previous expiry only when an explicit no-expiry replacement is saved',()=>{
 const db=new Database(':memory:');db.exec('CREATE TABLE connections(store_id TEXT,platform TEXT,access_token TEXT,refresh_token TEXT,expires_at INTEGER,account_id TEXT,account_name TEXT,shop_domain TEXT,shop_name TEXT,scopes TEXT,metadata TEXT,last_synced TEXT,UNIQUE(store_id,platform))');
 const source=fs.readFileSync('src/app/api/lib/db.ts','utf8');const part=source.slice(source.indexOf('export function upsertConnection('),source.indexOf('export function updateConnectionAccount('));const exports={};vm.runInNewContext(ts.transpileModule(part,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,getDb:()=>db,encryptSecret:x=>x});
 exports.upsertConnection({storeId:'s',platform:'meta',accessToken:'old',expiresAt:100});exports.upsertConnection({storeId:'s',platform:'meta',accessToken:'new'});assert.equal(db.prepare('SELECT expires_at FROM connections').get().expires_at,100);exports.upsertConnection({storeId:'s',platform:'meta',accessToken:'system',expiresAt:null});assert.equal(db.prepare('SELECT expires_at FROM connections').get().expires_at,null);db.close();
});
test('validation outage keeps the saved connection; confirmed revocation updates status with a race guard',async()=>{
 for(const kind of ['unavailable','invalid']){const writes=[];const conn={access_token:'secret',metadata:JSON.stringify(info),last_synced:'2026-10-26T00:00:00Z'};const api=compile('src/app/api/lib/meta-connection-health.ts',{
  './tokens':{getMetaConnectionHealth:async()=>({conn,health:{status:'connected'}})},'./meta-token':{MetaTokenError:pure.MetaTokenError,inspectMetaToken:async()=>{throw new pure.MetaTokenError(kind);}},'./db':{},'./crypto':{},'./supabase-persistence':{isSupabasePersistenceEnabled:()=>true,rest:async(path,init)=>writes.push({path,body:JSON.parse(init.body)})},
 });if(kind==='unavailable'){await assert.rejects(()=>api.checkMetaConnection('s'));assert.equal(writes.length,0);}else{await api.checkMetaConnection('s');assert.equal(writes[0].path,'/rpc/workspace_meta_validate');assert.equal(writes[0].body.p_expected_synced,conn.last_synced);assert.equal(JSON.parse(writes[0].body.p_metadata).validation,'invalid');assert.equal('access_token' in writes[0].body,false);}}
});
test('Meta persistence sends encrypted credentials to the workspace RPC without copying ad-account selections',async()=>{
 const calls=[];
 const api=compile('src/app/api/lib/supabase-persistence.ts',{
  '@/app/api/lib/db':{},'crypto':{},'@/app/api/lib/crypto':{encryptSecret:x=>'encrypted:'+x,decryptSecret:x=>x},
 },{process:{env:{SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'}},Map,
 fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(null,{status:204});}});
 await api.upsertPersistentConnection({storeId:'store-a',platform:'meta',accessToken:'private',refreshToken:'refresh',accountId:'act_a',accountName:'Only A',expiresAt:null});
 assert.match(calls[0].url,/\/rpc\/workspace_meta_save$/);
 assert.equal(calls[0].body.p_connection.access_token,'encrypted:private');
 assert.equal(calls[0].body.p_connection.refresh_token,'encrypted:refresh');
 assert.equal(calls[0].body.p_connection.expires_at,null);
 assert.equal('account_id' in calls[0].body.p_connection,false);
 await api.deletePersistentConnection('store-a','meta');
 assert.match(calls[1].url,/\/rpc\/workspace_meta_disconnect$/);
 assert.equal(calls[1].body.p_store,'store-a');
});
test('shared disconnect rejects unauthorized requests before changing credentials',async()=>{
 let cleared=false;
 const denied=new Response('{}',{status:403});
 const api=compile('src/app/api/auth/disconnect/route.ts',{
  'next/server':{NextResponse:{json:(b,o)=>new Response(JSON.stringify(b),o)}},
  '@/app/api/lib/tokens':{clearToken:async()=>{cleared=true;}},
  '@/app/api/lib/profit-sheet-access':{sheetAccess:async()=>denied},
 });
 const r=await api.POST({json:async()=>({platform:'meta',storeId:'other-account-store'})});
 assert.equal(r.status,403);assert.equal(cleared,false);
});
