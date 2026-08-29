import assert from "node:assert/strict";

const api=process.env.SMOKE_API_ORIGIN??"http://127.0.0.1:8081";
const web=process.env.SMOKE_WEB_ORIGIN??"http://127.0.0.1:4173";
for(const value of [api,web])assert.ok(["127.0.0.1","localhost","[::1]"].includes(new URL(value).hostname));
assert.equal(process.env.PORTFOLIO_DEMO,"true");
assert.equal((await fetch(api+"/api/v1/ready")).status,200);
assert.equal((await fetch(web)).status,200);
const login=await fetch(api+"/api/v1/auth/login",{method:"POST",headers:{origin:web,"content-type":"application/json"},body:JSON.stringify({username:"demo.admin",password:process.env.DEMO_SEED_PASSWORD})});
assert.equal(login.status,200);const session=await login.json();const headers={origin:web,cookie:login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; "),"content-type":"application/json","x-csrf-token":session.csrfToken};
let reads=0;for(const route of ["/dashboard?range=7d","/dashboard/overview?range=7d","/dashboard/support?range=30d","/dashboard/sla?range=30d","/dashboard/assets?range=30d","/dashboard/diagnostics?range=30d","/dashboard/knowledge?range=30d","/dashboard/security?range=30d","/dashboard/operations?range=7d","/reports?page=1&pageSize=10"]){const response=await fetch(api+"/api/v1"+route,{headers});assert.equal(response.status,200,route);const value=await response.json();assert.ok(value);reads+=1;}
const queued=await fetch(api+"/api/v1/reports",{method:"POST",headers,body:JSON.stringify({reportType:"TicketReport",format:"JSON",filters:{range:"30d"}})});assert.equal(queued.status,202);const job=await queued.json();let completed;for(let attempt=0;attempt<60;attempt+=1){await new Promise(resolve=>setTimeout(resolve,50));const history=await fetch(api+"/api/v1/reports?page=1&pageSize=100",{headers});const body=await history.json();completed=body.data.find(item=>item.id===job.id);if(completed&&!['Queued','Running'].includes(completed.status))break;}assert.equal(completed?.status,"Succeeded");assert.ok(completed.rowCount>=0);const download=await fetch(api+`/api/v1/reports/${job.id}/download`,{headers});assert.equal(download.status,200);const body=await download.json();assert.equal(body.schemaVersion,1);assert.equal(body.source,"edy-helpdesk");assert.ok(Array.isArray(body.records));assert.doesNotMatch(JSON.stringify(body),/password|credentialHash|tokenHash|raw stdout/iu);
console.log(JSON.stringify({phase6Smoke:"PASS",reads,reportStatus:completed.status,rowCount:completed.rowCount,externalIntegration:false}));
