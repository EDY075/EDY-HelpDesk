import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
// Build artifact generation, never runtime script generation. Uses the Windows compiler.
if(process.platform!=='win32')throw new Error('Windows is required for the process containment host.');
const root=process.cwd();const out=path.join(root,'storage','runtime');await mkdir(out,{recursive:true});
const source=path.join(root,'apps','diagnostics-worker','native','ProcessHost.cs');
const compiler=path.join(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
const executable=path.join(out,'Edy.ProcessHost.exe');
const result=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/out:'+executable,source],{shell:false,windowsHide:true,encoding:'utf8',timeout:30_000});
if(result.status!==0)throw new Error(result.stdout||'Process host build failed');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await writeFile(path.join(out,'process-host-build.json'),JSON.stringify({sourceHash:sha(await readFile(source)),binaryHash:sha(await readFile(executable))},null,2));
console.log('Windows process containment host built in ignored local storage.');
