import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nilaiMenang, specificity } from './helpers/cascade.js';
import { tataLetakBaris } from './helpers/tata-letak-baris.js';
import { extractFunctionSource } from './helpers/report-markup.js';
import { escapeHtml } from '../src/ui/dom.js';
import { reportSubjectName } from '../src/services/subjects.js';

/* PERATAAN TEGAK KOLOM RAPOR, DIUJI DARI HASIL TATA LETAK - BUKAN DARI ADANYA DEKLARASI.

   Test lama pada report-layout-lock hanya memastikan `vertical-align:middle` TERTULIS di
   berkas gaya. Itu tidak cukup, dan justru melewatkan bentuk bug yang sebenarnya terjadi:
   deklarasinya ada, tetapi yang MENANG adalah aturan lain yang kekhususannya lebih tinggi.
   Nama mata pelajaran karena itu tetap menempel ke atas sel walau test CSS lulus.

   Suite ini menutup celah itu dengan tiga lapis yang berurutan:

     1. Markup diambil dari `subjectRows` yang asli, sehingga kelas dan urutan kolom yang
        diuji adalah yang benar-benar dicetak.
     2. Nilai CSS dihitung sebagai PEMENANG cascade - !important, lalu kekhususan, lalu
        urutan - bukan sekadar dicari dengan pencocokan teks.
     3. Nilai pemenang itu dimasukkan ke model kotak sel tabel, lalu titik tengah tegak isi
        tiap kolom dibandingkan. Inilah yang dinilai mata: selisih maksimal 1px antara
        pusat No, Mata Pelajaran, dan Nilai Akhir.

   Lapis ketiga diuji juga pada baris yang tinggi (Capaian Kompetensi sampai delapan baris),
   karena pada baris satu barispun perbedaan `top` dan `middle` tidak terlihat. */

const root=new URL('../',import.meta.url);
const gaya=readFileSync(new URL('src/styles/app.css',root),'utf8');
const AMBANG=1;

function subjectRowsAsli(doc){
  const sumber=extractFunctionSource(readFileSync(new URL('src/pages/print.js',root),'utf8'),'subjectRows');
  return new Function('escapeHtml','reportSubjectName',`${sumber}\nreturn subjectRows;`)(escapeHtml,reportSubjectName)(doc);
}

/* Kelas tiap kolom dibaca dari markup yang dicetak, supaya penggantian nama kelas di
   print.js langsung terlihat di sini alih-alih membuat test ini diam-diam menguji kelas mati. */
function kolomDariMarkup(){
  const html=subjectRowsAsli({subjects:[
    {subject:{id:'mtk',group:'A',name:'Matematika'},score:82,description:'Ananda menunjukkan capaian yang baik.'},
  ]});
  const sel=[...html.matchAll(/<td class="([^"]+)"[^>]*>/g)].map(item=>item[1].trim().split(/\s+/));
  assert.equal(sel.length,4,'satu baris mata pelajaran tetap terdiri dari empat kolom');
  return sel.map((kelas,index)=>({kelas,nthChild:index+1,lastChild:index===sel.length-1}));
}

const LELUHUR=['document-a4','document-sheet','report-a4','document-table','report-learning-table'];
const konteksSel=kolom=>({tag:'td',kelas:kolom.kelas,nthChild:kolom.nthChild,lastChild:kolom.lastChild,
  leluhur:LELUHUR,leluhurTag:['section','table','tbody','tr']});

/* Tiga keadaan tampilan yang dipakai pengguna: layar lebar, layar sempit (aturan ringkas HP
   ikut aktif), dan media cetak - yang dipakai Simpan sebagai PDF maupun cetak kertas. */
const KEADAAN=[
  {nama:'layar lebar',mediaAktif:null},
  {nama:'layar sempit (<=767px)',mediaAktif:query=>/max-width:\s*767px/.test(query)},
  {nama:'media cetak',mediaAktif:query=>/(^|\s|\()print(\)|\s|$)/.test(query)},
];

