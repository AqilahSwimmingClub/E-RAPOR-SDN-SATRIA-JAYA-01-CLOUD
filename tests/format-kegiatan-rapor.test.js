import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { createExtracurricular, pramukaDescriptionsForClass, pramukaPresetForClass, saveStudentCocurricular } from '../src/services/completeness.js';
import { getReportDocument } from '../src/services/documents.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';
import { activityDescription, activityTable, cocurricularTable, extracurricularTable } from '../src/pages/print.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}

/* Baris tabel dipecah menjadi daftar sel supaya isi setiap kolom dapat diperiksa apa adanya. */
function barisTabel(html){
  return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(baris=>[...baris[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(sel=>sel[1]));
}
const judulBagian=html=>html.match(/<th colspan="3" class="activity-title">([^<]*)<\/th>/)?.[1]||'';
const CONTOH='Mampu menjelaskan dampak menjaga kebersihan bagi kesehatan dan kenyamanan bersama.';

/* -------------------------------------------- 1-4. Bentuk bagian sesuai contoh dari guru */

test('1. Setiap bagian diawali baris judul selebar tabel lalu kolom No, kegiatan, dan Keterangan',()=>{
  const eks=activityTable('Ekstrakurikuler',[{name:'Pramuka Penggalang',predicate:'Baik',description:'Deskripsi.'}],{studentName:'Bayu Saputra'});
  const koku=activityTable('Kokurikuler',[{name:'Proyek Peduli Lingkungan',predicate:'Baik',description:'Deskripsi.'}],{studentName:'Bayu Saputra'});
  assert.equal(judulBagian(eks),'EKSTRAKURIKULER','judul bagian ekstrakurikuler huruf besar');
  assert.equal(judulBagian(koku),'KOKURIKULER','judul bagian kokurikuler huruf besar');
  assert.deepEqual(barisTabel(eks)[1],['No','Ekstrakurikuler','Keterangan']);
  assert.deepEqual(barisTabel(koku)[1],['No','Kokurikuler','Keterangan']);
  /* Tabel kegiatan kembali memakai garis penuh seperti tabel mata pelajaran. */
  for(const html of [eks,koku])assert.match(html,/<table class="document-table activity-table">/);
});

test('2. Predikat berada di kolom kegiatan, tepat di bawah nama kegiatannya',()=>{
  const html=activityTable('Kokurikuler',[{name:'Proyek Peduli Lingkungan',predicate:'Sangat Baik',description:CONTOH}],{studentName:'Bayu Saputra'});
  const isi=barisTabel(html)[2];
  assert.equal(isi[0],'1','baris pertama bernomor 1');
  assert.equal(isi[1],'<span class="activity-name">Proyek Peduli Lingkungan</span><span class="activity-predicate">SANGAT BAIK</span>','nama kegiatan lalu predikat pada baris berikutnya');
});

test('3. Kolom Keterangan hanya berisi deskripsi pilihan guru, tanpa predikat',()=>{
  const html=activityTable('Kokurikuler',[{name:'Proyek Peduli Lingkungan',predicate:'Baik',description:CONTOH}],{studentName:'Bayu Saputra'});
  const keterangan=barisTabel(html)[2][2];
  assert.equal(keterangan,'Ananda Bayu mampu menjelaskan dampak menjaga kebersihan bagi kesehatan dan kenyamanan bersama.');
  assert.equal(/BAIK/.test(keterangan),false,'predikat tidak lagi ikut di kolom Keterangan');
});

test('4. Predikat ditulis huruf besar seperti BAIK dan SANGAT BAIK',()=>{
  for(const [predikat,tampil] of [['Baik','BAIK'],['Sangat Baik','SANGAT BAIK'],['Cukup','CUKUP']]){
    const html=activityTable('Ekstrakurikuler',[{name:'Pramuka Penggalang',predicate:predikat,description:'Deskripsi.'}],{studentName:'Bayu'});
    assert.match(html,new RegExp(`<span class="activity-predicate">${tampil}</span>`),`${predikat} tampil sebagai ${tampil}`);
  }
});

/* ----------------------------------------------------- 5-7. Deskripsi "Ananda <nama> ..." */

test('5. Deskripsi diawali nama panggilan murid seperti pada contoh',()=>{
  assert.equal(activityDescription(CONTOH,'Bayu Saputra'),`Ananda Bayu mampu menjelaskan dampak menjaga kebersihan bagi kesehatan dan kenyamanan bersama.`);
  assert.equal(activityDescription('Aktif mengikuti kegiatan kepramukaan.','Adwa Habibi Rizky'),'Ananda Adwa aktif mengikuti kegiatan kepramukaan.');
});

test('6. Nama tidak ditambahkan dua kali bila guru sudah menuliskannya sendiri',()=>{
  assert.equal(activityDescription('Ananda Bayu sudah mampu bekerja sama.','Bayu Saputra'),'Ananda Bayu sudah mampu bekerja sama.');
  assert.equal(activityDescription('ananda bayu rajin berlatih.','Bayu'),'ananda bayu rajin berlatih.');
});

test('7. Deskripsi tetap utuh saat nama murid tidak tersedia',()=>{
  assert.equal(activityDescription(CONTOH,''),CONTOH,'tanpa nama, deskripsi tidak diubah');
  assert.equal(activityDescription('',''),'','deskripsi kosong tetap kosong');
  assert.equal(activityDescription('TIM inti mengikuti lomba.','Bayu'),'Ananda Bayu TIM inti mengikuti lomba.','singkatan di awal kalimat tidak dikecilkan');
});

/* ------------------------------------------------------- 8-9. Bagian kosong dan keamanan */

test('8. Bagian kegiatan yang belum diisi tetap tidak ikut tercetak',()=>{
  assert.equal(extracurricularTable({extracurricular:[]}),'','ekstrakurikuler kosong tidak mencetak apa pun');
  assert.equal(extracurricularTable({}),'','data ekstrakurikuler tidak ada pun aman');
  assert.equal(cocurricularTable({cocurricular:null}),'','kokurikuler kosong tidak mencetak apa pun');
  assert.equal(cocurricularTable({}),'','data kokurikuler tidak ada pun aman');
  assert.equal(activityTable('Ekstrakurikuler',[{name:'',predicate:'Baik',description:'Deskripsi.'}]),'','baris tanpa nama kegiatan dibuang');
});

test('9. Nama kegiatan dan deskripsi tetap diamankan dari karakter HTML',()=>{
  const html=activityTable('Ekstrakurikuler',[{name:'Seni <Tari>',predicate:'Baik',description:'Deskripsi "tanda" & <b>tebal</b>.'}],{studentName:'Bayu'});
  assert.equal(html.includes('<Tari>'),false,'nama kegiatan tidak menyuntik tag');
  assert.equal(html.includes('<b>tebal</b>'),false,'deskripsi tidak menyuntik tag');
  assert.match(html,/Seni &lt;Tari&gt;/);
  assert.match(html,/&amp;/);
});

/* ------------------------------------------- 10-11. Data asli guru sampai ke lembar rapor */

test('10. Ekstrakurikuler siswa tampil bernomor dengan predikat dan deskripsi pilihannya',()=>{
  useMemoryStorage();
  const session=guru('5B');aktifkan(session,['pai','bindo']);
  const murid=siswa(session,'EKS',{name:'Bayu Saputra'});
  const deskripsi=pramukaDescriptionsForClass('5B');
  createExtracurricular(session,murid.id,{name:pramukaPresetForClass('5B'),predicate:'Sangat Baik',description:deskripsi[3]});
  createExtracurricular(session,murid.id,{name:'Futsal',predicate:'Baik',description:'Menunjukkan kerja sama dan sportivitas dalam latihan.'});
  const doc=getReportDocument(session,murid.id);
  const html=extracurricularTable(doc);
  assert.equal(judulBagian(html),'EKSTRAKURIKULER');
  const baris=barisTabel(html).slice(2);
  assert.deepEqual(baris.map(item=>item[0]),['1','2'],'penomoran urut');
  assert.equal(baris[0][1],`<span class="activity-name">Pramuka Penggalang</span><span class="activity-predicate">SANGAT BAIK</span>`);
  assert.equal(baris[1][1],`<span class="activity-name">Futsal</span><span class="activity-predicate">BAIK</span>`);
  assert.equal(baris[0][2],`Ananda Bayu ${deskripsi[3].charAt(0).toLowerCase()}${deskripsi[3].slice(1)}`,'deskripsi yang dipilih guru dengan nama murid di depannya');
  assert.equal(baris[1][2],'Ananda Bayu menunjukkan kerja sama dan sportivitas dalam latihan.');
});

test('11. Kokurikuler pilihan guru tampil persis seperti contoh format',()=>{
  useMemoryStorage();
  const session=guru('5B');aktifkan(session,['pai','bindo']);
  const murid=siswa(session,'KOKU',{name:'Bayu Saputra'});
  saveStudentCocurricular(session,murid.id,{activity:'Proyek Peduli Lingkungan',predicate:'Baik',description:CONTOH});
  const isi=barisTabel(cocurricularTable(getReportDocument(session,murid.id)))[2];
  assert.equal(isi[0],'1');
  assert.equal(isi[1],'<span class="activity-name">Proyek Peduli Lingkungan</span><span class="activity-predicate">BAIK</span>');
  assert.equal(isi[2],'Ananda Bayu mampu menjelaskan dampak menjaga kebersihan bagi kesehatan dan kenyamanan bersama.');
});

/* ----------------------------------------------------------------- 12-13. Tata letak cetak */

test('12. Garis pemisah kegiatan dan predikat menyambung selebar sel, predikat rata tengah',()=>{
  const t=read('src/styles/app.css');
  /* Padding sel dinolkan dan dipindah ke dalam supaya garis pemisah tidak menyisakan celah
     di kiri dan kanan, sehingga predikat benar-benar mendapat kolomnya sendiri. */
  assert.match(t,/\.activity-table td\.activity-name-cell\{padding:0!important;text-align:center;vertical-align:middle\}/,'sel kegiatan rata tengah tanpa padding luar');
  assert.match(t,/\.activity-name-cell \.activity-name,\.activity-name-cell \.activity-predicate\{display:block;padding:6px 8px;font-weight:800\}/,'nama dan predikat mengisi lebar penuh sel');
  assert.match(t,/\.activity-name-cell \.activity-name:not\(:last-child\)\{border-bottom:1px solid #333\}/,'garis pemisah selebar sel dan sewarna garis tabel');
  assert.match(t,/\.activity-note-cell\{text-align:left!important;vertical-align:middle;line-height:1\.5\}/,'kolom Keterangan rata kiri');
  assert.match(t,/\.activity-table \.activity-title\{font-size:11px;letter-spacing:\.05em\}/,'baris judul bagian');
  /* Tanpa predikat, garis pemisah tidak muncul sehingga tidak ada garis menggantung. */
  const tanpa=activityTable('Ekstrakurikuler',[{name:'Futsal',description:'Rajin berlatih.'}],{studentName:'Bayu'});
  assert.equal(tanpa.includes('activity-predicate'),false);
  assert.match(tanpa,/<span class="activity-name">Futsal<\/span><\/td>/,'nama kegiatan menjadi elemen terakhir sel');
});

test('13. Format rapor lain tidak ikut berubah',()=>{
  const t=read('src/styles/app.css');
  assert.equal(t.includes('extracurricular-table'),false,'kelas lama sudah tidak dipakai');
  assert.match(t,/\.report-learning-table th:nth-child\(1\)\{width:34px\}/,'kolom No tabel mapel tetap');
  assert.match(t,/\.document-table th,\.document-table td\{border:1px solid #333/,'tabel dokumen tetap bergaris penuh');
  assert.match(t,/\.document-table th\{text-align:center;background:#f3f0ed\}/,'baris judul kegiatan memakai arsiran header yang sama');
  assert.match(t,/\.report-a4\{padding:14mm 13mm\}/,'margin lembar rapor tetap');
  assert.match(t,/\.report-a4 \.document-table th,\.report-a4 \.document-table td\{padding:5px 7px;font-size:10\.5px;line-height:1\.4\}/,'ukuran baris tabel rapor tetap');
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/\$\{extracurricularTable\(doc\)\}\$\{cocurricularTable\(doc\)\}/,'urutan bagian pada rapor tetap');
  assert.equal(/function cocurricularBlock\(/.test(cetak),false,'kotak kokurikuler lama sudah dihapus');
});
