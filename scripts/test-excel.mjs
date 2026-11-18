import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.test-output/excel-tests');mkdirSync(output,{recursive:true});
for(const args of [
  [resolve(root,'node_modules/typescript/bin/tsc'),'--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--outDir',output,'--skipLibCheck','--esModuleInterop','tests/customer-excel.test.ts','lib/customer-excel.ts'],
  ['--test',resolve(output,'tests/customer-excel.test.js')],
]) {const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
