import assert from 'node:assert/strict';
import {existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import argon2 from 'argon2';
import {loadConfig} from '@edy/config';
import {createPrismaClient,normalizeDatabaseUrl} from '../apps/api/src/platform/prisma.js';
import {ensureDeploymentMode,installDiagnosticCatalog} from '../apps/api/src/modules/diagnostics/catalog.js';

// Explicit operator bootstrap, never called by API, Worker, seed or browser.
const config=loadConfig();
assert.equal(config.PORTFOLIO_DEMO,false,'Use a dedicated Operational environment, never the Demo database.');
const root=realpathSync(process.cwd()),databaseUrl=normalizeDatabaseUrl(config.DATABASE_URL);
assert.ok(databaseUrl.startsWith('file:'),'Only local SQLite is supported by this bootstrap.');
const filename=path.resolve(databaseUrl.slice(5));
const allowed=path.join(root,'storage','operational');
assert.ok(filename.startsWith(allowed+path.sep),'Operational bootstrap requires storage/operational/.');
assert.ok(existsSync(filename),'Run the migration command with the dedicated environment first.');
assert.ok(realpathSync(filename).startsWith(allowed+path.sep),'Database must not resolve through a link outside operational storage.');
const username=process.env.LOCAL_ADMIN_USERNAME??'admin.local';
const password=process.env.LOCAL_ADMIN_PASSWORD;
assert.match(username,/^[a-zA-Z0-9._-]{3,64}$/);
assert.ok(password&&password.length>=12&&password.length<=128,'Provide a private LOCAL_ADMIN_PASSWORD of 12–128 characters.');
assert.ok(!/^(?:<.*>|placeholder|change-me)$/i.test(password),'Replace documentation placeholders with a private password.');
const db=createPrismaClient(databaseUrl);
try{
  await ensureDeploymentMode(db,config);
  const credentialHash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  await db.$transaction(async tx=>{
    assert.equal(await tx.account.count(),0,'Bootstrap refuses to replace any existing account.');
    const account=await tx.account.create({data:{username,role:'Admin',credentialHash}});
    await tx.department.create({data:{code:'LOCAL',name:'Local operations'}});
    await tx.ticketCategory.create({data:{code:'LOCAL-SUPPORT',name:'Local support'}});
    await tx.auditEvent.create({data:{actorId:account.id,actorType:'account',actorRoleSnapshot:'Admin',action:'deployment.operational_bootstrapped',resourceType:'deployment',resourceId:'local',outcome:'success'}});
  });
  await installDiagnosticCatalog(db);
  console.log('Local Operational initialized. No diagnostics ran. Sign in, create an asset, then explicitly register the local endpoint.');
}finally{await db.$disconnect();}
