import assert from 'node:assert/strict';
import {spawn,spawnSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {boundedProcess,resolveProcessHost,resolveEngine,minimalEnvironment,type SpawnProcess} from '../apps/diagnostics-worker/src/process-runner.js';

const root=process.cwd(),fixture=path.join(root,'tests','diagnostics','containment');
const script=path.join(fixture,'scripts','diagnostics','collect.ps1');
const hash=createHash('sha256').update(await readFile(script)).digest('hex');
const host=await resolveProcessHost(root),engine=await resolveEngine();
const compiler=path.join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
type Owned={pid:number;rootPid:number};
if(process.argv.includes('--parent-exit-fixture')){
  const args=[engine,script,hash,String(process.pid),'10000','windows.system.summary'];
  const child=spawn(host,args,{cwd:fixture,env:minimalEnvironment(),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});child.stdin.end();
  child.stdout.once('data',bytes=>{process.stdout.write(bytes,()=>process.exit(0));});child.stderr.resume();
}else{
  assert.equal(process.platform,'win32');
  const build=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/out:'+path.join(root,'storage','runtime','Edy.SleepProbe.exe'),path.join(fixture,'SleepProbe.cs')],{shell:false,windowsHide:true,timeout:30000});assert.equal(build.status,0);
  const gone=(pid:number)=>{try{process.kill(pid,0);return false;}catch{return true;}};
  async function assertGone(owned:Owned){const until=Date.now()+5000;while(Date.now()<until){if(gone(owned.pid)&&gone(owned.rootPid))return;await new Promise(r=>setTimeout(r,50));}assert.fail('An owned test descendant survived containment cleanup');}
  for(const scenario of ['TIMEOUT','CANCELLED','OUTPUT_LIMIT'] as const){
    let owned:Owned|undefined;const abort=new AbortController();
    const launch:SpawnProcess=(exe,args,options)=>{const child=spawn(exe,args,options) as ChildProcessWithoutNullStreams;child.stdout.once('data',bytes=>{owned=JSON.parse(bytes.toString()) as Owned;if(scenario==='CANCELLED')abort.abort();});return child;};
    await assert.rejects(boundedProcess(host,[engine,script,hash,String(process.pid),'1500','windows.system.summary'],{cwd:fixture,env:minimalEnvironment(),timeoutMs:1500,stdoutLimit:scenario==='OUTPUT_LIMIT'?10:1024,stderrLimit:1024,signal:abort.signal},launch),(e:unknown)=>e instanceof Error&&e.message===scenario);
    assert.ok(owned,'The inert descendant must have started before the test');await assertGone(owned);
    console.log(JSON.stringify({containment:scenario,result:'PASS',orphanedDescendants:0}));
  }
  const parent=spawn(process.execPath,['--import','tsx','scripts/qa-containment.ts','--parent-exit-fixture'],{cwd:root,env:process.env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';parent.stdout.on('data',c=>{output+=c.toString();});parent.stderr.resume();await new Promise<void>(resolve=>parent.once('close',()=>resolve()));assert.equal(parent.exitCode,0);await assertGone(JSON.parse(output) as Owned);
  console.log(JSON.stringify({containment:'PARENT_EXIT',result:'PASS',orphanedDescendants:0}));
}
