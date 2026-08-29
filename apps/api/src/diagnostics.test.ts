import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import argon2 from 'argon2';
import type {Express} from 'express';
import {catalogDefinitions,syntheticDiagnostic,diagnosticScriptHash} from '@edy/contracts';
import type {AppConfig} from '@edy/config';
import {testDatabase} from './test-database.js';
import type {DatabaseClient} from './platform/prisma.js';
import {createApp} from './app.js';
import {createAuditRepository} from './modules/audit/audit-repository.js';
import {ensureDeploymentMode,installDiagnosticCatalog,localFingerprint} from './modules/diagnostics/catalog.js';
import {resetLoginRateLimitsForTests} from './modules/auth/auth-routes.js';
import {processJob,purgeDiagnosticData,redactEventText,createJobLoop,type Runner} from '../../diagnostics-worker/src/processor.js';
import {ExecutionFailure} from '../../diagnostics-worker/src/process-runner.js';
import {seedDatabase} from '../../../prisma/seed.js';

const origin='http://127.0.0.1:5173';
const config:AppConfig={NODE_ENV:'test',API_HOST:'127.0.0.1',API_PORT:8080,WEB_ORIGIN:origin,DATABASE_PROVIDER:'sqlite',DATABASE_URL:'file:test',LOG_LEVEL:'silent',PORTFOLIO_DEMO:false,SESSION_IDLE_MINUTES:30,SESSION_ABSOLUTE_HOURS:12,INTEGRATION_SENTINEL_ENABLED:false,INTEGRATION_SIEM_ENABLED:false,INTEGRATION_ANALYTICS_ENABLED:false,INTEGRATION_TIMEOUT_MS:3000,INTEGRATION_MAX_ATTEMPTS:5,INTEGRATION_BACKOFF_BASE_MS:1000};
let db:DatabaseClient,app:Express,demo:Express,assetId:string,admin:Session,tech:Session,viewer:Session,departmentId:string;
type Session={agent:ReturnType<typeof request.agent>;csrf:string;id:string};
function makeApp(demoMode=false){return createApp({logger:pino({level:'silent'}),webOrigin:origin,jsonLimit:'64kb',version:'test',checkDatabase:async()=>{},prisma:db,audit:createAuditRepository(db),config:{...config,PORTFOLIO_DEMO:demoMode}});}
async function send(s:Session,route:string,body:unknown,key=randomUUID()){return s.agent.post('/api/v1'+route).set('origin',origin).set('x-csrf-token',s.csrf).set('x-idempotency-key',key).send(body as object);}
const enqueue=(s=tech,actionId='windows.system.summary',parameters:unknown={})=>send(s,`/assets/${assetId}/diagnostics`,{actionId,parameters});
const success:Runner=async action=>({stdout:JSON.stringify({...syntheticDiagnostic(action),engine:'PowerShell 7.5.0'}),exitCode:0,outputBytes:100,durationMs:10});
async function run(id:string,runner:Runner=success){const job=await db.diagnosticJob.update({where:{id},data:{status:'Running',owner:'test-worker',startedAt:new Date()}});await processJob(db,job,config,runner,new AbortController().signal);return db.diagnosticJob.findUniqueOrThrow({where:{id},include:{result:true}});}
beforeAll(async()=>{
  db=await testDatabase();await ensureDeploymentMode(db,config);await installDiagnosticCatalog(db);
  departmentId=(await db.department.create({data:{code:'LOCAL-QA',name:'Local diagnostic tests'}})).id;
  app=makeApp();demo=makeApp(true);resetLoginRateLimitsForTests();
  const credentialHash=await argon2.hash(process.env.DEMO_SEED_PASSWORD!,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  async function session(role:'Admin'|'Technician'|'Viewer'){
    const account=await db.account.create({data:{username:`test.${role.toLowerCase()}`,role,credentialHash}}),agent=request.agent(app);
    const login=await agent.post('/api/v1/auth/login').set('origin',origin).send({username:account.username,password:process.env.DEMO_SEED_PASSWORD});expect(login.status).toBe(200);return {agent,csrf:login.body.csrfToken as string,id:account.id};
  }
  admin=await session('Admin');tech=await session('Technician');viewer=await session('Viewer');
});
beforeEach(async()=>{
  await db.diagnosticJob.updateMany({where:{status:{in:['Queued','Running']}},data:{status:'Cancelled',completedAt:new Date()}});
  // Move previous requests outside the rate-limit window without deleting fixture history.
  await db.diagnosticJob.updateMany({data:{requestedAt:new Date(Date.now()-600_000)}});
  await db.diagnosticAction.updateMany({data:{enabled:true,requiresElevation:false,scriptHash:diagnosticScriptHash}});
  const id=randomUUID();assetId=(await db.asset.create({data:{id,assetCode:`AST-QA-${id}`,assetTag:`TEST-${id}`,name:'Synthetic isolated test endpoint',assetType:'Laptop',departmentId}})).id;
  await db.localEndpoint.upsert({where:{id:'local'},create:{id:'local',assetId,fingerprint:localFingerprint(),registeredBy:admin.id},update:{assetId,fingerprint:localFingerprint()}});
  await db.diagnosticWorkerState.upsert({where:{id:'local'},create:{id:'local',owner:'test',fingerprint:localFingerprint(),heartbeatAt:new Date(),leaseUntil:new Date(Date.now()+60000),ready:true},update:{fingerprint:localFingerprint(),heartbeatAt:new Date(),leaseUntil:new Date(Date.now()+60000),ready:true}});
});
afterAll(async()=>{await db.$disconnect();});
describe('Phase 4 transactional and worker ownership regressions',()=>{
  it('stores inspectable strict output JSON schemas for all nine actions',async()=>{const rows=await db.diagnosticAction.findMany();expect(rows).toHaveLength(9);for(const row of rows){const schema=row.outputSchema as {oneOf:Array<{additionalProperties:boolean;properties:{actionId:{const:string}}}>};expect(schema.oneOf).toHaveLength(2);expect(schema.oneOf[0]?.additionalProperties).toBe(false);expect(schema.oneOf[0]?.properties.actionId.const).toBe(row.actionId);}});
  it('hides expired detailed results before the next purge',async()=>{const q=await enqueue();const j=await run(q.body.id);await db.diagnosticResult.update({where:{id:j.result!.id},data:{expiresAt:new Date(0)}});const list=await tech.agent.get(`/api/v1/assets/${assetId}/diagnostics`);expect(list.body.data[0].result).toBeNull();expect((await tech.agent.get(`/api/v1/diagnostics/jobs/${j.id}`)).body.result).toBeNull();});
  it('rolls back success and result when success audit persistence fails',async()=>{await db.$executeRawUnsafe("CREATE TRIGGER qa_reject_success BEFORE INSERT ON AuditEvent WHEN NEW.action = 'diagnostic.succeeded' BEGIN SELECT RAISE(ABORT, 'qa'); END");try{const q=await enqueue();const j=await run(q.body.id);expect(j.status).toBe('Failed');expect(j.result).toBeNull();expect(await db.auditEvent.count({where:{resourceId:j.id,action:'diagnostic.failed'}})).toBe(1);}finally{await db.$executeRawUnsafe('DROP TRIGGER qa_reject_success');}});
  it('redacts IPv6 event text without damaging timestamps',()=>{const r=redactEventText('Address 2001:db8::12 at 12:35:59');expect(r.text).toBe('Address [redacted] at 12:35:59');});
  it('allows one of two workers to claim, then cancels Running through the API',async()=>{
    const queued=await enqueue();expect(queued.status).toBe(202);
    await db.diagnosticWorkerState.update({where:{id:'local'},data:{leaseUntil:new Date(0)}});
    let calls=0;const errors:string[]=[];
    const runner:Runner=async(_action,_params,signal)=>{calls++;await new Promise<void>((_resolve,reject)=>{if(signal.aborted)reject(new ExecutionFailure('CANCELLED'));else signal.addEventListener('abort',()=>reject(new ExecutionFailure('CANCELLED')),{once:true});});throw new Error('unreachable');};
    const a=createJobLoop(db,config,process.cwd(),'powershell.exe',code=>errors.push(code),runner),b=createJobLoop(db,config,process.cwd(),'powershell.exe',code=>errors.push(code),runner);
    a.start();b.start();
    const until=async(predicate:()=>Promise<boolean>)=>{for(let i=0;i<60;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Worker state deadline');};
    try{await until(async()=>calls===1);await new Promise(resolve=>setTimeout(resolve,650));expect(calls).toBe(1);expect(await db.auditEvent.count({where:{resourceId:queued.body.id,action:'diagnostic.started'}})).toBe(1);expect((await send(tech,`/diagnostics/jobs/${queued.body.id}/cancel`,{})).status).toBe(202);await until(async()=>(await db.diagnosticJob.findUnique({where:{id:queued.body.id}}))?.status==='Cancelled');expect(await db.auditEvent.count({where:{resourceId:queued.body.id,action:'diagnostic.cancelled'}})).toBe(1);expect(errors).toEqual([]);}finally{await a.stop();await b.stop();}
  });
});
describe('Phase 4 API and persistence',()=>{
  it('lists nine actions without internal paths or arbitrary arguments',async()=>{const r=await tech.agent.get('/api/v1/diagnostics/catalog');expect(r.status).toBe(200);expect(r.body.data).toHaveLength(9);expect(JSON.stringify(r.body)).not.toMatch(/scriptPath|rawArgs|collect\.ps1/);});
  it('denies unauthenticated diagnostic requests',async()=>expect((await request(app).post(`/api/v1/assets/${assetId}/diagnostics`).set('origin',origin).send({actionId:'windows.system.summary',parameters:{}})).status).toBe(401));
  it('denies Viewer execution and records diagnostic denied',async()=>{expect((await enqueue(viewer)).status).toBe(403);expect(await db.auditEvent.count({where:{actorId:viewer.id,action:'diagnostic.denied'}})).toBeGreaterThan(0);});
  it('denies Demo execution even with an authorized account',async()=>{const login=await request(demo).post('/api/v1/auth/login').set('origin',origin).send({username:'test.admin',password:process.env.DEMO_SEED_PASSWORD});const r=await request(demo).post(`/api/v1/assets/${assetId}/diagnostics`).set('origin',origin).set('Cookie',login.headers['set-cookie'] as unknown as string[]).set('x-csrf-token',login.body.csrfToken).set('x-idempotency-key',randomUUID()).send({actionId:'windows.system.summary',parameters:{}});expect(r.status).toBe(403);});
  it.each(['command','scriptPath','powershellCommand','script','executable','shell','rawArgs','arbitraryArgs'])('rejects a top-level %s field',async field=>expect((await send(tech,`/assets/${assetId}/diagnostics`,{actionId:'windows.system.summary',parameters:{},[field]:'ignored?'})).status).toBe(400));
  it('rejects unknown actions',async()=>expect((await enqueue(tech,'arbitrary.run')).status).toBe(400));
  it('rejects disabled and elevated actions',async()=>{await db.diagnosticAction.updateMany({where:{actionId:'windows.system.summary'},data:{enabled:false}});expect((await enqueue()).status).toBe(403);await db.diagnosticAction.updateMany({where:{actionId:'windows.system.summary'},data:{enabled:true,requiresElevation:true}});expect((await enqueue()).status).toBe(403);});
  it('rejects catalog hash mismatch',async()=>{await db.diagnosticAction.updateMany({where:{actionId:'windows.system.summary'},data:{scriptHash:'f'.repeat(64)}});expect((await enqueue()).status).toBe(403);});
  it('rejects nonlocal assets and archived endpoints',async()=>{await db.localEndpoint.update({where:{id:'local'},data:{fingerprint:'not-this-host'}});expect((await enqueue()).status).toBe(403);await db.localEndpoint.update({where:{id:'local'},data:{fingerprint:localFingerprint()}});await db.asset.update({where:{id:assetId},data:{archivedAt:new Date()}});expect((await enqueue()).status).toBe(400);});
  it('validates Event Log enums, limits and no free XPath',async()=>{expect((await enqueue(tech,'eventlog.query',{logName:'Security',level:'Error',timeWindow:'1h',limit:10})).status).toBe(400);expect((await enqueue(tech,'eventlog.query',{logName:'System',level:'Error',timeWindow:'1h',limit:101})).status).toBe(400);expect((await enqueue(tech,'eventlog.query',{logName:'Application',level:'Warning',timeWindow:'7d',limit:100,xpath:'*'})).status).toBe(400);});
  it('queues a version/hash snapshot with audit and idempotency',async()=>{const key=randomUUID(),body={actionId:'windows.system.summary',parameters:{}};const a=await send(tech,`/assets/${assetId}/diagnostics`,body,key),b=await send(tech,`/assets/${assetId}/diagnostics`,body,key);expect(a.status).toBe(202);expect(b.status).toBe(200);expect(a.body.id).toBe(b.body.id);expect(a.body.scriptHash).toBe(diagnosticScriptHash);expect(await db.auditEvent.count({where:{action:'diagnostic.requested',resourceId:a.body.id}})).toBe(1);});
  it('requires an idempotency key and CSRF',async()=>{expect((await tech.agent.post(`/api/v1/assets/${assetId}/diagnostics`).set('origin',origin).send({actionId:'windows.system.summary',parameters:{}})).status).toBe(403);});
  it('allows only one active job per asset under concurrent requests',async()=>{const results=await Promise.all([enqueue(),enqueue()]);expect(results.map(r=>r.status).sort()).toEqual([202,409]);});
  it('limits a user to ten requests in five minutes',async()=>{for(let i=0;i<10;i++){const r=await enqueue();expect(r.status).toBe(202);await send(tech,`/diagnostics/jobs/${r.body.id}/cancel`,{});}expect((await enqueue()).status).toBe(429);});
  it('cancels queued jobs durably',async()=>{const q=await enqueue();expect((await send(tech,`/diagnostics/jobs/${q.body.id}/cancel`,{})).status).toBe(202);expect((await db.diagnosticJob.findUniqueOrThrow({where:{id:q.body.id}})).status).toBe('Cancelled');});
  it('requires the requester or Admin for cancellation',async()=>{const q=await enqueue(admin);expect((await send(tech,`/diagnostics/jobs/${q.body.id}/cancel`,{})).status).toBe(403);});
  it('persists validated results, findings, engine and history',async()=>{const q=await enqueue();const j=await run(q.body.id);expect(j.status).toBe('Succeeded');expect(j.result?.ruleVersion).toBe(1);expect(j.engine).toBe('PowerShell 7.5.0');const h=await tech.agent.get(`/api/v1/assets/${assetId}/diagnostics`);expect(h.body.data[0].result.id).toBe(j.result?.id);});
  it('does not expose raw result payloads to Viewer',async()=>{const q=await enqueue();await run(q.body.id);const r=await viewer.agent.get(`/api/v1/diagnostics/jobs/${q.body.id}`);expect(r.status).toBe(200);expect(r.body.result.payload).toBeNull();expect(r.body.events).toEqual([]);});
  it.each(['TIMEOUT','OUTPUT_LIMIT','PROCESS_FAILED','SCRIPT_INTEGRITY_FAILURE'])('persists %s safely',async code=>{const q=await enqueue(),j=await run(q.body.id,async()=>{throw new ExecutionFailure(code);});expect(j.status).toBe(code==='TIMEOUT'?'TimedOut':'Failed');expect(j.errorCode).toBe(code);expect(j.result).toBeNull();});
  it('rejects invalid JSON output and audits validation failure',async()=>{const q=await enqueue(),j=await run(q.body.id,async()=>({stdout:'not json',outputBytes:8,durationMs:1,exitCode:0}));expect(j.status).toBe('Failed');expect(j.errorCode).toBe('OUTPUT_VALIDATION_FAILURE');expect(await db.auditEvent.count({where:{resourceId:j.id,action:'diagnostic.output_validation_failure'}})).toBe(1);});
  it('rechecks disabled actions at execution time',async()=>{const q=await enqueue();await db.diagnosticAction.updateMany({where:{actionId:'windows.system.summary'},data:{enabled:false}});let calls=0;const j=await run(q.body.id,async(...args)=>{calls++;return success(...args);});expect(j.status).toBe('Failed');expect(calls).toBe(0);});
  it('honors cancellation before committing output',async()=>{const q=await enqueue();const j=await run(q.body.id,async(...args)=>{await db.diagnosticJob.update({where:{id:q.body.id},data:{cancelRequestedAt:new Date()}});return success(...args);});expect(j.status).toBe('Cancelled');expect(j.result).toBeNull();});
  it('keeps Event messages in the 30-day table, with pagination and redaction',async()=>{const q=await enqueue(tech,'eventlog.query',{logName:'System',level:'Warning',timeWindow:'1h',limit:50});await run(q.body.id);const r=await tech.agent.get(`/api/v1/diagnostics/jobs/${q.body.id}?pageSize=1`);expect(r.body.events).toHaveLength(1);expect(r.body.pagination.total).toBe(2);expect(r.body.result.payload.data.events).toEqual([]);});
  it('redacts profile paths, addresses and credentials from untrusted messages',()=>{const r=redactEventText('User C:\\Users\\SyntheticUser\\file.txt 192.0.2.14 02:00:00:00:00:14 token=example-value user@example.invalid '+'workstation'+'.corp');expect(r.text).not.toMatch(/SyntheticUser|192\.0\.2\.14|02:00:00|example-value|user@example|workstation\.corp/);expect(r.count).toBeGreaterThan(4);});
  it('rejects mode switching and synthetic seeding of operational storage',async()=>{await expect(ensureDeploymentMode(db,{...config,PORTFOLIO_DEMO:true})).rejects.toThrow('DEPLOYMENT_MODE_MISMATCH');await expect(seedDatabase(db)).rejects.toThrow('DEMO_SEED_DENIED');});
  it('requires Admin and an optimistic asset version for registration',async()=>{expect((await send(tech,'/diagnostics/local-endpoint',{assetId,version:1})).status).toBe(403);expect((await send(admin,'/diagnostics/local-endpoint',{assetId,version:99})).status).toBe(409);expect((await send(admin,'/diagnostics/local-endpoint',{assetId,version:1})).status).toBe(200);});
  it('purges expired detail in bounded batches while preserving audit',async()=>{const q=await enqueue();const j=await run(q.body.id);await db.diagnosticResult.update({where:{id:j.result!.id},data:{expiresAt:new Date(0)}});const before=await db.auditEvent.count();const result=await purgeDiagnosticData(db);expect(result.results).toBe(1);expect(await db.auditEvent.count()).toBe(before+1);expect(await db.diagnosticJob.findUnique({where:{id:j.id}})).not.toBeNull();});
  it('retains a fixed nine-action catalog after repeated install',async()=>{await installDiagnosticCatalog(db);expect(await db.diagnosticAction.count()).toBe(catalogDefinitions.length);});
});
