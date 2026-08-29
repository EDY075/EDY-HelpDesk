import {createHash} from 'node:crypto';
import os from 'node:os';
import {catalogDefinitions,diagnosticScriptHash,diagnosticScriptPath,diagnosticOutputJsonSchema} from '@edy/contracts';
import type {DatabaseClient} from '../../platform/prisma.js';
import type {AppConfig} from '@edy/config';

export const localFingerprint=()=>createHash('sha256').update(`${os.platform()}\0${os.hostname()}`).digest('hex');
export async function ensureDeploymentMode(db:DatabaseClient,config:Pick<AppConfig,'PORTFOLIO_DEMO'|'API_HOST'|'WEB_ORIGIN'>) {
  const mode=config.PORTFOLIO_DEMO?'Demo':'Operational';
  if(!['127.0.0.1','localhost','::1'].includes(config.API_HOST)||!['127.0.0.1','localhost','[::1]'].includes(new URL(config.WEB_ORIGIN).hostname))throw new Error('DIAGNOSTICS_LOOPBACK_REQUIRED');
  await db.$transaction(async tx=>{
    const existing=await tx.deploymentState.findUnique({where:{id:'local'}});
    if(existing){if(existing.mode!==mode)throw new Error('DEPLOYMENT_MODE_MISMATCH');return;}
    // Never relabel a populated, unclassified database as operational.
    if(mode==='Operational' && (await tx.asset.count()+await tx.account.count()+await tx.ticket.count())>0)throw new Error('OPERATIONAL_DATABASE_MUST_BE_EMPTY');
    await tx.deploymentState.create({data:{id:'local',mode}});
  });
}
export async function installDiagnosticCatalog(db:DatabaseClient) {
  for(const d of catalogDefinitions){
    const {maxStderrBytes:_,...definition}=d;void _;
    const parameterSchema=d.actionId==='eventlog.query'?{type:'object',additionalProperties:false,properties:{logName:{enum:['System','Application']},level:{enum:['Critical','Error','Warning','Information']},timeWindow:{enum:['1h','6h','24h','7d']},limit:{type:'integer',minimum:1,maximum:100}},required:['logName','level','timeWindow']}:{type:'object',additionalProperties:false,properties:{}};
    const outputSchema=diagnosticOutputJsonSchema(d.actionId);
    await db.diagnosticAction.upsert({where:{actionId_version:{actionId:d.actionId,version:1}},update:{outputSchema},create:{...definition,category:d.category as 'Windows'|'Network'|'EventLog',scriptPath:diagnosticScriptPath,scriptHash:diagnosticScriptHash,parameterSchema,outputSchema,enabled:true}});
  }
}
