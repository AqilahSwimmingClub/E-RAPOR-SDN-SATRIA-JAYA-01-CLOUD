import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Owner Panel disajikan Vercel dari Output Directory dist. Rewrite /owner dan /owner/ pada
   vercel.json mengarah ke /owner/index.html, jadi berkas itu WAJIB ada di hasil build. Ketika
   build web hanya menyalin aplikasi sekolah, rewrite menunjuk berkas yang tidak ada dan Vercel
   menjawab 404 NOT_FOUND — persis kegagalan yang dijaga suite ini agar tidak terulang.

   Panel tetap tinggal di server/public/owner dan TIDAK dipindahkan ke aplikasi sekolah;
   dist/owner hanyalah salinan hasil build. */

const root=new URL('../',import.meta.url);
const rootPath=fileURLToPath(root);
const read=path=>readFileSync(new URL(path,root),'utf8');
const SUMBER='server/public/owner';

/* Build dijalankan pada salinan proyek di direktori sementara supaya dist milik proyek tidak
   dihapus di tengah jalan oleh test lain yang membacanya. Berkas besar yang tidak sedang diuji
   cukup ditautkan, sedangkan Owner Panel disalin sungguhan. */
function bangunDiDirektoriSementara(){
  const temp=mkdtempSync(join(tmpdir(),'erapor-build-'));
  mkdirSync(join(temp,'scripts'),{recursive:true});
  cpSync(join(rootPath,'scripts/build-web.mjs'),join(temp,'scripts/build-web.mjs'));
  for(const berkas of ['index.html','manifest.webmanifest','sw.js'])
    cpSync(join(rootPath,berkas),join(temp,berkas));
  for(const direktori of ['assets','src'])symlinkSync(join(rootPath,direktori),join(temp,direktori),'dir');
  cpSync(join(rootPath,'server/public'),join(temp,'server/public'),{recursive:true});
  execFileSync(process.execPath,[join(temp,'scripts/build-web.mjs')],{cwd:temp,stdio:'pipe'});
  return temp;
}

test('1. Build web menyalin seluruh Owner Panel ke dist/owner',()=>{
  const temp=bangunDiDirektoriSementara();
  try{
    assert.ok(existsSync(join(temp,'dist/owner/index.html')),'dist/owner/index.html wajib ada');
    const sumber=readdirSync(join(rootPath,SUMBER)).sort();
    const hasil=readdirSync(join(temp,'dist/owner')).sort();
    assert.deepEqual(hasil,sumber,'seluruh berkas Owner Panel ikut tersalin');
    for(const berkas of sumber){
      assert.equal(readFileSync(join(temp,'dist/owner',berkas),'utf8'),read(`${SUMBER}/${berkas}`),
        `${berkas} tersalin apa adanya tanpa diubah`);
    }
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('2. Seluruh aset yang dirujuk halaman Owner Panel tersedia di dist/owner',()=>{
  const temp=bangunDiDirektoriSementara();
  try{
    const halaman=read(`${SUMBER}/index.html`);
    const rujukan=[...halaman.matchAll(/(?:href|src)="([^"]+)"/g)].map(item=>item[1])
      .filter(item=>!/^(https?:)?\/\//.test(item)&&!item.startsWith('data:')&&!item.startsWith('#'));
    assert.ok(rujukan.length>=2,'halaman memuat CSS dan JS panel');
    for(const item of rujukan){
      const relatif=item.replace(/^\.\//,'').replace(/^\//,'').split(/[?#]/)[0];
      assert.ok(existsSync(join(temp,'dist/owner',relatif)),`aset ${item} tersedia di dist/owner`);
    }
    /* Berkas panel tetap dapat dipakai: CSS berisi aturan, JS memanggil API lisensi. */
    assert.ok(readFileSync(join(temp,'dist/owner/panel.css'),'utf8').includes('{'));
    assert.match(readFileSync(join(temp,'dist/owner/app.js'),'utf8'),/\/api\/v1/);
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('3. Aplikasi sekolah tetap utuh dan Owner Panel tidak dipindahkan ke dalamnya',()=>{
  const temp=bangunDiDirektoriSementara();
  try{
    for(const berkas of ['index.html','manifest.webmanifest','sw.js'])
      assert.ok(existsSync(join(temp,'dist',berkas)),`${berkas} aplikasi sekolah tetap dibangun`);
    for(const direktori of ['assets','src'])assert.ok(existsSync(join(temp,'dist',direktori)));
    /* Sumber panel tetap di tempat asalnya, bukan pindah ke src aplikasi sekolah. */
    assert.ok(existsSync(new URL(`${SUMBER}/index.html`,root)),'Owner Panel tetap di server/public/owner');
    assert.equal(existsSync(new URL('src/pages/owner-panel.js',root)),false);
    assert.equal(existsSync(new URL('src/owner',root)),false);
    assert.equal(read('src/data/navigation.js').includes('/owner'),false,'menu sekolah tidak memuat Owner Panel');
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('4. Skrip build menyatakan salinan Owner Panel dan berhenti bila panel hilang',()=>{
  const skrip=read('scripts/build-web.mjs');
  assert.match(skrip,/server\/public\/owner/,'sumber panel disebut eksplisit');
  assert.match(skrip,/to:'owner'/,'tujuannya dist/owner');
  assert.match(skrip,/access\(resolve\(projectRoot,'server\/public\/owner\/index\.html'\)\)/,
    'build gagal terang-terangan bila index.html panel hilang');
  /* Output Directory tetap dist dan penjaga jalur build tidak dilonggarkan. */
  assert.match(skrip,/const output=resolve\(projectRoot,'dist'\)/);
  assert.match(skrip,/basename\(output\)!=='dist'\)throw new Error/);
});

test('5. vercel.json tetap mengarahkan /owner dan /owner/ ke halaman panel',()=>{
  const konfigurasi=JSON.parse(read('vercel.json'));
  const rewrite=Object.fromEntries(konfigurasi.rewrites.map(item=>[item.source,item.destination]));
  assert.equal(rewrite['/owner'],'/owner/index.html');
  assert.equal(rewrite['/owner/'],'/owner/index.html');
  assert.equal(rewrite['/api/v1/:path*'],'/api/[...route]','rewrite API lisensi tidak berubah');
  const header=konfigurasi.headers.find(item=>item.source==='/owner/(.*)');
  assert.ok(header,'header keamanan panel tetap ada');
  assert.equal(header.headers.find(item=>item.key==='X-Robots-Tag').value,'noindex, nofollow');
});
