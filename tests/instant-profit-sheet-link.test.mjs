import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),{NextRequest,NextResponse}=require('next/server');
function compile(file,deps,extras={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,Promise,require:n=>{if(n in deps)return deps[n];throw Error(n)},...extras});return exports;}
test('link response contains committed Profit Sheet config without waiting for discovery or cleanup',async()=>{
 const tasks=[],calls=[],config={version:5,accounts:[{adAccountId:'act_1'}],products:[]};
 const api=compile('src/app/api/settings/stores/ad-accounts/route.ts',{
  'next/server':{NextRequest,NextResponse,after:f=>tasks.push(f)},
  '@/app/api/lib/profit-sheet-access':{sheetAccess:async()=>null},
  '@/app/api/lib/profit-sheet-kick':{kickProfitSheetDiscovery:id=>calls.push(['dispatch',id])},
  '@/app/api/lib/profit-sheet-repository':{loadConfig:async()=>config,publicConfig:x=>x},
  '@/app/api/lib/db':{getStore:()=>({}),addStoreAdAccount:x=>({ad_account_id:x.adAccountId,is_active:1})},
  '@/app/api/lib/supabase-persistence':{isSupabasePersistenceEnabled:()=>true,upsertPersistentStoreAdAccount:async()=>calls.push(['commit']),listPersistentStoreAdAccounts:async()=>[{ad_account_id:'act_1',is_active:1}],prunePersistentStoreMetaDataToActiveAccounts:async()=>calls.push(['cleanup'])},
 });
 const r=await api.POST(new NextRequest('https://example.test/api/settings/stores/ad-accounts',{method:'POST',body:JSON.stringify({storeId:'s',adAccountId:'act_1',adAccountName:'Account'})}));
 assert.equal(r.status,200);assert.deepEqual((await r.json()).profitSheet,config);
 assert.deepEqual(calls,[['commit'],['dispatch','s']]);assert.equal(tasks.length,1);
 await tasks[0]();assert.equal(calls.at(-1)[0],'cleanup');
});
test('a link cancels stale config reads, installs the server snapshot, and refreshes only that store',async()=>{
 const calls=[];const cache=compile('src/lib/profit-sheet/client-cache.ts',{'@/lib/queryClient':{getQueryClient:()=>({cancelQueries:async x=>calls.push(['cancel',x.queryKey]),setQueryData:(key,data)=>calls.push(['set',key,data]),invalidateQueries:async x=>calls.push(['invalidate',x.queryKey])})}});
 await cache.refreshLinkedSheet('s',{version:5,accounts:[{adAccountId:'act_1'}]});
 assert.equal(calls[0][0],'cancel');assert.equal(calls[1][0],'set');assert.equal(calls[1][2].version,5);
 assert.ok(calls.every(x=>x[1][1]==='s'));assert.ok(calls.some(x=>x[1][0]==='profit-sheet-status'));
});
test('immediate discovery is scheduled after the response and uses the durable claim worker',async()=>{
 const tasks=[],calls=[];const api=compile('src/app/api/lib/profit-sheet-kick.ts',{'next/server':{after:f=>tasks.push(f)},'./profit-sheet-discovery':{processDiscovery:async id=>calls.push(id)}});
 api.kickProfitSheetDiscovery('s');assert.equal(calls.length,0);await tasks[0]();assert.deepEqual(calls,['s']);
});

test('relinking explicitly reactivates a previously disabled persistent account',async()=>{
 const writes=[];
 const api=compile('src/app/api/lib/supabase-persistence.ts',{'@/app/api/lib/db':{},'@/app/api/lib/crypto':{},crypto:require('node:crypto')},{process:{env:{SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-key'}},fetch:async(url,init)=>{writes.push(JSON.parse(init.body));return {ok:true,status:204}}});
 await api.upsertPersistentStoreAdAccount({storeId:'s',adAccountId:'act_1',adAccountName:'Account'});
 assert.equal(writes[0][0].is_active,true);assert.equal(writes[0][0].store_id,'s');
});
test('full sync status is authorized per store and does not call providers',async()=>{
 const reads=[];let denied=true;
 const api=compile('src/app/api/profit-sheet/status/route.ts',{
  'next/server':{NextRequest},
  '@/app/api/lib/profit-sheet-access':{sheetAccess:async()=>denied?NextResponse.json({error:'Denied'},{status:403}):null,sheetJson:x=>NextResponse.json(x),safeSheetError:()=> 'Unavailable'},
  '@/app/api/lib/supabase-persistence':{rest:async(path,init)=>{reads.push([path,JSON.parse(init.body)]);return {stage:'reports',lastCompletedAt:null}}},
 });
 const req=()=>new NextRequest('https://example.test/api/profit-sheet/status?storeId=s');
 assert.equal((await api.GET(req())).status,403);assert.equal(reads.length,0);
 denied=false;assert.equal((await api.GET(req())).status,200);assert.deepEqual(reads,[['/rpc/profit_sheet_sync_status',{p_store:'s'}]]);
});
