import {importantServices,type DiagnosticActionId} from './diagnostics.js';

// Stored catalog contracts for inspection. Runtime Zod validation additionally enforces
// cross-field consistency, request-specific event bounds and timestamp freshness.
type JsonValue=string|number|boolean|null|readonly JsonValue[]|{[key:string]:JsonValue};
type Schema=Record<string,JsonValue>;
const str:Schema={type:'string',maxLength:256};
const integer:Schema={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const number:Schema={type:'number',minimum:0};
const bool:Schema={type:'boolean'};
const date:Schema={type:'string',format:'date-time'};
const ipv4:Schema={type:'string',format:'ipv4'};
const ip:Schema={anyOf:[ipv4,{type:'string',format:'ipv6'}]};
const nullable=(schema:Schema):Schema=>({anyOf:[schema,{type:'null'}]});
const array=(items:Schema,maxItems:number):Schema=>({type:'array',items,maxItems});
const object=(properties:Record<string,Schema>):Schema=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const enumeration=(values:readonly string[]):Schema=>({type:'string',enum:values});
const percent:Schema={type:'number',minimum:0,maximum:100};
const dataSchemas:Record<DiagnosticActionId,Schema>={
  'windows.system.summary':object({hostname:str,edition:str,version:str,build:str,architecture:str,bootTime:date,uptimeSeconds:integer}),
  'windows.resource.usage':object({cpuPercent:nullable(percent),logicalCpuCount:{...integer,minimum:1},totalRamBytes:integer,usedRamBytes:integer,availableRamBytes:integer,driveTotalBytes:integer,driveUsedBytes:integer,driveAvailableBytes:integer}),
  'windows.services.important':object({services:array(object({serviceName:enumeration(importantServices),displayName:str,status:enumeration(['Running','Stopped','Paused','StartPending','StopPending','ContinuePending','PausePending','Unknown']),startType:nullable(str)}),7)}),
  'windows.update.status':object({installedHotfixCount:integer,lastInstalledAt:nullable(date),pendingUpdatesKnown:{const:false},note:{type:'string',maxLength:500}}),
  'network.ip.configuration':object({adapters:array(object({name:str,status:{const:'Up'},ipv4:array(ipv4,16),prefixes:array({type:'integer',minimum:0,maximum:32},16),gateways:array(ipv4,8),dnsServers:array(ip,16),dhcpEnabled:nullable(bool)}),16)}),
  'network.gateway.validate':object({gateway:nullable(ipv4),reachable:nullable(bool),latencyMs:nullable(number),packetLossPercent:nullable(percent),probes:{type:'integer',minimum:0,maximum:2}}),
  'network.dns.validate':object({domain:{const:'example.com'},configured:bool,succeeded:bool,addresses:array(ip,16),latencyMs:number}),
  'network.route.summary':object({routes:array(object({destination:str,interfaceIndex:integer,gateway:ipv4,metric:integer}),32),truncated:bool}),
  'eventlog.query':object({logName:enumeration(['System','Application']),events:array(object({timestamp:date,eventId:integer,level:enumeration(['Critical','Error','Warning','Information']),provider:str,message:{type:'string',maxLength:2048}}),100)}),
};
export function diagnosticOutputJsonSchema(actionId:DiagnosticActionId){
  const base={schemaVersion:{const:1},actionId:{const:actionId},collectedAt:date,engine:{type:'string',maxLength:80,pattern:'^(WindowsPowerShell|PowerShell) [0-9.]+$'}};
  return {$schema:'https://json-schema.org/draft/2020-12/schema',oneOf:[object({...base,availability:{const:'Supported'},data:dataSchemas[actionId]}),object({...base,availability:enumeration(['PermissionLimited','Unsupported']),data:{type:'null'}})]};
}
