import { z } from 'zod';

export const diagnosticActionIds = ['windows.system.summary','windows.resource.usage','windows.services.important','windows.update.status','network.ip.configuration','network.gateway.validate','network.dns.validate','network.route.summary','eventlog.query'] as const;
export type DiagnosticActionId = typeof diagnosticActionIds[number];
export const actionIdSchema = z.enum(diagnosticActionIds);
export const diagnosticStatuses = ['Queued','Running','Succeeded','Failed','TimedOut','Cancelled'] as const;
export const severitySchema = z.enum(['Healthy','Info','Warning','Critical','Unknown']);
export const eventParameters = z.object({logName:z.enum(['System','Application']),level:z.enum(['Critical','Error','Warning','Information']),timeWindow:z.enum(['1h','6h','24h','7d']),limit:z.number().int().min(1).max(100).default(50)}).strict();
export const emptyParameters = z.object({}).strict();
export function parseDiagnosticParameters(action:DiagnosticActionId,value:unknown) {return action==='eventlog.query'?eventParameters.parse(value):emptyParameters.parse(value);}
const text=z.string().max(256), number=z.number().finite().nonnegative(), integer=number.int().max(Number.MAX_SAFE_INTEGER), date=z.string().datetime({offset:true});
const ip=z.string().ip();
export const importantServices=['Dhcp','Dnscache','EventLog','LanmanWorkstation','W32Time','wuauserv','Spooler'] as const;
const service=z.object({serviceName:z.enum(importantServices),displayName:text,status:z.enum(['Running','Stopped','Paused','StartPending','StopPending','ContinuePending','PausePending','Unknown']),startType:text.nullable()}).strict();
const ipv4=z.string().ip({version:'v4'});
const adapter=z.object({name:text,status:z.literal('Up'),ipv4:z.array(ipv4).max(16),prefixes:z.array(z.number().int().min(0).max(32)).max(16),gateways:z.array(ipv4).max(8),dnsServers:z.array(ip).max(16),dhcpEnabled:z.boolean().nullable()}).strict();
const route=z.object({destination:text,interfaceIndex:integer,gateway:ipv4,metric:integer}).strict();
export const windowsEventSchema=z.object({timestamp:date,eventId:integer,level:z.enum(['Critical','Error','Warning','Information']),provider:text,message:z.string().max(2048)}).strict();
export const diagnosticDataSchemas = {
  'windows.system.summary':z.object({hostname:text,edition:text,version:text,build:text,architecture:text,bootTime:date,uptimeSeconds:integer}).strict(),
  'windows.resource.usage':z.object({cpuPercent:z.number().min(0).max(100).nullable(),logicalCpuCount:integer.min(1),totalRamBytes:integer,usedRamBytes:integer,availableRamBytes:integer,driveTotalBytes:integer,driveUsedBytes:integer,driveAvailableBytes:integer}).strict().refine(v=>v.availableRamBytes<=v.totalRamBytes&&v.usedRamBytes<=v.totalRamBytes&&v.driveAvailableBytes<=v.driveTotalBytes&&v.driveUsedBytes<=v.driveTotalBytes,'Inconsistent resource totals'),
  'windows.services.important':z.object({services:z.array(service).max(7)}).strict(),
  'windows.update.status':z.object({installedHotfixCount:integer,lastInstalledAt:date.nullable(),pendingUpdatesKnown:z.literal(false),note:z.string().max(500)}).strict(),
  'network.ip.configuration':z.object({adapters:z.array(adapter).max(16)}).strict(),
  'network.gateway.validate':z.object({gateway:ipv4.nullable(),reachable:z.boolean().nullable(),latencyMs:number.nullable(),packetLossPercent:z.number().min(0).max(100).nullable(),probes:z.number().int().min(0).max(2)}).strict(),
  'network.dns.validate':z.object({domain:z.literal('example.com'),configured:z.boolean(),succeeded:z.boolean(),addresses:z.array(ip).max(16),latencyMs:number}).strict(),
  'network.route.summary':z.object({routes:z.array(route).max(32),truncated:z.boolean()}).strict(),
  'eventlog.query':z.object({logName:z.enum(['System','Application']),events:z.array(windowsEventSchema).max(100)}).strict(),
} satisfies Record<DiagnosticActionId,z.ZodTypeAny>;
export const outputEnvelope=z.object({schemaVersion:z.literal(1),actionId:actionIdSchema,collectedAt:date,engine:z.string().regex(/^(?:WindowsPowerShell|PowerShell) [0-9.]+$/).max(80),availability:z.enum(['Supported','PermissionLimited','Unsupported']),data:z.unknown()}).strict();
export type DiagnosticEnvelope=z.infer<typeof outputEnvelope>;
export function validateDiagnosticOutput(action:DiagnosticActionId,input:unknown):DiagnosticEnvelope {
  const parsed=outputEnvelope.parse(input);
  if(parsed.actionId!==action) throw new Error('OUTPUT_ACTION_MISMATCH');
  const collected=Date.parse(parsed.collectedAt);
  if(collected>Date.now()+60_000||collected<Date.now()-86_400_000) throw new Error('OUTPUT_TIMESTAMP_INVALID');
  if(parsed.availability==='Supported') return {...parsed,data:diagnosticDataSchemas[action].parse(parsed.data)};
  if(parsed.data!==null) throw new Error('OUTPUT_UNAVAILABLE_DATA');
  return parsed;
}
export const catalogDefinitions = diagnosticActionIds.map(actionId=>({actionId,name:({
  'windows.system.summary':'System summary','windows.resource.usage':'Resource usage','windows.services.important':'Important services','windows.update.status':'Windows Update status','network.ip.configuration':'IP configuration','network.gateway.validate':'Default gateway validation','network.dns.validate':'Controlled DNS validation','network.route.summary':'Local route summary','eventlog.query':'Windows Event Logs',
})[actionId],description:actionId==='eventlog.query'?'Read bounded System or Application events.':'Read-only check of the registered local Windows endpoint.',category:actionId.startsWith('network.')?'Network':actionId==='eventlog.query'?'EventLog':'Windows',version:1,requiredPermission:'diagnostics.execute',timeoutMs:actionId==='eventlog.query'?20_000:15_000,maxOutputBytes:actionId==='eventlog.query'?524_288:65_536,maxStderrBytes:8192,requiresElevation:false as const}));