const menang=(kolom,properti,keadaan)=>nilaiMenang(gaya,konteksSel(kolom),properti,{mediaAktif:keadaan.mediaAktif});
const nilai=(kolom,properti,keadaan,bawaan=null)=>{const hasil=menang(kolom,properti,keadaan);return hasil?hasil.nilai:bawaan;};

test('R1. Markup baris rapor tetap empat kolom dengan kelas yang dikenali gaya',()=>{
  const [no,nama,skor,deskripsi]=kolomDariMarkup();
  assert.deepEqual(no.kelas,['subject-no-cell']);
  assert.deepEqual(nama.kelas,['subject-name-cell']);
  assert.deepEqual(skor.kelas,['subject-score-cell']);
  assert.deepEqual(deskripsi.kelas,['subject-description-cell']);
});

test('R2. Pemenang cascade: Mata Pelajaran rata KIRI, No dan Nilai Akhir rata tengah',()=>{
  const [no,nama,skor]=kolomDariMarkup();
  for(const keadaan of KEADAAN){
    assert.equal(nilai(nama,'text-align',keadaan),'left',
      `nama mata pelajaran harus tetap rata kiri pada ${keadaan.nama}`);
    assert.equal(nilai(no,'text-align',keadaan),'center',`No rata tengah pada ${keadaan.nama}`);
    assert.equal(nilai(skor,'text-align',keadaan),'center',`Nilai Akhir rata tengah pada ${keadaan.nama}`);
  }
});

test('R3. Pemenang cascade: tiga kolom sejajar memakai vertical-align middle',()=>{
  const [no,nama,skor]=kolomDariMarkup();
  for(const keadaan of KEADAAN)
    for(const [label,kolom] of [['No',no],['Mata Pelajaran',nama],['Nilai Akhir',skor]]){
      const hasil=menang(kolom,'vertical-align',keadaan);
      assert.ok(hasil,`${label} harus punya vertical-align yang menang pada ${keadaan.nama}`);
      assert.equal(hasil.nilai,'middle',
        `${label} pada ${keadaan.nama} dimenangkan oleh "${hasil.selektor}" dengan nilai "${hasil.nilai}"`);
      /* Kemenangannya harus datang dari kekhususan, bukan dari !important yang menutupi
         susunan gaya. Ini menjaga perbaikannya tetap tepat sasaran. */
      assert.equal(hasil.penting,false,`${label} tidak perlu !important untuk menang`);
    }
});

test('R4. Aturan dasar lembar rapor tetap rata atas: perbaikan tidak melebar ke sel lain',()=>{
  const selBiasa={tag:'td',kelas:['activity-name'],nthChild:2,lastChild:false,
    leluhur:['document-a4','document-table','activity-table'],leluhurTag:['section','table','tbody','tr']};
  assert.equal(nilaiMenang(gaya,selBiasa,'vertical-align',{mediaAktif:null})?.nilai,'top',
    'sel lain pada lembar rapor tetap rata atas seperti sebelum perbaikan');
  /* Alasan perbaikan ini bekerja: kekhususan penimpanya memang lebih tinggi dari aturan dasar. */
  assert.deepEqual(specificity('.report-learning-table .subject-name-cell'),[0,2,0]);
  assert.deepEqual(specificity('.document-table td'),[0,1,1]);
});

/* Ukuran kotak sel diambil dari gaya yang menang juga, sehingga model tata letak di bawah
   memakai angka yang sama dengan yang dipakai peramban. */
