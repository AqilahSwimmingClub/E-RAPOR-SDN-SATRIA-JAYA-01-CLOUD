import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Lembar Rapor memakai Times New Roman dan menempatkan header tabel serta angka kolom No
   tepat di tengah selnya, mendatar maupun tegak. Ukuran huruf, struktur tabel, lebar kolom,
   dan perataan isi deskripsi tidak berubah sama sekali. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
/* Satu aturan sering ditulis untuk beberapa selector sekaligus, dan properti yang sama bisa
   ditetapkan berkali-kali. Seluruh aturan dipecah lalu dicocokkan per selector, dan nilai
   terakhir dianggap berlaku. */
function rules(selector){
  const hasil=[];
  for(const aturan of css().matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    /* Prelude @media ikut tertangkap di depan selector, jadi diambil bagian setelahnya. */
    const daftar=aturan[1].slice(aturan[1].lastIndexOf('{')+1).split(',').map(item=>item.trim());
    if(daftar.includes(selector))hasil.push(aturan[2]);
  }
  return hasil;
}
function prop(selector,name){
  const nilai=rules(selector).flatMap(isi=>[...isi.matchAll(new RegExp(`(^|;)\\s*${name}:([^;]*)`,'g'))].map(m=>m[2].trim()));
  return nilai.length?nilai[nilai.length-1]:'';
}

test('1. Lembar Rapor memakai Times New Roman, aplikasi tetap huruf semula',()=>{
  const font=prop('.report-a4','font-family');
  assert.match(font,/"Times New Roman",\s*Times,\s*serif/,'lembar rapor memakai Times New Roman dengan cadangan Times dan serif');
  /* Antarmuka aplikasi tidak ikut berubah. */
  const t=css();
  assert.match(t,/html,body\{[^}]*font-family:Inter/,'huruf aplikasi tetap Inter');
  assert.equal(/\.sidebar\{[^}]*font-family/.test(t),false,'sidebar tidak diberi huruf baru');
  assert.equal(/\.topbar\{[^}]*font-family/.test(t),false,'topbar tidak diberi huruf baru');
});

test('2. Seluruh bagian lembar Rapor ikut memakai huruf yang sama',()=>{
  /* Semua bagian yang disebut berada di dalam .report-a4, jadi satu penetapan huruf pada
     lembar itu sudah menurun ke seluruhnya. Yang diperiksa: tidak ada satu pun bagian di
     dalam lembar rapor yang menimpanya kembali dengan huruf lain. */
  const t=css();
  const penimpa=[...t.matchAll(/\.report-a4[^{]*\{([^}]*)\}/g)]
    .filter(blok=>/font-family:/.test(blok[1])&&!/Times New Roman/.test(blok[1]));
  assert.deepEqual(penimpa.map(blok=>blok[0].split('{')[0].trim()),[],'tidak ada bagian rapor yang memakai huruf lain');
  const bagian=['.report-a4 .document-heading','.report-a4 .report-head-table td','.report-a4 .document-box-body','.report-a4 .report-signatures','.report-a4 .document-foot'];
  for(const selector of bagian)assert.equal(prop(selector,'font-family'),'',`${selector} mewarisi huruf lembar rapor`);
});

test('3. Ukuran huruf lembar Rapor tidak berubah',()=>{
  const ukuran={
    '.report-a4 .document-table td':'10.5px',
    '.report-a4 .report-head-table td':'10.5px',
    '.report-a4 .document-heading':'14px',
    '.report-a4 .document-section':'11.5px',
    '.report-a4 .document-box-body':'10.5px',
    '.report-a4 .subject-group-row td':'10.5px',
    '.report-a4 .report-signatures':'10.5px',
    '.report-a4 .document-foot':'9.5px',
  };
  for(const [selector,nilai] of Object.entries(ukuran))
    assert.equal(prop(selector,'font-size'),nilai,`${selector} tetap ${nilai}`);
  /* Angka kolom No tidak pernah diberi ukuran sendiri. */
  for(const selector of ['.document-table td.activity-no','.report-learning-table .subject-no-cell'])
    assert.equal(prop(selector,'font-size'),'',`${selector} memakai ukuran isi tabel`);
});

