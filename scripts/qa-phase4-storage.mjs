import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
const expected=[
  ['ARCHITECTURE.md','091972EE6CBF218C1B5BC6991263B1B9AD2EF4B76153787FBE4C22AD1BBE82D1'],
  ['ROADMAP.md','E424B87621BF324874323ED22CFA35C2D2276EF7378D88B9624612C8AFBC9E1F'],
  ['SECURITY.md','C9793752F99D3D30ED45B88851E3BC0D2824B3AAA524D7A126F16ED9D7A7C5C1'],
  ['docs/PHASE-3-FINAL-REPORT.md','A06D2543583F72071832021908A99238738F22A3B88BD55B089589A61580345E'],
];
const adrHashes=['26A472E9793EE90EE16D15FA7504C20C50013779692B8B45AC133D344571579C','339F0B444C5D119794496BCFC20AD8B2C6BF02C52EEA28D2A4A57964DA200DC5','4546812F327EA61D05E074EF2145656A7B2B4CDA5E20229A59AB905B4DE11241','6D874F3243D5BCFE83A0DEB4D7122C61EDAA8B6C208DD267C02298F581B1B7E8','7ADE854825E6E2840C0C69C7B4483D0539FF2F0FBB6D4A810BC0EC1CB6D30A3E','5DDB770FBB561CCDB34B9511A327E8325967CFA9851F100CCED98B535572872E'];
const adrs=readdirSync('docs/adr').filter(f=>f.endsWith('.md')).sort();assert.equal(adrs.length,6);
for(const [i,file] of adrs.entries())expected.push([path.join('docs/adr',file),adrHashes[i]]);
for(const [file,hash] of expected)assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase(),hash,file);
const db=new Database('storage/edy-helpdesk.db',{readonly:true});
try{
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
  assert.equal(db.prepare('SELECT mode FROM DeploymentState').get().mode,'Demo');
  const count=(sql)=>db.prepare(sql).get().n;
  assert.equal(count("SELECT count(*) n FROM DiagnosticResult WHERE sourceMode <> 'Demo'"),0);
  assert.equal(count('SELECT count(*) n FROM DiagnosticAction'),9);
  assert.equal(count('SELECT count(*) n FROM DiagnosticResult'),9);
  assert.equal(count('SELECT count(*) n FROM _edy_migrations'),5);
  const sourceFile=readFileSync('scripts/diagnostics/collect.ps1');
  const hash=createHash('sha256').update(sourceFile).digest('hex');
  assert.equal(count(`SELECT count(*) n FROM DiagnosticAction WHERE scriptHash = '${hash}' AND requiresElevation = 0`),9);
  console.log(JSON.stringify({storage:'PASS',protectedDocuments:expected.length,migrations:5,integrity:'ok',foreignKeyViolations:0,diagnosticActions:9,syntheticResults:9,operationalResultsInDemo:0}));
}finally{db.close();}
