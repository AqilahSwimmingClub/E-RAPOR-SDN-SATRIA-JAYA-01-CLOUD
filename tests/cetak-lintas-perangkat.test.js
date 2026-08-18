import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

/* Blok @media dipisah beserta isinya supaya dapat diperiksa satu per satu. Komentar dibuang
   lebih dulu agar kata "@media" yang muncul di dalam penjelasan tidak ikut terbaca. */
function blokMedia(sumber){
  const css=sumber.replace(/\/\*[\s\S]*?\*\//g,'');
  const daftar=[];const re=/@media([^{]*)\{/g;let m;
  while((m=re.exec(css))){
    let i=re.lastIndex,dalam=1;
    while(i<css.length&&dalam>0){if(css[i]==='{')dalam++;else if(css[i]==='}')dalam--;i++;}
    daftar.push({kondisi:m[1].trim(),isi:css.slice(re.lastIndex,i-1)});
  }
  return daftar;
}

test('1. Aturan layar sempit tidak pernah ikut aktif saat mencetak',()=>{
  const css=read('src/styles/app.css');
  /* Lebar layout cetak A4 potret adalah 794px, jadi @media(max-width:767px) tanpa kata "screen"
     tetap tidak menyentuh lembar cetak. Yang berbahaya adalah aturan yang mengubah geometri
     lembar rapor dan cover: aturan itu wajib dibatasi ke layar saja. */
  const berisiko=blokMedia(css).filter(blok=>/max-width/.test(blok.kondisi)&&/\.report-a4|\.report-cover-a4/.test(blok.isi));
  assert.ok(berisiko.length,'ada aturan layar sempit untuk lembar rapor/cover');
  for(const blok of berisiko)
    assert.match(blok.kondisi,/^screen and /,`aturan layar sempit "${blok.kondisi}" wajib dibatasi ke media screen`);
});

test('2. Margin samping lembar rapor saat cetak tetap dibawa lembar itu sendiri',()=>{
  const css=read('src/styles/app.css');
  /* Kerangka cetak Android mengabaikan margin @page, sehingga margin samping harus melekat pada
     lembar. !important memastikan margin ini menang atas aturan pratinjau layar sempit. */
  assert.match(css,/\.report-a4\{padding:0 13mm!important\}/,'margin cetak 13mm dibawa lembar');
  assert.match(read('src/pages/print.js'),/else if\(tab==='report'\)setPrintPageSize\('portrait','10mm 0'\)/,'@page memberi margin atas-bawah saja');
  assert.match(css,/\.report-a4\{padding:14mm 13mm\}/,'pratinjau layar lebar tetap 14mm/13mm');
});

test('3. Pratinjau pada HP dikecilkan marginnya agar tabel rapor tidak terpotong',()=>{
  const css=read('src/styles/app.css');
  const blok=blokMedia(css).find(item=>item.kondisi==='screen and (max-width:767px)'&&/\.report-a4\{padding:16px 12px\}/.test(item.isi));
  assert.ok(blok,'ada aturan pratinjau khusus layar sempit');
  assert.match(blok.isi,/\.print-workspace \.report-a4\{overflow-x:auto;overflow-y:hidden\}/,'lembar boleh digeser mendatar, bukan dipotong');
});

test('4. Ukuran huruf rapor tidak dikecilkan oleh aturan layar sempit',()=>{
  const css=read('src/styles/app.css');
  /* Aturan umum .document-table pada layar sempit memakai 8px. Lembar rapor memakai selector
     yang lebih spesifik sehingga ukurannya tetap 10,5px di HP, tablet, maupun desktop. */
  assert.match(css,/\.report-a4 \.document-table th,\.report-a4 \.document-table td\{padding:5px 7px;font-size:10\.5px;line-height:1\.4\}/);
  assert.match(css,/\.report-a4 \.report-head-table td\{font-size:10\.5px\}/,'baris identitas dipulihkan saat cetak');
  for(const blok of blokMedia(css).filter(item=>/max-width/.test(item.kondisi)))
    assert.equal(/\.report-a4 [^{}]*\{[^}]*font-size:(?:[0-9](?:\.\d+)?)px/.test(blok.isi),false,`blok "${blok.kondisi}" tidak boleh mengecilkan huruf lembar rapor di bawah 10px`);
});

test('5. Warna lembar cetak tetap putih pada semua perangkat dan tema',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/\.print-workspace,\.document-sheet,\.report-a4,\.report-cover-a4\{color-scheme:light;forced-color-adjust:none;-webkit-print-color-adjust:exact;print-color-adjust:exact\}/);
  const gelap=blokMedia(css).find(item=>item.kondisi==='(prefers-color-scheme:dark)');
  assert.match(gelap.isi,/\.document-a4,\.document-sheet,\.report-a4,\.report-cover-a4,\.print-workspace\{background:#fff;color:#171412\}/,'tema gelap tidak menghitamkan lembar');
  assert.match(read('capacitor.config.json'),/"backgroundColor":\s*"#ffffff"/,'WebView Android berlatar putih');
});
