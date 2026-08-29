import {Router} from 'express';
import {z} from 'zod';
import {diagnosticActionIds,catalogDefinitions,FRESHNESS_MS,parseDiagnosticParameters,diagnosticScriptHash,diagnosticScriptPath} from '@edy/contracts';
import type {AppConfig} from '@edy/config';
import type {DatabaseClient} from '../../platform/prisma.js';
import type {Prisma} from '../../generated/prisma/client.js';
import type {AppendOnlyAuditRepository} from '../audit/audit-repository.js';
import {authorize} from '../auth/rbac.js';
import {auditRecord,parse,uuid,revision,missing,conflict} from '../inventory-knowledge/shared.js';
import {HttpError} from '../../platform/errors.js';
import {localFingerprint} from './catalog.js';

export function createDiagnosticsRouter(db:DatabaseClient,audit:AppendOnlyAuditRepository,config:AppConfig){
  const router=Router();const mode=config.PORTFOLIO_DEMO?'Demo':'Operational';
  const active=['Queued','Running'];
  const pageSchema=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10)}).strict();
  router.get('/diagnostics/catalog',authorize('diagnostics.read',audit),async(_req,res)=>{
    const [actions,endpoint,worker]=await Promise.all([db.diagnosticAction.findMany({orderBy:{actionId:'asc'}}),db.localEndpoint.findUnique({where:{id:'local'}}),db.diagnosticWorkerState.findUnique({where:{id:'local'}})]);
    res.json({mode,liveExecutionEnabled:mode==='Operational'&&worker?.ready===true&&worker.leaseUntil>new Date(),localAssetId:endpoint?.assetId??null,workerStatus:worker?.ready&&worker.leaseUntil>new Date()?'Ready':'Unavailable',data:actions.map(a=>({actionId:a.actionId,name:a.name,description:a.description,category:a.category,version:a.version,enabled:a.enabled,requiresElevation:a.requiresElevation,timeoutMs:a.timeoutMs,parameterSchema:a.parameterSchema}))});
  });
  router.post('/diagnostics/local-endpoint',authorize('diagnostics.configure',audit),async(req,res)=>{
    const dto=parse(z.object({assetId:uuid,version:revision}).strict(),req.body);
    if(mode!=='Operational')throw new HttpError(403,'Forbidden','Local registration is disabled in Portfolio Demo.');
    const endpoint=await db.$transaction(async tx=>{
      const worker=await tx.diagnosticWorkerState.findUnique({where:{id:'local'}});
      if(!worker?.ready||worker.leaseUntil<=new Date()||worker.fingerprint!==localFingerprint())throw new HttpError(409,'Conflict','The non-elevated local Windows worker must be ready.');
      if(await tx.diagnosticJob.count({where:{status:{in:active}}}))return conflict();
      const asset=await tx.asset.findUnique({where:{id:dto.assetId}});if(!asset)return missing();
      if(asset.archivedAt||asset.version!==dto.version)return conflict();
      const updated=await tx.asset.updateMany({where:{id:asset.id,version:dto.version,archivedAt:null},data:{version:{increment:1}}});if(!updated.count)return conflict();
      const value=await tx.localEndpoint.upsert({where:{id:'local'},create:{id:'local',assetId:asset.id,fingerprint:worker.fingerprint,registeredBy:req.auth!.accountId},update:{assetId:asset.id,fingerprint:worker.fingerprint,registeredBy:req.auth!.accountId,registeredAt:new Date()}});
      await tx.auditEvent.create({data:auditRecord(req,'diagnostic.endpoint_registered','asset',asset.id)});return value;
    });res.json({assetId:endpoint.assetId,registeredAt:endpoint.registeredAt});
  });
  router.post('/assets/:id/diagnostics',authorize('diagnostics.execute',audit),async(req,res)=>{
    try {
      const assetId=parse(uuid,req.params.id);
      const dto=parse(z.object({actionId:z.enum(diagnosticActionIds),parameters:z.unknown()}).strict(),req.body);
      let parameters:object;try{parameters=parseDiagnosticParameters(dto.actionId,dto.parameters);}catch{throw new HttpError(400,'Bad Request','Parameters do not match the allowlisted action.');}
      const key=parse(uuid,req.get('x-idempotency-key'));
      if(mode==='Demo')throw new HttpError(403,'Forbidden','Live diagnostics are disabled in Portfolio Demo.');
      const result=await db.$transaction(async tx=>{
        if((await tx.deploymentState.findUnique({where:{id:'local'}}))?.mode!=='Operational')throw new HttpError(403,'Forbidden','Operational database mode is required.');
        const previous=await tx.diagnosticJob.findUnique({where:{requestedBy_idempotencyKey:{requestedBy:req.auth!.accountId,idempotencyKey:key}}});
        if(previous){if(previous.assetId!==assetId||previous.actionId!==dto.actionId||JSON.stringify(previous.parameters)!==JSON.stringify(parameters))return conflict();return {job:previous,reused:true};}
        const endpoint=await tx.localEndpoint.findUnique({where:{id:'local'}});
        const worker=await tx.diagnosticWorkerState.findUnique({where:{id:'local'}});
        if(endpoint?.assetId!==assetId||endpoint.fingerprint!==localFingerprint())throw new HttpError(403,'Forbidden','Only the registered local endpoint is permitted.');
        if(!worker?.ready||worker.fingerprint!==endpoint.fingerprint||worker.leaseUntil<=new Date())throw new HttpError(409,'Conflict','The local diagnostics worker is unavailable.');
        if(!(await tx.asset.findFirst({where:{id:assetId,archivedAt:null}})))throw new HttpError(400,'Bad Request','The endpoint is archived or unavailable.');
        const definition=catalogDefinitions.find(a=>a.actionId===dto.actionId)!;
        const action=await tx.diagnosticAction.findUnique({where:{actionId_version:{actionId:dto.actionId,version:definition.version}}});
        if(!action?.enabled||action.requiresElevation||action.scriptHash!==diagnosticScriptHash||action.scriptPath!==diagnosticScriptPath||action.requiredPermission!=='diagnostics.execute')throw new HttpError(403,'Forbidden','This catalog action is unavailable.');
        const recent=await tx.diagnosticJob.count({where:{requestedBy:req.auth!.accountId,requestedAt:{gte:new Date(Date.now()-300_000)}}});
        if(recent>=10)throw new HttpError(429,'Too Many Requests','Diagnostic limit reached. Wait before requesting another check.');
        if(await tx.diagnosticJob.count({where:{assetId,status:{in:active}}}))throw new HttpError(409,'Conflict','This endpoint already has an active diagnostic.');
        if(await tx.diagnosticJob.count({where:{status:{in:active}}})>=20)throw new HttpError(429,'Too Many Requests','The diagnostics queue is full.');
        const job=await tx.diagnosticJob.create({data:{actionId:dto.actionId,actionRecordId:action.id,assetId,requestedBy:req.auth!.accountId,parameters:parameters as Prisma.InputJsonValue,idempotencyKey:key,scriptVersion:action.version,scriptHash:action.scriptHash,sourceMode:mode,expiresAt:new Date(Date.now()+365*86400_000),requestId:req.requestId,correlationId:req.correlationId}});
        await tx.auditEvent.create({data:auditRecord(req,'diagnostic.requested','diagnostic_job',job.id,{actionId:job.actionId,assetId})});return {job,reused:false};
      });res.status(result.reused?200:202).json(result.job);
    } catch(error){await audit.append({actorId:req.auth!.accountId,actorType:'account',actorRoleSnapshot:req.auth!.role,action:'diagnostic.denied',resourceType:'diagnostic_job',outcome:'denied',requestId:req.requestId,correlationId:req.correlationId,reason:error instanceof HttpError?error.title:'Request rejected'});throw error;}
  });
  router.get('/assets/:id/diagnostics',authorize('diagnostics.read',audit),async(req,res)=>{
    const assetId=parse(uuid,req.params.id);const p=parse(pageSchema,req.query);
    if(!(await db.asset.findUnique({where:{id:assetId}})))return missing();
    const [jobs,total]=await Promise.all([db.diagnosticJob.findMany({where:{assetId,sourceMode:mode},orderBy:[{requestedAt:'desc'},{id:'asc'}],skip:(p.page-1)*p.pageSize,take:p.pageSize,include:{result:{select:{id:true,collectedAt:true,findings:true,expiresAt:true,ruleVersion:true}}}}),db.diagnosticJob.count({where:{assetId,sourceMode:mode}})]);
    const actors=await db.account.findMany({where:{id:{in:jobs.map(j=>j.requestedBy)}},select:{id:true,username:true}});
    res.json({mode,data:jobs.map(j=>({...j,result:j.result&&j.result.expiresAt>new Date()?j.result:null,requestedByName:actors.find(a=>a.id===j.requestedBy)?.username??'Archived account',freshness:j.result&&Date.now()-j.result.collectedAt.getTime()<=FRESHNESS_MS?'Fresh':'Stale'})),pagination:{...p,total,totalPages:Math.ceil(total/p.pageSize)}});
  });
  router.get('/diagnostics/jobs/:id',authorize('diagnostics.read',audit),async(req,res)=>{
    const id=parse(uuid,req.params.id);const p=parse(pageSchema,req.query);
    const job=await db.diagnosticJob.findFirst({where:{id,sourceMode:mode},include:{result:true}});if(!job)return missing();
    const isViewer=req.auth!.role==='Viewer';const result=job.result&&job.result.expiresAt>new Date()?job.result:null;
    const events=result&&!isViewer?await db.windowsEvent.findMany({where:{resultId:result.id,expiresAt:{gt:new Date()}},orderBy:[{timestamp:'desc'},{id:'asc'}],skip:(p.page-1)*p.pageSize,take:p.pageSize}):[];
    const total=result&&!isViewer?await db.windowsEvent.count({where:{resultId:result.id,expiresAt:{gt:new Date()}}}):0;
    res.json({...job,result:result?{...result,payload:isViewer?null:result.payload}:null,events,pagination:{...p,total,totalPages:Math.ceil(total/p.pageSize)},freshness:result&&Date.now()-result.collectedAt.getTime()<=FRESHNESS_MS?'Fresh':'Stale'});
  });
  router.post('/diagnostics/jobs/:id/cancel',authorize('diagnostics.execute',audit),async(req,res)=>{
    const id=parse(uuid,req.params.id);parse(z.object({}).strict(),req.body);
    await db.$transaction(async tx=>{
      const j=await tx.diagnosticJob.findFirst({where:{id,sourceMode:mode}});if(!j)return missing();
      if(req.auth!.role!=='Admin'&&j.requestedBy!==req.auth!.accountId)throw new HttpError(403,'Forbidden','Only the requester or Admin can cancel this job.');
      if(!active.includes(j.status)||j.cancelRequestedAt)return conflict();
      const queued=j.status==='Queued';const changed=await tx.diagnosticJob.updateMany({where:{id,status:j.status,cancelRequestedAt:null},data:{cancelRequestedAt:new Date(),...(queued?{status:'Cancelled',completedAt:new Date(),errorCode:'CANCELLED'}:{})}});if(!changed.count)return conflict();
      await tx.auditEvent.create({data:auditRecord(req,queued?'diagnostic.cancelled':'diagnostic.cancellation_requested','diagnostic_job',id)});
    });res.status(202).json({id,cancellationRequested:true});
  });
  return router;
}
