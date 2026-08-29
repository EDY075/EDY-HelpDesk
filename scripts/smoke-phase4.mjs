import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const api=process.env.SMOKE_API_ORIGIN??'http://127.0.0.1:8081';
const web=process.env.SMOKE_WEB_ORIGIN??'http://127.0.0.1:4173';
for(const value of [api,web])assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname));
assert.equal(process.env.PORTFOLIO_DEMO,'true');
assert.equal((await fetch(api+'/api/v1/ready')).status,200);
assert.equal((await fetch(web)).status,200);
let readChecks=0,deniedChecks=0,syntheticResults=0;
for(const username of ['demo.admin','demo.viewer']){
  const login=await fetch(api+'/api/v1/auth/login',{method:'POST',headers:{origin:web,'content-type':'application/json'},body:JSON.stringify({username,password:process.env.DEMO_SEED_PASSWORD})});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),session=await login.json();
  const headers={origin:web,cookie,'content-type':'application/json','x-csrf-token':session.csrfToken};
  async function get(route){const response=await fetch(api+'/api/v1'+route,{headers});assert.equal(response.status,200);readChecks++;return response.json();}
  const catalog=await get('/diagnostics/catalog');assert.equal(catalog.mode,'Demo');assert.equal(catalog.liveExecutionEnabled,false);assert.equal(catalog.data.length,9);assert.ok(catalog.data.every(a=>a.requiresElevation===false&&!('scriptPath' in a)));
  const assets=await get('/assets?pageSize=50');let history;
  for(const asset of assets.data){const value=await get(`/assets/${asset.id}/diagnostics?pageSize=50`);if(value.data.length){history=value;break;}}
  assert.ok(history?.data.length>=9);
  for(const job of history.data){const detail=await get('/diagnostics/jobs/'+job.id);assert.equal(detail.sourceMode,'Demo');assert.equal(detail.engine,'Synthetic fixture');assert.ok(detail.result);if(username==='demo.viewer'){assert.equal(detail.result.payload,null);assert.deepEqual(detail.events,[]);}else syntheticResults++;}
  const deny=await fetch(api+`/api/v1/assets/${history.data[0].assetId}/diagnostics`,{method:'POST',headers:{...headers,'x-idempotency-key':randomUUID()},body:JSON.stringify({actionId:'windows.system.summary',parameters:{}})});assert.equal(deny.status,403);deniedChecks++;
  assert.equal((await fetch(api+'/api/v1/auth/logout',{method:'POST',headers,body:'{}'})).status,204);
}
console.log(JSON.stringify({phase4Smoke:'PASS',readChecks,deniedChecks,syntheticResults,realExecution:false}));
