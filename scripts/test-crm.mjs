import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.test-output/tests');
mkdirSync(output,{recursive:true});
function run(args) {
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status || 1);
}
run([
  resolve(root,'node_modules/typescript/bin/tsc'),
  '--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext',
  '--outDir',output,'--skipLibCheck','--esModuleInterop',
  'tests/crm-engine.test.ts','tests/crm-access.test.ts','tests/sales-forecast.test.ts','tests/follow-up-agenda.test.ts','tests/owner-priorities.test.ts',
  'lib/crm-engine.ts','lib/crm-types.ts',
]);
run(['--test',...['crm-engine','crm-access','sales-forecast','follow-up-agenda','owner-priorities'].map(name=>resolve(output,'tests',name+'.test.js'))]);
