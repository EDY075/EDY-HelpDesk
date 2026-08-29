import {diagnosticActionIds,interpretDiagnostic,syntheticDiagnostic} from '@edy/contracts';
import type {PrismaClient,Prisma} from '../apps/api/src/generated/prisma/client.js';
import {installDiagnosticCatalog} from '../apps/api/src/modules/diagnostics/catalog.js';
export async function seedPhase4(db:PrismaClient){
  const deployment=await db.deploymentState.findUnique({where:{id:'local'}});
  if(deployment?.mode==='Operational')throw new Error('DEMO_SEED_DENIED');
  await db.deploymentState.upsert({where:{id:'local'},create:{id:'local',mode:'Demo'},update:{}});
  await installDiagnosticCatalog(db);
  const asset=await db.asset.findUnique({where:{assetTag:'DEMO-P3-FIN'}}),actor=await db.account.findUnique({where:{username:'demo.admin'}});if(!asset||!actor)return;
  for(const actionId of diagnosticActionIds){
    const key=`synthetic-phase4-${actionId}`;
    if(await db.diagnosticJob.findUnique({where:{requestedBy_idempotencyKey:{requestedBy:actor.id,idempotencyKey:key}}}))continue;
    const action=await db.diagnosticAction.findUniqueOrThrow({where:{actionId_version:{actionId,version:1}}});
    const envelope=syntheticDiagnostic(actionId),findings=interpretDiagnostic(envelope);
    const collectedAt=new Date(Date.now()-3600_000); // deliberately stale; never implies a live collection
    envelope.collectedAt=collectedAt.toISOString();
    await db.$transaction(async tx=>{
      const job=await tx.diagnosticJob.create({data:{actionId,actionRecordId:action.id,assetId:asset.id,requestedBy:actor.id,status:'Succeeded',requestedAt:collectedAt,startedAt:collectedAt,completedAt:collectedAt,durationMs:1200,engine:'Synthetic fixture',scriptVersion:1,scriptHash:action.scriptHash,idempotencyKey:key,parameters:actionId==='eventlog.query'?{logName:'System',level:'Warning',timeWindow:'1h',limit:50}:{},sourceMode:'Demo',expiresAt:new Date(Date.now()+365*86400_000)}});
      const data=envelope.data as {events?:Array<{timestamp:string;eventId:number;level:string;provider:string;message:string}>;logName?:string};
      const events=actionId==='eventlog.query'?data.events??[]:[];
      if(actionId==='eventlog.query')envelope.data={logName:'System',events:[]};
      await tx.diagnosticResult.create({data:{jobId:job.id,assetId:asset.id,actionId,collectedAt,payload:envelope as Prisma.InputJsonValue,findings:findings as Prisma.InputJsonValue,sourceMode:'Demo',expiresAt:new Date(Date.now()+90*86400_000),events:{create:events.map(e=>({...e,timestamp:new Date(e.timestamp),expiresAt:new Date(Date.now()+30*86400_000)}))}}});
      await tx.auditEvent.create({data:{actorType:'seed',action:'diagnostic.synthetic_fixture_created',resourceType:'diagnostic_job',resourceId:job.id,outcome:'success'}});
    });
  }
}
