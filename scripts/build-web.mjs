import { access, cp, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(projectRoot,'dist');
const files=['index.html','manifest.webmanifest','sw.js'];
const directories=['assets','src'];

if(dirname(output)!==projectRoot||basename(output)!=='dist')throw new Error('Target build web tidak aman.');
for(const entry of [...files,...directories])await access(resolve(projectRoot,entry));
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of files)await cp(resolve(projectRoot,file),resolve(output,file));
for(const directory of directories)await cp(resolve(projectRoot,directory),resolve(output,directory),{recursive:true});
console.log(`Web build siap: ${output}`);
