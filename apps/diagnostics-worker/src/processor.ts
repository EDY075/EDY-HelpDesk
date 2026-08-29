import {randomUUID} from 'node:crypto';
import os from 'node:os';
import {isIP} from 'node:net';
import {actionIdSchema,catalogDefinitions,diagnosticScriptHash,diagnosticScriptPath,diagnosticDataSchemas,interpretDiagnostic,parseDiagnosticParameters,validateDiagnosticOutput} from '@edy/contracts';
import type {AppConfig} from '@edy/config';
import type {DatabaseClient} from '../../api/src/platform/prisma.js';
import type {Prisma,DiagnosticJob} from '../../api/src/generated/prisma/client.js';
import {localFingerprint} from '../../api/src/modules/diagnostics/catalog.js';
import {ExecutionFailure,type ProcessResult,runDiagnosticProcess,verifyScript} from './process-runner.js';

type Tx=Prisma.TransactionClient;
export type Runner=(action:ReturnType<typeof actionIdSchema.parse>,parameters:unknown,signal:AbortSignal)=>Promise<ProcessResult>;
function event(job:DiagnosticJob,action:string,outcome='success',reason?:string):Prisma.AuditEventCreateInput{return {actorId:job.requestedBy,actorType:'account',action,resourceType:'diagnostic_job',resourceId:job.id,outcome,reason:reason??null,requestId:job.requestId,correlationId:job.correlationId,metadata:{actionId:job.actionId,assetId:job.assetId,scriptVersion:job.scriptVersion,scriptHash:job.scriptHash}};}
export function redactEventText(value:string,identifiers:string[]=[]){
  let count=0;let text=Array.from(value).filter(c=>c.charCodeAt(0)>=32||c==='\n'||c==='\r'||c==='\t').join('');
  const patterns=[/[A-Za-z]:\\Users\\[^\s"'<>]+/gi,/\\\\[^\s"'<>]+/g,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi,/\b(?:[a-z0-9-]+\.)+(?:local|internal|corp|lan|ad)\b/gi,/\b(?:password|token|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi];
  for(const p of patterns)text=text.replace(p,()=>{count++;return '[redacted]';});
  text=text.replace(/[0-9a-f]*:[0-9a-f:]+(?:%[a-z0-9]+)?/gi,value=>{if(isIP(value.split('%')[0]??'')!==6)return value;count++;return '[redacted]';});
  for(const identifier of identifiers.filter(v=>v.length>=3)){const p=new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');text=text.replace(p,()=>{count++;return '[redacted]';});}
  return {text:text.slice(0,2048),count};
}
export async function validateQueuedJob(tx:Tx,job:DiagnosticJob,config:AppConfig){
  if(config.PORTFOLIO_DEMO||job.sourceMode!=='Operational'||(await tx.deploymentState.findUnique({where:{id:'local'}}))?.mode!=='Operational')throw new ExecutionFailure('DEMO_EXECUTION_DENIED');
  const action=actionIdSchema.safeParse(job.actionId);if(!action.success)throw new ExecutionFailure('UNKNOWN_ACTION');
  const definition=catalogDefinitions.find(a=>a.actionId===action.data)!;
  const record=await tx.diagnosticAction.findUnique({where:{id:job.actionRecordId}});
  if(!record?.enabled||record.requiresElevation||record.requiredPermission!=='diagnostics.execute'||record.actionId!==job.actionId||record.version!==job.scriptVersion||record.version!==definition.version||record.timeoutMs!==definition.timeoutMs||record.maxOutputBytes!==definition.maxOutputBytes)throw new ExecutionFailure('ACTION_DISABLED');
  if(record.scriptHash!==diagnosticScriptHash||job.scriptHash!==diagnosticScriptHash||record.scriptPath!==diagnosticScriptPath)throw new ExecutionFailure('SCRIPT_INTEGRITY_FAILURE');
  const actor=await tx.account.findFirst({where:{id:job.requestedBy,archivedAt:null,role:{in:['Admin','Technician']}}});
  if(!actor||(actor.userId&&!(await tx.user.findFirst({where:{id:actor.userId,archivedAt:null,department:{archivedAt:null}}}))))throw new ExecutionFailure('AUTHORIZATION_REVOKED');
  const endpoint=await tx.localEndpoint.findUnique({where:{id:'local'}});
  if(endpoint?.assetId!==job.assetId||endpoint.fingerprint!==localFingerprint()||!(await tx.asset.findFirst({where:{id:job.assetId,archivedAt:null}})))throw new ExecutionFailure('LOCAL_ENDPOINT_DENIED');
  try{parseDiagnosticParameters(action.data,job.parameters);}catch{throw new ExecutionFailure('PARAMETERS_INVALID');}
  return action.data;
}
export async function processJob(db:DatabaseClient,job:DiagnosticJob,config:AppConfig,runner:Runner,signal:AbortSignal){
  const start=Date.now();let captured:ProcessResult|undefined;
  try{
    const action=await db.$transaction(tx=>validateQueuedJob(tx,job,config));
    captured=await runner(action,job.parameters,signal);
    let parsed;try{parsed=validateDiagnosticOutput(action,JSON.parse(captured.stdout));}catch{throw new ExecutionFailure('OUTPUT_VALIDATION_FAILURE',captured.exitCode,captured.outputBytes);}
    let redactionCount=0;let events:Array<{timestamp:Date;eventId:number;level:string;provider:string;message:string;expiresAt:Date}>=[];
    const findings=interpretDiagnostic(parsed); // Store interpretation once; never reinterpret historical snapshots.
    if(action==='eventlog.query'&&parsed.availability==='Supported'){
      const data=diagnosticDataSchemas['eventlog.query'].parse(parsed.data);
      const parameters=parseDiagnosticParameters(action,job.parameters) as {limit:number;logName:string;level:string;timeWindow:string};
      const hours:Record<string,number>={'1h':1,'6h':6,'24h':24,'7d':168};
      if(data.logName!==parameters.logName||data.events.length>parameters.limit||data.events.some(e=>e.level!==parameters.level||Date.parse(e.timestamp)>Date.now()+60_000||Date.parse(e.timestamp)<Date.now()-(hours[parameters.timeWindow]??0)*3600_000-60_000))throw new ExecutionFailure('OUTPUT_VALIDATION_FAILURE');
      events=data.events.map(e=>{const m=redactEventText(e.message,[os.hostname(),os.userInfo().username]),p=redactEventText(e.provider,[os.hostname(),os.userInfo().username]);redactionCount+=m.count+p.count;return {...e,timestamp:new Date(e.timestamp),provider:p.text.slice(0,256),message:m.text,expiresAt:new Date(Date.now()+30*86400_000)};});
      parsed={...parsed,data:{logName:data.logName,events:[]}}; // Event text exists only in the 30-day table.
    }
    await db.$transaction(async tx=>{
      const current=await tx.diagnosticJob.findUniqueOrThrow({where:{id:job.id}});
      if(current.status!=='Running'||current.owner!==job.owner)return;
      if(current.cancelRequestedAt||signal.aborted)throw new ExecutionFailure('CANCELLED');
      await validateQueuedJob(tx,job,config);
      const changed=await tx.diagnosticJob.updateMany({where:{id:job.id,status:'Running',owner:job.owner,cancelRequestedAt:null},data:{status:'Succeeded',completedAt:new Date(),durationMs:Date.now()-start,engine:parsed.engine,exitCode:captured!.exitCode,outputBytes:captured!.outputBytes}});if(!changed.count)throw new ExecutionFailure('CANCELLED');
      await tx.diagnosticResult.create({data:{jobId:job.id,assetId:job.assetId,actionId:job.actionId,collectedAt:new Date(parsed.collectedAt),payload:parsed as Prisma.InputJsonValue,findings:findings as Prisma.InputJsonValue,sourceMode:'Operational',redactionCount,expiresAt:new Date(Date.now()+90*86400_000),events:{create:events}}});
      await tx.auditEvent.create({data:{...event(job,'diagnostic.succeeded'),metadata:{actionId:job.actionId,scriptHash:job.scriptHash,durationMs:Date.now()-start,outputBytes:captured!.outputBytes,exitCode:captured!.exitCode,engine:parsed.engine,redactionCount,records:events.length}}});
      if(action==='eventlog.query')await tx.auditEvent.create({data:event(job,'diagnostic.event_log_queried')});
    });
  }catch(error){
    const code=error instanceof ExecutionFailure?error.code:'EXECUTION_FAILED';
    const status=code==='CANCELLED'?'Cancelled':code==='TIMEOUT'?'TimedOut':'Failed';
    await db.$transaction(async tx=>{
      const changed=await tx.diagnosticJob.updateMany({where:{id:job.id,status:'Running',owner:job.owner},data:{status,completedAt:new Date(),durationMs:Date.now()-start,errorCode:code,exitCode:error instanceof ExecutionFailure?error.exitCode:null,outputBytes:captured?.outputBytes??(error instanceof ExecutionFailure?error.outputBytes:0)}});
      if(changed.count){await tx.auditEvent.create({data:event(job,`diagnostic.${status==='TimedOut'?'timed_out':status.toLowerCase()}`,status==='Cancelled'?'cancelled':'failure',code)});if(code==='SCRIPT_INTEGRITY_FAILURE'||code==='OUTPUT_VALIDATION_FAILURE')await tx.auditEvent.create({data:event(job,code==='SCRIPT_INTEGRITY_FAILURE'?'diagnostic.script_integrity_failure':'diagnostic.output_validation_failure','failure',code)});}
    });
  }
}
export async function purgeDiagnosticData(db:DatabaseClient,now=new Date()){
  return db.$transaction(async tx=>{
    const events=await tx.windowsEvent.findMany({where:{expiresAt:{lte:now}},take:100,select:{id:true}});
    const e=await tx.windowsEvent.deleteMany({where:{id:{in:events.map(v=>v.id)}}});
    const results=await tx.diagnosticResult.findMany({where:{expiresAt:{lte:now},events:{none:{}}},take:100,select:{id:true}});
    const r=await tx.diagnosticResult.deleteMany({where:{id:{in:results.map(v=>v.id)}}});
    const jobs=await tx.diagnosticJob.findMany({where:{expiresAt:{lte:now},status:{notIn:['Queued','Running']},result:null},take:100,select:{id:true}});
    const j=await tx.diagnosticJob.deleteMany({where:{id:{in:jobs.map(v=>v.id)}}});
    if(e.count+r.count+j.count)await tx.auditEvent.create({data:{actorType:'worker',action:'diagnostic.retention_purge',resourceType:'diagnostics',outcome:'success',metadata:{events:e.count,results:r.count,jobs:j.count}}});
    return {events:e.count,results:r.count,jobs:j.count};
  });
}
export function createJobLoop(db:DatabaseClient,config:AppConfig,root:string,engine:string,onError:(code:string)=>void,testRunner?:Runner){
  const owner=randomUUID();let timer:NodeJS.Timeout|undefined,stopping=false,ticking=false,current:{id:string;abort:AbortController;promise:Promise<void>}|undefined;let lastPurge=0;
  const tick=async()=>{
    if(stopping||ticking)return;ticking=true;
    try{
      const leased=await db.$transaction(async tx=>{
        const now=new Date(),until=new Date(Date.now()+10_000),fingerprint=localFingerprint();
        const state=await tx.diagnosticWorkerState.findUnique({where:{id:'local'}});
        if(state&&state.owner!==owner&&state.leaseUntil>now)return false;
        await tx.diagnosticWorkerState.upsert({where:{id:'local'},create:{id:'local',owner,fingerprint,heartbeatAt:now,leaseUntil:until,ready:true,engine:pathEngine(engine)},update:{owner,fingerprint,heartbeatAt:now,leaseUntil:until,ready:true,engine:pathEngine(engine),errorCode:null}});
        return true;
      });
      if(!leased){current?.abort.abort();return;}
      if(current){
        const job=await db.diagnosticJob.findUnique({where:{id:current.id}});
        if(!job||job.cancelRequestedAt||job.status!=='Running')current.abort.abort();
        else try{await db.$transaction(tx=>validateQueuedJob(tx,job,config));}catch{current.abort.abort();}
        return;
      }
      await db.$transaction(async tx=>{
        const abandoned=await tx.diagnosticJob.findMany({where:{status:'Running',startedAt:{lt:new Date(Date.now()-35_000)}},take:20});
        for(const j of abandoned){await tx.diagnosticJob.update({where:{id:j.id},data:{status:'Failed',completedAt:new Date(),errorCode:'WORKER_INTERRUPTED'}});await tx.auditEvent.create({data:event(j,'diagnostic.failed','failure','WORKER_INTERRUPTED')});}
      });
      if(Date.now()-lastPurge>60_000){await purgeDiagnosticData(db);lastPurge=Date.now();}
      const job=await db.$transaction(async tx=>{
        const state=await tx.diagnosticWorkerState.findUnique({where:{id:'local'}});if(state?.owner!==owner||state.leaseUntil<=new Date())return null;
        if(await tx.diagnosticJob.count({where:{status:'Running'}}))return null;
        const next=await tx.diagnosticJob.findFirst({where:{status:'Queued',sourceMode:'Operational'},orderBy:{requestedAt:'asc'}});if(!next)return null;
        const started=await tx.diagnosticJob.updateMany({where:{id:next.id,status:'Queued',cancelRequestedAt:null},data:{status:'Running',startedAt:new Date(),owner,engine:pathEngine(engine)}});if(!started.count)return null;
        await tx.auditEvent.create({data:event(next,'diagnostic.started')});return {...next,status:'Running',owner};
      });
      if(job){const abort=new AbortController();const promise=processJob(db,job,config,testRunner??(async(action,p,s)=>{await verifyScript(root);return runDiagnosticProcess(root,action,p,s,engine);}),abort.signal).catch(()=>onError('JOB_PERSISTENCE_FAILED')).finally(()=>{current=undefined;});current={id:job.id,abort,promise};}
    }catch{current?.abort.abort();onError('WORKER_POLL_FAILED');}finally{ticking=false;}
  };
  return {start(){if(timer)return;timer=setInterval(()=>void tick(),500);void tick();},async stop(){stopping=true;if(timer)clearInterval(timer);current?.abort.abort();await current?.promise;await db.diagnosticWorkerState.updateMany({where:{id:'local',owner},data:{ready:false,leaseUntil:new Date()}});}};
}
function pathEngine(engine:string){return engine.toLowerCase().endsWith('pwsh.exe')?'PowerShell 7':'WindowsPowerShell 5.1';}
