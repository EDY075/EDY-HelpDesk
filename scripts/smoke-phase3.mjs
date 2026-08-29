import assert from 'node:assert/strict';
// Local-only read smoke. A demo login is required; never print cookies or credentials.
const api = process.env.SMOKE_API_ORIGIN ?? 'http://127.0.0.1:8081';
const web = process.env.SMOKE_WEB_ORIGIN ?? 'http://127.0.0.1:4173';
for (const value of [api,web]) assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname), 'Smoke targets must be loopback');
const health = await fetch(`${api}/api/v1/health`); assert.equal(health.status,200);
const ready = await fetch(`${api}/api/v1/ready`); assert.equal(ready.status,200);
assert.equal((await fetch(web)).status,200);
assert.equal(process.env.PORTFOLIO_DEMO,'true','Demo smoke must not target operational accounts');
const login = await fetch(`${api}/api/v1/auth/login`,{method:'POST',headers:{origin:web,'content-type':'application/json'},body:JSON.stringify({username:'demo.admin',password:process.env.DEMO_SEED_PASSWORD})});
assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const session=await login.json();
async function get(path){const r=await fetch(`${api}/api/v1${path}`,{headers:{cookie}});assert.equal(r.status,200,path);const body=await r.json();assert.ok(!JSON.stringify(body).includes('credentialHash'),path);return body;}
const assets=await get('/assets');const articles=await get('/knowledge');const users=await get('/users');const tickets=await get('/tickets');
await get(`/assets/${assets.data[0].id}`);await get(`/knowledge/${articles.data[0].id}`);await get(`/users/${users.data[0].id}`);await get(`/tickets/${tickets.data[0].id}`);await get(`/tickets/${tickets.data[0].id}/knowledge`);await get('/overview');
const logout=await fetch(`${api}/api/v1/auth/logout`,{method:'POST',headers:{origin:web,cookie,'x-csrf-token':session.csrfToken}});assert.equal(logout.status,204);
console.log(JSON.stringify({result:'PASS',api:api,web:web,readRoutes:12,assets:assets.pagination.total,articles:articles.pagination.total,users:users.pagination.total,tickets:tickets.pagination.total}));