const simpanan=new Map();
function dasarSel(kolom,keadaan){
  const kunci=`${kolom.kelas.join('.')}|${keadaan.nama}`;
  if(!simpanan.has(kunci))simpanan.set(kunci,{
    nama:kolom.kelas[0],
    /* line-height tanpa satuan dikali ukuran huruf. Kolom No dan Nilai Akhir tidak
       menyetelnya, jadi memakai `normal` yang untuk Arial mendekati 1.2. Angka itu tidak
       menentukan hasil test: pada vertical-align middle titik tengah isi sel selalu jatuh di
       tengah tinggi baris berapa pun tinggi isinya. */
    fontSize:Number.parseFloat(nilai(kolom,'font-size',keadaan,'10.5px')),
    lineHeight:Number.parseFloat(nilai(kolom,'line-height',keadaan,'1.2')),
    padding:nilai(kolom,'padding',keadaan,'7px'),
    verticalAlign:nilai(kolom,'vertical-align',keadaan,'top'),
  });
  return simpanan.get(kunci);
}
const selUntukModel=(kolom,keadaan,barisTeks)=>({...dasarSel(kolom,keadaan),barisTeks});

test('R5. Pusat tegak No, Mata Pelajaran, dan Nilai Akhir selisihnya <= 1px',()=>{
  const [no,nama,skor,deskripsi]=kolomDariMarkup();
  let terbesar=0;
  const rinci=[];
  for(const keadaan of KEADAAN)
    /* Nama mata pelajaran boleh turun sampai lima baris, dan Capaian Kompetensi sampai
       delapan baris. Justru pada baris yang tinggi itulah perbedaan top dan middle muncul. */
    for(const barisNama of [1,2,3,4,5])
      for(const barisDeskripsi of [1,2,4,6,8]){
        const baris=tataLetakBaris([
          selUntukModel(no,keadaan,1),
          selUntukModel(nama,keadaan,barisNama),
          selUntukModel(skor,keadaan,1),
          selUntukModel(deskripsi,keadaan,barisDeskripsi),
        ]);
        const p=baris.pusat;
        const bedaNo=Math.abs(p['subject-no-cell']-p['subject-name-cell']);
        const bedaSkor=Math.abs(p['subject-score-cell']-p['subject-name-cell']);
        terbesar=Math.max(terbesar,bedaNo,bedaSkor);
        assert.ok(bedaNo<=AMBANG,
          `${keadaan.nama}: pusat No meleset ${bedaNo.toFixed(2)}px dari nama mata pelajaran `+
          `(nama ${barisNama} baris, capaian ${barisDeskripsi} baris, tinggi baris ${baris.tinggiBaris.toFixed(2)}px)`);
        assert.ok(bedaSkor<=AMBANG,
          `${keadaan.nama}: pusat Nilai Akhir meleset ${bedaSkor.toFixed(2)}px dari nama mata pelajaran `+
          `(nama ${barisNama} baris, capaian ${barisDeskripsi} baris)`);
        rinci.push(baris.tinggiBaris);
      }
  assert.ok(rinci.some(tinggi=>tinggi>40),'sebagian kasus uji memang baris tinggi, bukan satu baris saja');
  assert.ok(terbesar<=AMBANG);
});

test('R6. Model tata letaknya memang bisa gagal: vertical-align top kembali meleset jauh',()=>{
  /* Kontrol negatif. Tanpa ini, R5 bisa saja lulus karena modelnya tumpul dan bukan karena
     gayanya benar. Di sini nama mata pelajaran sengaja dikembalikan ke keadaan sebelum
     perbaikan - rata atas - dan selisihnya wajib melebihi ambang. */
  const [no,nama,skor,deskripsi]=kolomDariMarkup();
  const keadaan=KEADAAN[0];
  const baris=tataLetakBaris([
    selUntukModel(no,keadaan,1),
    {...selUntukModel(nama,keadaan,2),verticalAlign:'top'},
    selUntukModel(skor,keadaan,1),
    selUntukModel(deskripsi,keadaan,8),
  ]);
  const beda=Math.abs(baris.pusat['subject-no-cell']-baris.pusat['subject-name-cell']);
  assert.ok(beda>AMBANG,
    `model harus menandai keadaan lama sebagai gagal, tetapi selisihnya hanya ${beda.toFixed(2)}px`);
});
