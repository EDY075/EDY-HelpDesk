import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import path from 'node:path';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {boundedProcess,verifyScript,type SpawnProcess} from './process-runner.js';

function fake(){const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>{queueMicrotask(()=>child.emit('close',null));return true;})});const launch=vi.fn(()=>child) as unknown as SpawnProcess;return {child,launch};}
const opts=()=>({cwd:process.cwd(),env:{},timeoutMs:100,stdoutLimit:50,stderrLimit:10,signal:new AbortController().signal});
describe('process safety',()=>{
  afterEach(()=>vi.useRealTimers());
  it('spawns with shell=false, hidden window and closed stdin',async()=>{const f=fake(),promise=boundedext(f);f.child.stdout.write('{}');f.child.emit('close',0);expect((await promise).stdout).toBe('{}');expect(f.launch).toHaveBeenCalledWith('host',['approved'],expect.objectContaining({shell:false,windowsHide:true}));expect(f.child.stdin.writableEnded).toBe(true);});
  it('rejects failed processes without leaking stderr',async()=>{const f=fake(),p=boundedext(f);f.child.stderr.write('private');f.child.emit('close',2);await expect(p).rejects.toMatchObject({code:'PROCESS_FAILED'});});
  it('enforces stdout cap and terminates the containment host',async()=>{const f=fake(),p=boundedext(f);f.child.stdout.write('x'.repeat(51));await expect(p).rejects.toMatchObject({code:'OUTPUT_LIMIT'});expect(f.child.kill).toHaveBeenCalled();});
  it('enforces independent stderr cap',async()=>{const f=fake(),p=boundedext(f);f.child.stderr.write('x'.repeat(11));await expect(p).rejects.toMatchObject({code:'OUTPUT_LIMIT'});});
  it('enforces combined output cap',async()=>{const f=fake(),p=boundedext(f);f.child.stdout.write('x'.repeat(45));f.child.stderr.write('x'.repeat(6));await expect(p).rejects.toMatchObject({code:'OUTPUT_LIMIT'});});
  it('cancels a running child',async()=>{const f=fake(),abort=new AbortController(),p=boundedProcess('host',[],{...opts(),signal:abort.signal},f.launch);abort.abort();await expect(p).rejects.toMatchObject({code:'CANCELLED'});});
  it('does not spawn an already cancelled job',async()=>{const f=fake(),abort=new AbortController();abort.abort();await expect(boundedProcess('host',[],{...opts(),signal:abort.signal},f.launch)).rejects.toMatchObject({code:'CANCELLED'});expect(f.launch).not.toHaveBeenCalled();});
  it('bounds runtime and kills the host on timeout',async()=>{vi.useFakeTimers();const f=fake(),p=boundedext(f);const assertion=expect(p).rejects.toMatchObject({code:'TIMEOUT'});await vi.advanceTimersByTimeAsync(1101);await assertion;});
  it('maps kernel-host timeout and elevation refusal safely',async()=>{for(const [exit,code] of [[74,'TIMEOUT'],[77,'ELEVATED_CONTEXT_DENIED'],[79,'CONTAINMENT_UNAVAILABLE']] as const){const f=fake(),p=boundedext(f);f.child.emit('close',exit);await expect(p).rejects.toMatchObject({code});}});
  it('verifies the pinned collector hash',async()=>{await expect(verifyScript(path.resolve('../..'))).resolves.toMatch(/collect\.ps1$/);});
  it('rejects traversal, alternate paths and changed hashes',async()=>{await expect(verifyScript(path.resolve('../..'),'../outside.ps1')).rejects.toMatchObject({code:'SCRIPT_INTEGRITY_FAILURE'});await expect(verifyScript(path.resolve('../..'),undefined,'a'.repeat(64))).rejects.toMatchObject({code:'SCRIPT_INTEGRITY_FAILURE'});});
});
function boundedext(f:ReturnType<typeof fake>){return boundedProcess('host',['approved'],opts(),f.launch);}