export const findingSchema=z.object({key:z.string(),label:z.string(),severity:severitySchema,detail:z.string(),recommendation:z.string(),area:z.enum(['System','Resources','Network','Services','Updates','Events'])});
export type Finding=z.infer<typeof findingSchema>;
export const FRESHNESS_MS=15*60*1000;
export function interpretDiagnostic(output:DiagnosticEnvelope):Finding[] {
  const f:Finding[]=[];
  const add=(key:string,label:string,severity:Finding['severity'],detail:string,area:Finding['area'],recommendation='Review in the endpoint support context.')=>f.push({key,label,severity,detail,area,recommendation});
  if(output.availability!=='Supported') {const area:Finding['area']=output.actionId.startsWith('network.')?'Network':output.actionId==='eventlog.query'?'Events':output.actionId==='windows.resource.usage'?'Resources':output.actionId==='windows.services.important'?'Services':output.actionId==='windows.update.status'?'Updates':'System';add('availability','Collection availability','Unknown',output.availability,area,'This information was unavailable without additional capability. Do not elevate privileges.');return f;}
  switch(output.actionId){
    case 'windows.system.summary': {const d=diagnosticDataSchemas[output.actionId].parse(output.data);add('os','Operating system','Info',`${d.edition} · build ${d.build}`,'System');add('uptime','Windows uptime','Info',`${Math.floor(d.uptimeSeconds/86400)}d ${Math.floor(d.uptimeSeconds%86400/3600)}h`,'System');break;}
    case 'windows.resource.usage':{const d=diagnosticDataSchemas[output.actionId].parse(output.data);const ram=d.totalRamBytes?100*d.usedRamBytes/d.totalRamBytes:null, disk=d.driveTotalBytes?100*d.driveAvailableBytes/d.driveTotalBytes:null;add('cpu','CPU',d.cpuPercent===null?'Unknown':d.cpuPercent>=90?'Warning':'Healthy',d.cpuPercent===null?'Unavailable':`${d.cpuPercent.toFixed(0)}% utilization`,'Resources','A single sample is not a sustained-load diagnosis.');add('ram','Memory',ram===null?'Unknown':ram>=90?'Warning':'Healthy',ram===null?'Unavailable':`${ram.toFixed(0)}% used`,'Resources');add('disk','System drive',disk===null?'Unknown':disk<5?'Critical':disk<15?'Warning':'Healthy',disk===null?'Unavailable':`${disk.toFixed(1)}% free`,'Resources','Review available capacity; no files are removed by this tool.');break;}
    case 'windows.services.important':{for(const d of diagnosticDataSchemas[output.actionId].parse(output.data).services){const expected=['Dhcp','Dnscache','EventLog','LanmanWorkstation'].includes(d.serviceName);add(d.serviceName,d.displayName,d.status==='Running'?'Healthy':d.status==='Unknown'?'Unknown':expected?'Warning':'Info',d.status,'Services',`Confirm whether ${d.serviceName} should be running for this endpoint; no service is changed.`);}break;}
    case 'windows.update.status':{const d=diagnosticDataSchemas[output.actionId].parse(output.data);add('updates','Windows Update','Info',`${d.installedHotfixCount} installed hotfix records; pending updates not assessed.`,'Updates','Review Windows Update using the approved support process. No update scan or install was requested.');break;}
    case 'network.ip.configuration':{const d=diagnosticDataSchemas[output.actionId].parse(output.data);add('adapters','Active adapters',d.adapters.length?'Healthy':'Warning',`${d.adapters.length} active adapters`,'Network');add('dns-config','DNS configured',d.adapters.some(a=>a.dnsServers.length)?'Healthy':'Warning',d.adapters.some(a=>a.dnsServers.length)?'Configured':'No DNS configuration found','Network');break;}
    case 'network.gateway.validate':{const d=diagnosticDataSchemas[output.actionId].parse(output.data);add('gateway','Gateway',d.reachable===null?'Unknown':d.reachable?'Healthy':'Warning',d.reachable===null?'No default gateway':d.reachable?`Reachable · ${d.latencyMs?.toFixed(0)} ms`:'No ICMP reply','Network','ICMP can be filtered. Confirm local routing before concluding connectivity failure.');break;}
    case 'network.dns.validate':{const d=diagnosticDataSchemas[output.actionId].parse(output.data);add('dns','DNS resolution',d.succeeded?'Healthy':'Warning',d.succeeded?'Controlled resolution succeeded':'Controlled resolution failed','Network','Validate configured DNS servers; this is a potential support area, not a proven root cause.');break;}
    case 'network.route.summary':{const d=diagnosticDataSchemas[output.actionId].parse(output.data);add('route','Default route',d.routes.some(r=>r.destination==='0.0.0.0/0')?'Healthy':'Warning',`${d.routes.length} bounded route records`,'Network');break;}
    case 'eventlog.query':{const d=diagnosticDataSchemas[output.actionId].parse(output.data);add('events','Event log query','Info',`${d.events.length} matching records in the requested window`,'Events','Events are observations, not a diagnosis or proof of compromise.');break;}
  }
  return f;
}
