import { access, cp, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(projectRoot,'dist');
const files=['index.html','manifest.webmanifest','sw.js'];
const directories=['assets','src'];

/* Owner Panel TIDAK ikut ke dalam aplikasi sekolah. Ia tetap tinggal di server/public/owner dan
   hanya disalin apa adanya ke dist/owner supaya Vercel — yang menyajikan Output Directory dist —
   punya berkas nyata untuk rewrite /owner dan /owner/ ke /owner/index.html. Tanpa salinan ini
   rewrite mengarah ke berkas yang tidak ada, dan Vercel menjawab 404 NOT_FOUND. */
const copiedDirectories=[
  ...directories.map(name=>({from:name,to:name})),
  {from:'server/public/owner',to:'owner'},
];

if(dirname(output)!==projectRoot||basename(output)!=='dist')throw new Error('Target build web tidak aman.');
for(const entry of [...files,...copiedDirectories.map(item=>item.from)])await access(resolve(projectRoot,entry));
await access(resolve(projectRoot,'server/public/owner/index.html'));
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of files)await cp(resolve(projectRoot,file),resolve(output,file));
for(const {from,to} of copiedDirectories)await cp(resolve(projectRoot,from),resolve(output,to),{recursive:true});
console.log(`Web build siap: ${output}`);
