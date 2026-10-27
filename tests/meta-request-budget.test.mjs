import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
function compile(file, dependencies={}, extras={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,console,Date,Map,Set,Headers,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,require:n=>{if(n in dependencies)return dependencies[n];throw Error(n)},...extras});return exports;
}
const budget=compile('src/app/api/lib/meta-request-budget.ts',{crypto,'./supabase-persistence':{}});
test('budget scopes cover app, credential hash and account without storing tokens',()=>{
 const keys=budget.budgetKeys('secret','/act_123/ads');assert.equal(keys[0],'app:onescale');assert.equal(keys[2],'account:123');assert.equal(keys.join().includes('secret'),false);
 assert.equal(budget.budgetKeys('other','/act_123/insights')[2],keys[2]);assert.notEqual(budget.budgetKeys('other','/act_123/insights')[1],keys[1]);
});
test('successful response headers signal pressure and development access before an error',()=>{
 const keys=budget.budgetKeys('secret','/act_123/ads');const h=new Headers({'x-app-usage':JSON.stringify({total_cputime:80,call_count:5}),'x-business-use-case-usage':JSON.stringify({'123':[{call_count:91,total_time:10,estimated_time_to_regain_access:20,ads_api_access_tier:'development_access'}]})});
 const p=budget.readMetaPressure(h,keys);assert.equal(p.find(x=>x.key===keys[0]).usage,80);assert.equal(p.find(x=>x.key===keys[1]).blockMs,1200000);assert.equal(p.find(x=>x.key==='account:123').tier,'development_access');
 assert.equal(budget.readMetaPressure(new Headers({'x-app-usage':'null','x-ad-account-usage':'bad'}),keys).length,0);
});
function client({reserved=true, responseStatus=200,pressure}={}) {
 const calls=[];const reservations=[];const observations=[];
 const api=compile('src/app/api/lib/meta-client.ts',{'./meta-request-budget':{
  budgetKeys:budget.budgetKeys,reserveMetaRequest:async keys=>{reservations.push(keys);return {reserved,waitMs:reserved?0:60000}},recordMetaPressure:async(...args)=>observations.push(args)
 }},{fetch:async(url,init)=>{calls.push({url:String(url),init});return {ok:responseStatus===200,status:responseStatus,headers:new Headers(pressure||{}),text:async()=>JSON.stringify({error:{code:17}}),json:async()=>({data:[{id:'1'}]})}}});
 return {api,calls,reservations,observations};
}
test('duplicate simultaneous reads share one provider request and do not expose token in URL',async()=>{
 const {api,calls,reservations}=client();const [a,b]=await Promise.all([api.fetchFromMeta('secret','/act_123/ads',{fields:'id'}),api.fetchFromMeta('secret','/act_123/ads',{fields:'id'})]);
 assert.equal(calls.length,1);assert.equal(reservations.length,1);assert.equal(calls[0].url.includes('secret'),false);assert.equal(calls[0].init.headers.Authorization,'Bearer secret');a.data[0].id='changed';assert.equal(b.data[0].id,'1');
});
test('shared cooldown prevents provider calls; real throttles are recorded once without rapid retries',async()=>{
 const blocked=client({reserved:false});await assert.rejects(blocked.api.fetchFromMeta('secret','/act_123/ads'),blocked.api.MetaRateLimitError);assert.equal(blocked.calls.length,0);
 const limited=client({responseStatus:429,pressure:{'retry-after':'1200'}});await assert.rejects(limited.api.fetchFromMeta('secret','/act_123/ads'),e=>e.retryAfterMs===1200000);assert.equal(limited.calls.length,1);assert.equal(limited.observations[0][2],1200000);
});
test('scheduled Meta routes default to bounded batches, independent of request headers',()=>{
 for(const file of ['src/app/api/sync/cron/route.ts','src/app/api/cron/sync-meta-spend/route.ts','src/app/api/cron/materialize-meta-entities/route.ts']) {
  const source=fs.readFileSync(file,'utf8');const expression=source.match(/const autoMode = (.*);/)[1];const evaluate=(full,auto,store)=>vm.runInNewContext(expression,{forceAll:full,explicitAuto:auto,requestedStoreId:store});
  assert.equal(evaluate(false,false,''),true);assert.equal(evaluate(true,false,''),false);assert.equal(evaluate(false,false,'store'),false);
 }
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));for(const path of ['/api/sync/cron','/api/cron/sync-meta-spend','/api/cron/materialize-meta-entities']) assert.ok(config.crons.some(c=>c.path===path+'?auto=1'));
});
test('deferred report updates retain saved figures; first sync still publishes Shopify data',async()=>{
 for(const hasSaved of [true,false]) {
  const writes=[];class Deferred extends Error {retryAfterMs=900000;}
  const api=compile('src/app/api/lib/profit-sheet-sync.ts',{
   'date-fns-tz':{fromZonedTime:x=>new Date(x),formatInTimeZone:()=> '2020-01-01'},
   './supabase-persistence':{rest:async(path,init)=>{if(init){writes.push({path,body:JSON.parse(init.body)});return null;}return hasSaved?[{date:'2020-01-01'}]:[];}},
   './profit-sheet-repository':{loadConfig:async()=>({version:1,products:[],accounts:[{adAccountId:'act_1',name:'A',currency:'USD',timezone:'UTC',start:'2019-01-01T00:00Z',active:true,accessToken:'secret'}]})},
   './shopify-client':{fetchFromShopify:async(_t,_d,endpoint)=>endpoint==='/shop.json'?{shop:{currency:'USD'}}:{orders:[]}},
   './tokens':{getShopifyToken:async()=>({shopDomain:'shop.test',accessToken:'secret'})},
   './meta-client':{MetaRateLimitError:Deferred,fetchFromMeta:async()=>{throw new Deferred()}},
   './profit-sheet-access':{safeSheetError:()=> 'Queued'},
   '@/lib/profit-sheet/model':{dayWindow:()=>({start:'2020-01-01T06:00:00Z',end:'2020-01-02T06:00:00Z'})},
   '@/lib/profit-sheet/aggregate':{aggregateOrders:()=>new Map([['store',{revenue:0,adSpend:null}]]),attachAds:()=>{},hourWeight:()=>1},
   './profit-sheet-finance':{syncFinance:async()=>({shopifyFees:0})},
   './profit-sheet-attribution':{},'@/lib/profit-sheet/attribution':{attributedRevenue:()=>null},
  });
  const result=await api.syncSheetDay({store_id:'s',date:'2020-01-01',lease_id:'lease'});
  assert.equal(result.deferred,true);assert.equal(result.ok,true);
  assert.equal(writes.some(x=>x.path==='/rpc/profit_sheet_publish_attribution'),!hasSaved);
  assert.equal(writes.at(-1).body.status,'queued');assert.ok(writes.at(-1).body.retry_at);
 }
});
