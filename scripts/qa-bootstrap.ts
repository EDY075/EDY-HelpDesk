import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createPrismaClient} from '../apps/api/src/platform/prisma.js';
const root=process.cwd(),databaseUrl=`file:${path.join(root,'storage','operational',`bootstrap-qa-${Date.now()}`,'local.db')}`;
const env={...process.env,NODE_ENV:'test',API_HOST:'127.0.0.1',API_PORT:'8081',WEB_ORIGIN:'http://127.0.0.1:4173',LOG_LEVEL:'silent',PORTFOLIO_DEMO:'false',DATABASE_URL:databaseUrl,LOCAL_ADMIN_USERNAME:'admin.local',LOCAL_ADMIN_PASSWORD:randomBytes(32).toString('base64url')};
const invoke=(file:string,overrides:Record<string,string>={})=>spawnSync(process.execPath,['--import','tsx',file],{cwd:root,env:{...env,...overrides},shell:false,windowsHide:true,encoding:'utf8',timeout:30000}).status;
assert.equal(invoke('scripts/db-migrate.ts'),0);
assert.equal(invoke('scripts/bootstrap-local-operational.ts'),0);
assert.notEqual(invoke('scripts/bootstrap-local-operational.ts'),0);
assert.notEqual(invoke('scripts/bootstrap-local-operational.ts',{PORTFOLIO_DEMO:'true'}),0);
assert.notEqual(invoke('scripts/bootstrap-local-operational.ts',{DATABASE_URL:'file:./storage/edy-helpdesk.db'}),0);
const db=createPrismaClient(databaseUrl);
try{assert.equal(await db.account.count(),1);assert.equal(await db.diagnosticAction.count(),9);assert.equal(await db.diagnosticJob.count(),0);assert.equal(await db.auditEvent.count({where:{action:'deployment.operational_bootstrapped'}}),1);console.log(JSON.stringify({operationalBootstrap:'PASS',cases:4,overwrittenAccounts:0,diagnosticsExecuted:0}));}finally{await db.$disconnect();}
