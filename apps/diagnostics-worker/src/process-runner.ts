import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {catalogDefinitions,diagnosticScriptHash,diagnosticScriptPath,parseDiagnosticParameters,type DiagnosticActionId} from '@edy/contracts';

export class ExecutionFailure extends Error {constructor(readonly code:string,readonly exitCode:number|null=null,readonly outputBytes=0){super(code);}}
export type ProcessResult={stdout:string;exitCode:number;outputBytes:number;durationMs:number};
export type SpawnProcess=(exe:string,args:string[],options:Parameters<typeof spawn>[2])=>ChildProcessWithoutNullStreams;
export async function verifyScript(root:string,file=diagnosticScriptPath,hash=diagnosticScriptHash):Promise<string>{
  if(file!==diagnosticScriptPath||hash!==diagnosticScriptHash)throw new ExecutionFailure('SCRIPT_INTEGRITY_FAILURE');
  const official=await realpath(path.join(root,'scripts','diagnostics'));
  const candidate=path.resolve(root,file),resolved=await realpath(candidate);
  if(resolved!==candidate||path.dirname(resolved)!==official||(await lstat(candidate)).isSymbolicLink())throw new ExecutionFailure('SCRIPT_PATH_REJECTED');
  if(createHash('sha256').update(await readFile(resolved)).digest('hex')!==hash)throw new ExecutionFailure('SCRIPT_INTEGRITY_FAILURE');
  return resolved;
}
export function boundedProcess(executable:string,args:string[],options:{cwd:string;env:NodeJS.ProcessEnv;timeoutMs:number;stdoutLimit:number;stderrLimit:number;signal:AbortSignal},launch:SpawnProcess=(exe,argv,opts)=>spawn(exe,argv,opts) as ChildProcessWithoutNullStreams):Promise<ProcessResult>{
  return new Promise((resolve,reject)=>{
    if(options.signal.aborted){reject(new ExecutionFailure('CANCELLED'));return;}
    const started=Date.now();let out=0,err=0;const chunks:Buffer[]=[];let failure:string|undefined;let settled=false;
    const child=launch(executable,args,{cwd:options.cwd,env:options.env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stdin.end();
    const stop=(code:string)=>{failure??=code;child.kill();}; // host handle closure kills only its job tree
    const abort=()=>stop('CANCELLED');options.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>stop('TIMEOUT'),options.timeoutMs+1000);
    const done=(error?:ExecutionFailure,result?:ProcessResult)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(result!);};
    child.stdout.on('data',(chunk:Buffer)=>{out+=chunk.length;if(out>options.stdoutLimit||out+err>options.stdoutLimit)stop('OUTPUT_LIMIT');else chunks.push(chunk);});
    child.stderr.on('data',(chunk:Buffer)=>{err+=chunk.length;if(err>options.stderrLimit||out+err>options.stdoutLimit)stop('OUTPUT_LIMIT');});
    child.on('error',()=>done(new ExecutionFailure('PROCESS_START_FAILED')));
    child.on('close',code=>{
      const mapped=code===74?'TIMEOUT':code===75?'CANCELLED':code===76?'SCRIPT_INTEGRITY_FAILURE':code===77?'ELEVATED_CONTEXT_DENIED':code===78?'PROCESS_INPUT_REJECTED':code===79?'CONTAINMENT_UNAVAILABLE':code!==0?'PROCESS_FAILED':null;
      if(failure||mapped)done(new ExecutionFailure(failure??mapped!,code,out+err));
      else done(undefined,{stdout:Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''),exitCode:0,outputBytes:out+err,durationMs:Date.now()-started});
    });
  });
}
export async function resolveProcessHost(root:string){
  if(process.platform!=='win32')throw new ExecutionFailure('WINDOWS_REQUIRED');
  const exe=path.join(root,'storage','runtime','Edy.ProcessHost.exe');
  const build=JSON.parse(await readFile(path.join(root,'storage','runtime','process-host-build.json'),'utf8')) as {sourceHash:string;binaryHash:string};
  for(const [file,expected] of [[exe,build.binaryHash],[path.join(root,'apps','diagnostics-worker','native','ProcessHost.cs'),build.sourceHash]] as const){if(createHash('sha256').update(await readFile(file)).digest('hex')!==expected)throw new ExecutionFailure('PROCESS_HOST_INTEGRITY_FAILURE');}
  return exe;
}
export async function resolveEngine(environment=process.env){
  const candidates=environment.DIAGNOSTICS_ENGINE_PATH?[environment.DIAGNOSTICS_ENGINE_PATH]:[path.join(environment.ProgramFiles??'C:\\Program Files','PowerShell','7','pwsh.exe'),path.join(environment.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')];
  for(const candidate of candidates){
    if(!path.isAbsolute(candidate)||candidate.startsWith('\\\\')||!['pwsh.exe','powershell.exe'].includes(path.basename(candidate).toLowerCase()))continue;
    try {const resolved=await realpath(candidate);if(resolved.toLowerCase()===candidate.toLowerCase()&&!(await lstat(candidate)).isSymbolicLink())return resolved;}catch{/* unavailable engine */}
  }
  throw new ExecutionFailure('POWERSHELL_UNAVAILABLE');
}
export function minimalEnvironment(environment=process.env):NodeJS.ProcessEnv {
  return {SystemRoot:environment.SystemRoot??'C:\\Windows',WINDIR:environment.SystemRoot??'C:\\Windows',SystemDrive:environment.SystemDrive??'C:',TEMP:environment.TEMP,TMP:environment.TMP,PATH:path.join(environment.SystemRoot??'C:\\Windows','System32')};
}
export async function checkProcessHost(root:string){
  const host=await resolveProcessHost(root);
  const result=await boundedProcess(host,['--check'],{cwd:root,env:minimalEnvironment(),timeoutMs:3000,stdoutLimit:1024,stderrLimit:1024,signal:new AbortController().signal});
  if(JSON.parse(result.stdout).nonElevated!==true)throw new ExecutionFailure('ELEVATED_CONTEXT_DENIED');
}
export async function runDiagnosticProcess(root:string,actionId:DiagnosticActionId,parameters:unknown,signal:AbortSignal,engine:string):Promise<ProcessResult>{
  const definition=catalogDefinitions.find(d=>d.actionId===actionId);if(!definition)throw new ExecutionFailure('UNKNOWN_ACTION');
  const dto=parseDiagnosticParameters(actionId,parameters);const script=await verifyScript(root);
  const args=[engine,script,diagnosticScriptHash,String(process.pid),String(definition.timeoutMs),actionId];
  if(actionId==='eventlog.query'){const e=dto as {logName:string;level:string;timeWindow:string;limit:number};args.push(e.logName,e.level,e.timeWindow,String(e.limit));}
  return boundedProcess(await resolveProcessHost(root),args,{cwd:root,env:minimalEnvironment(),timeoutMs:definition.timeoutMs,stdoutLimit:definition.maxOutputBytes,stderrLimit:definition.maxStderrBytes,signal});
}