test('4. Header tabel Pengetahuan dan Keterampilan center mendatar dan tegak',()=>{
  assert.equal(prop('.document-table th','text-align'),'center','header tabel center mendatar');
  const th=prop('.report-a4 .document-table th','vertical-align')||prop('.document-table th','vertical-align');
  assert.equal(th,'middle','header tabel center tegak');
  /* Keempat header memang berada pada tabel yang sama. */
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/<th>No<\/th><th>Mata Pelajaran<\/th><th>Nilai Akhir<\/th><th>Capaian Kompetensi<\/th>/,'susunan header tidak berubah');
});

test('5. Angka kolom No pada tabel mapel center mendatar dan tegak',()=>{
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/<td class="subject-no-cell">/,'sel nomor mapel punya penanda sendiri');
  const sel=prop('.report-learning-table .subject-no-cell','text-align');
  assert.equal(sel,'center','angka No center mendatar');
  assert.equal(prop('.report-learning-table .subject-no-cell','vertical-align'),'middle','angka No center tegak');
  /* Baris "Kelompok A" dan "Kelompok B" tidak ikut terpengaruh aturan kolom nomor. */
  assert.match(cetak,/<tr class="subject-group-row"><td colspan="4">/,'baris kelompok tetap satu sel penuh');
});

test('6. Angka No tabel kegiatan berada di tengah tinggi gabungan dua baris',()=>{
  assert.equal(prop('.document-table td.activity-no','text-align'),'center','angka kegiatan center mendatar');
  assert.equal(prop('.document-table td.activity-no','vertical-align'),'middle','angka kegiatan center tegak pada gabungan nama dan predikat');
  /* Aturan ini harus lebih khusus daripada ".document-table td" yang meratakan isi ke atas. */
  assert.equal(/(^|[,{;}])\.activity-no\{/.test(css()),false,'tidak memakai selector yang kalah kekhususan');
  /* Sel nama kegiatan memang menumpuk nama di atas predikat dalam satu sel. */
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/<span class="activity-name">/);
  assert.match(cetak,/<span class="activity-predicate">/);
});

test('7. Header tabel kegiatan center, judul bagian tetap center',()=>{
  assert.equal(prop('.activity-table th','vertical-align'),'middle','header kegiatan center tegak');
  assert.equal(prop('.activity-table th','text-align')||prop('.document-table th','text-align'),'center','header kegiatan center mendatar');
  const judul=prop('.activity-table th.activity-title','text-align')||prop('.document-table th','text-align');
  assert.equal(judul,'center','judul bagian tetap center');
});

test('8. Isi deskripsi tetap rata kiri',()=>{
  assert.equal(prop('.report-learning-table td:nth-child(4)','text-align'),'left','capaian kompetensi tetap rata kiri');
  assert.equal(prop('.report-learning-table td:nth-child(2)','text-align'),'left','nama mapel tetap rata kiri');
  assert.match(prop('.activity-note-cell','text-align'),/left/,'kolom Keterangan tetap rata kiri');
  /* Tidak ada aturan yang memaksa kolom deskripsi menjadi center. */
  assert.equal(/\.activity-note-cell\{[^}]*text-align:center/.test(css()),false);
});

test('9. Struktur, lebar kolom, dan pagination cetak tidak berubah',()=>{
  const t=css();
  assert.match(t,/\.report-learning-table th:nth-child\(1\)\{width:35px\}/,'lebar kolom No tetap');
  assert.match(t,/\.report-learning-table th:nth-child\(3\)\{width:55px\}/,'lebar kolom Nilai Akhir tetap');
  assert.match(t,/@media print\{[^@]*\.document-sheet\{break-inside:auto\}/,'lembar rapor tetap boleh mengalir antar halaman');
  assert.match(t,/\.activity-table tr\{break-inside:avoid\}/,'baris kegiatan tetap tidak terbelah');
  assert.match(t,/\.activity-table thead\{display:table-header-group\}/,'judul bagian tetap tercetak ulang');
  assert.match(t,/\.report-learning-table thead\{display:table-header-group\}/,'header tabel mapel tetap tercetak ulang');
});
