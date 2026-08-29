import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import argon2 from 'argon2';
import pino from 'pino';
import {catalogDefinitions} from '@edy/contracts';
import type {AppConfig} from '@edy/config';
import {createApp} from '../apps/api/src/app.js';
import {createPrismaClient} from '../apps/api/src/platform/prisma.js';
import {createAuditRepository} from '../apps/api/src/modules/audit/audit-repository.js';
import {ensureDeploymentMode,installDiagnosticCatalog} from '../apps/api/src/modules/diagnostics/catalog.js';
import {checkProcessHost,resolveEngine,minimalEnvironment} from '../apps/diagnostics-worker/src/process-runner.js';

// Real, explicitly invoked local QA. No real output is printed or copied into fixtures.
assert.equal(process.platform,'win32');
const root=process.cwd(),engine=await resolveEngine(),engineLabel=engine.toLowerCase().endsWith('pwsh.exe')?'ps7':'ps51';
await checkProcessHost(root);
const directory=path.join(root,'storage','operational-qa',`${Date.now()}-${engineLabel}`);await mkdir(directory,{recursive:true});
const databaseUrl=`file:${path.join(directory,'local.db')}`;
const migrate=spawnSync(process.execPath,['--import','tsx','scripts/db-migrate.ts'],{cwd:root,env:{...process.env,DATABASE_URL:databaseUrl},shell:false,windowsHide:true,encoding:'utf8',timeout:30000});assert.equal(migrate.status,0,'Isolated operational migration must pass');
const config:AppConfig={NODE_ENV:'test',API_HOST:'127.0.0.1',API_PORT:0,WEB_ORIGIN:'http://127.0.0.1:4173',DATABASE_PROVIDER:'sqlite',DATABASE_URL:databaseUrl,LOG_LEVEL:'silent',PORTFOLIO_DEMO:false,SESSION_IDLE_MINUTES:30,SESSION_ABSOLUTE_HOURS:12,INTEGRATION_SENTINEL_ENABLED:false,INTEGRATION_SIEM_ENABLED:false,INTEGRATION_ANALYTICS_ENABLED:false,INTEGRATION_TIMEOUT_MS:3000,INTEGRATION_MAX_ATTEMPTS:5,INTEGRATION_BACKOFF_BASE_MS:1000};
const db=createPrismaClient(databaseUrl);await ensureDeploymentMode(db,config);await installDiagnosticCatalog(db);
const password=randomBytes(32).toString('base64url');
await db.account.create({data:{username:'qa.local',role:'Admin',credentialHash:await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1})}});
const department=await db.department.create({data:{code:'LOCAL',name:'Local operations'}});
const app=createApp({logger:pino({level:'silent'}),webOrigin:config.WEB_ORIGIN,jsonLimit:'64kb',version:'phase4-qa',checkDatabase:async()=>{},prisma:db,audit:createAuditRepository(db),config});
const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}/api/v1`;
const worker=spawn(process.execPath,['apps/diagnostics-worker/dist/index.js'],{cwd:root,env:{...minimalEnvironment(),NODE_ENV:'development',API_HOST:'127.0.0.1',API_PORT:String(address.port),WEB_ORIGIN:config.WEB_ORIGIN,DATABASE_URL:databaseUrl,LOG_LEVEL:'silent',PORTFOLIO_DEMO:'false',DIAGNOSTICS_ENGINE_PATH:engine},stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true});
// Consume bounded generic logs; never persist or echo engine output/error text.
worker.stdout.resume();worker.stderr.resume();
const rows:Array<Record<string,unknown>>=[];
const wait=()=>new Promise(resolve=>setTimeout(resolve,150));
try{
  const deadline=Date.now()+15000;while(Date.now()<deadline){const s=await db.diagnosticWorkerState.findUnique({where:{id:'local'}});if(s?.ready&&s.leaseUntil>new Date())break;if(worker.exitCode!==null)throw new Error('Worker exited before readiness');await wait();}
  assert.ok((await db.diagnosticWorkerState.findUnique({where:{id:'local'}}))?.ready,'Worker must be ready');
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{origin:config.WEB_ORIGIN,'content-type':'application/json'},body:JSON.stringify({username:'qa.local',password})});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),session=await login.json() as {csrfToken:string};
  async function post(route:string,body:unknown){return fetch(base+route,{method:'POST',headers:{origin:config.WEB_ORIGIN,cookie,'content-type':'application/json','x-csrf-token':session.csrfToken,'x-idempotency-key':randomUUID()},body:JSON.stringify(body)});}
  const assetResponse=await post('/assets',{name:'Authorized local Windows endpoint',type:'Desktop',departmentId:department.id});assert.equal(assetResponse.status,201);const asset=await assetResponse.json() as {id:string;version:number};
  assert.equal((await post('/diagnostics/local-endpoint',{assetId:asset.id,version:asset.version})).status,200);
  const requests=[...catalogDefinitions.filter(a=>a.actionId!=='eventlog.query').map(a=>({actionId:a.actionId,parameters:{}})),...(['System','Application'] as const).map(logName=>({actionId:'eventlog.query',parameters:{logName,level:'Warning',timeWindow:'24h',limit:10}}))];
  for(const item of requests){
    const response=await post(`/assets/${asset.id}/diagnostics`,item);assert.equal(response.status,202,`${item.actionId} enqueue`);const queued=await response.json() as {id:string};
    const until=Date.now()+35000;let job;while(Date.now()<until){job=await db.diagnosticJob.findUnique({where:{id:queued.id},include:{result:true}});if(job&&!['Queued','Running'].includes(job.status))break;await wait();}
    assert.ok(job&&!['Queued','Running'].includes(job.status),'Job must finish within bounded time');
    const payload=job.result?.payload as {availability?:string}|null;
    const row={actionId:item.actionId,logName:'logName' in item.parameters?item.parameters.logName:null,status:job.status,availability:payload?.availability??null,errorCode:job.errorCode,engine:job.engine,durationMs:job.durationMs,outputBytes:job.outputBytes};rows.push(row);console.log(JSON.stringify(row));
  }
  assert.equal((await post('/auth/logout',{})).status,204);
  await writeFile(path.join(directory,'summary.json'),JSON.stringify({engine:engineLabel,rows},null,2));
  const supported=rows.filter(r=>r.status==='Succeeded'&&r.availability==='Supported').length;
  console.log(JSON.stringify({realQa:engineLabel,total:rows.length,supported,limited:rows.filter(r=>r.status==='Succeeded'&&r.availability!=='Supported').length,failed:rows.filter(r=>r.status!=='Succeeded').length,rawDataPrinted:false}));
  assert.equal(rows.filter(r=>r.status!=='Succeeded').length,0,'One or more real collections failed; inspect only the private operational QA database.');
}finally{
  worker.kill();await new Promise<void>(resolve=>{if(worker.exitCode!==null)resolve();else worker.once('close',()=>resolve());});
  await new Promise<void>(resolve=>server.close(()=>resolve()));await db.$disconnect();
}
