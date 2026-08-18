import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { createExtracurricular, pramukaDescriptionsForClass, pramukaPresetForClass, saveStudentCocurricular } from '../src/services/completeness.js';
import { getReportDocument } from '../src/services/documents.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, saveSubjectMapping } from '../src/services/storage.js';
import { activityTable, cocurricularTable, extracurricularTable } from '../src/pages/print.js';

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
const teks=value=>String(value).replace(/<[^>]*>/g,'').trim();

/* ----------------------------------------------------- 1-4. Bentuk tabel Ekstrakurikuler */

test('1. Ekstrakurikuler memakai tabel bernomor No | Ekstrakurikuler | Keterangan',()=>{
  const html=activityTable('Ekstrakurikuler',[{name:'Pramuka Penggalang',predicate:'Baik',description:'Mampu menerapkan gotong royong dan tanggung jawab dalam kegiatan.'}]);
  const [judul,isi]=barisTabel(html);
  assert.deepEqual(judul,['No','Ekstrakurikuler','Keterangan'],'urutan kolom sesuai permintaan');
  assert.equal(isi[0],'1','kegiatan pertama bernomor 1');
  assert.equal(teks(isi[1]),'Pramuka Penggalang','kolom kedua hanya berisi nama kegiatan');
});

test('2. Kolom Keterangan menaruh predikat pada baris pertama lalu deskripsi di bawahnya',()=>{
  const deskripsi='Mampu menerapkan gotong royong dan tanggung jawab dalam kegiatan.';
  const html=activityTable('Ekstrakurikuler',[{name:'Pramuka Penggalang',predicate:'Sangat Baik',description:deskripsi}]);
  const keterangan=barisTabel(html)[1][2];
  assert.match(keterangan,/^<b class="activity-predicate">SANGAT BAIK<\/b><span class="activity-description">/,'predikat lebih dulu, deskripsi menyusul');
  assert.match(keterangan,new RegExp(`<span class="activity-description">${deskripsi}</span>$`),'deskripsi pilihan guru ditulis utuh');
});

test('3. Predikat ditulis huruf besar seperti BAIK dan SANGAT BAIK',()=>{
  for(const [predikat,tampil] of [['Baik','BAIK'],['Sangat Baik','SANGAT BAIK'],['Cukup','CUKUP']]){
    const html=activityTable('Ekstrakurikuler',[{name:'Pramuka Penggalang',predicate:predikat,description:'Deskripsi.'}]);
    assert.match(html,new RegExp(`<b class="activity-predicate">${tampil}</b>`),`${predikat} tampil sebagai ${tampil}`);
  }
});

test('4. Predikat dan deskripsi tidak lagi disatukan menjadi satu kalimat',()=>{
  const html=activityTable('Ekstrakurikuler',[{name:'Pramuka Penggalang',predicate:'Baik',description:'Mampu menerapkan gotong royong.'}]);
  assert.equal(html.includes('Baik. Mampu menerapkan'),false,'bentuk lama "Predikat. Deskripsi" sudah tidak dipakai');
  assert.equal(html.includes('subject-description-cell'),false,'kolom keterangan memakai kelasnya sendiri');
  const cetak=read('src/pages/print.js');
  assert.equal(/\[item\.predicate,item\.description\]\.filter\(Boolean\)\.join\('\. '\)/.test(cetak),false,'penggabungan lama dihapus dari kode');
});

/* ------------------------------------------------------------ 5-7. Bentuk tabel Kokurikuler */

test('5. Kokurikuler memakai tabel yang sama: No | Kokurikuler | Keterangan',()=>{
  const html=cocurricularTable({cocurricular:{activity:'Proyek Peduli Lingkungan',predicate:'Baik',description:'Mampu menjelaskan dampak menjaga kebersihan bagi kesehatan dan kenyamanan bersama.'}});
  const [judul,isi]=barisTabel(html);
  assert.deepEqual(judul,['No','Kokurikuler','Keterangan'],'kolom Kokurikuler sejajar dengan Ekstrakurikuler');
  assert.equal(isi[0],'1');
  assert.equal(teks(isi[1]),'Proyek Peduli Lingkungan','nama proyek berdiri sendiri di kolomnya');
  assert.match(isi[2],/^<b class="activity-predicate">BAIK<\/b><span class="activity-description">Mampu menjelaskan dampak/,'predikat lalu deskripsi');
  assert.match(html,/<table class="document-table activity-table">/,'memakai tabel dokumen, bukan kotak bebas');
});

test('6. Kokurikuler tidak lagi memakai kotak paragraf dengan tanda hubung',()=>{
  const cetak=read('src/pages/print.js');
  assert.equal(/function cocurricularBlock\(/.test(cetak),false,'blok kokurikuler lama dihapus');
  assert.equal(/<div class="document-box-head">Kokurikuler<\/div>/.test(cetak),false,'kotak "Kokurikuler" lama dihapus');
  assert.match(cetak,/\$\{extracurricularTable\(doc\)\}\$\{cocurricularTable\(doc\)\}/,'rapor memanggil kedua tabel berurutan');
});

test('7. Bagian kegiatan yang belum diisi tetap tidak ikut tercetak',()=>{
  assert.equal(extracurricularTable({extracurricular:[]}),'','ekstrakurikuler kosong tidak mencetak tabel');
  assert.equal(extracurricularTable({}),'','data ekstrakurikuler tidak ada pun aman');
  assert.equal(cocurricularTable({cocurricular:null}),'','kokurikuler kosong tidak mencetak tabel');
  assert.equal(cocurricularTable({}),'','data kokurikuler tidak ada pun aman');
  assert.equal(activityTable('Ekstrakurikuler',[{name:'',predicate:'Baik',description:'Deskripsi.'}]),'','baris tanpa nama kegiatan dibuang');
});

/* ------------------------------------------------- 8-10. Data asli guru sampai ke lembar rapor */

test('8. Nomor urut mengikuti jumlah ekstrakurikuler siswa',()=>{
  useMemoryStorage();
  const session=guru('5B');aktifkan(session,['pai','bindo']);
  const murid=siswa(session,'EKS');
  const deskripsi=pramukaDescriptionsForClass('5B');
  createExtracurricular(session,murid.id,{name:pramukaPresetForClass('5B'),predicate:'Sangat Baik',description:deskripsi[3]});
  createExtracurricular(session,murid.id,{name:'Futsal',predicate:'Baik',description:'Menunjukkan kerja sama dan sportivitas dalam latihan.'});
  const doc=getReportDocument(session,murid.id);
  const baris=barisTabel(extracurricularTable(doc)).slice(1);
  assert.deepEqual(baris.map(item=>item[0]),['1','2'],'penomoran urut');
  assert.deepEqual(baris.map(item=>teks(item[1])),['Pramuka Penggalang','Futsal']);
  assert.match(baris[0][2],/<b class="activity-predicate">SANGAT BAIK<\/b>/);
  assert.match(baris[0][2],new RegExp(`<span class="activity-description">${deskripsi[3]}</span>`),'deskripsi yang dipilih guru yang tampil');
  assert.match(baris[1][2],/<b class="activity-predicate">BAIK<\/b><span class="activity-description">Menunjukkan kerja sama/);
});

test('9. Kokurikuler pilihan guru tampil apa adanya pada rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');aktifkan(session,['pai','bindo']);
  const murid=siswa(session,'KOKU');
  const deskripsi='Menunjukkan kepedulian lingkungan dan gotong royong.';
  saveStudentCocurricular(session,murid.id,{activity:'Proyek Peduli Lingkungan',predicate:'Baik',description:deskripsi});
  const doc=getReportDocument(session,murid.id);
  const isi=barisTabel(cocurricularTable(doc))[1];
  assert.equal(teks(isi[1]),'Proyek Peduli Lingkungan');
  assert.equal(isi[2],`<b class="activity-predicate">BAIK</b><span class="activity-description">${deskripsi}</span>`,'predikat dan deskripsi terpisah persis seperti yang dipilih guru');
});

test('10. Nama kegiatan dan deskripsi tetap diamankan dari karakter HTML',()=>{
  const html=activityTable('Ekstrakurikuler',[{name:'Seni <Tari>',predicate:'Baik',description:'Deskripsi "tanda" & <b>tebal</b>.'}]);
  assert.equal(html.includes('<Tari>'),false,'nama kegiatan tidak menyuntik tag');
  assert.equal(html.includes('<b>tebal</b>'),false,'deskripsi tidak menyuntik tag');
  assert.match(html,/Seni &lt;Tari&gt;/);
  assert.match(html,/&amp;/);
});

/* ----------------------------------------------------------------- 11-12. Tata letak cetak */

test('11. Gaya kolom Keterangan menempatkan predikat dan deskripsi pada baris terpisah',()=>{
  const t=read('src/styles/app.css');
  assert.match(t,/\.activity-predicate\{display:block;font-weight:800;letter-spacing:\.02em\}/,'predikat satu baris penuh');
  assert.match(t,/\.activity-description\{display:block;margin-top:3px\}/,'deskripsi turun ke baris berikutnya');
  assert.match(t,/\.activity-note-cell\{text-align:left!important;line-height:1\.45\}/,'kolom Keterangan rata kiri, bukan tengah');
  assert.match(t,/\.activity-name-cell\{text-align:left!important\}/,'nama kegiatan rata kiri');
});

test('12. Lebar kolom dan jarak tabel kegiatan mengikuti tabel mata pelajaran',()=>{
  const t=read('src/styles/app.css');
  assert.match(t,/\.report-learning-table th:nth-child\(1\),\.activity-table th:nth-child\(1\)\{width:34px\}/,'kolom No selebar tabel mapel');
  assert.match(t,/\.activity-table th:nth-child\(2\)\{width:32%\}/,'kolom nama kegiatan tetap 32%');
  assert.match(t,/\.activity-table\{margin-top:10px\}/,'ada jarak dari tabel sebelumnya');
  assert.equal(t.includes('extracurricular-table'),false,'kelas lama sudah tidak dipakai');
  /* Format rapor lain tidak ikut berubah. */
  assert.match(t,/\.report-a4\{padding:14mm 13mm\}/,'margin lembar rapor tetap');
  assert.match(t,/\.report-a4 \.document-table th,\.report-a4 \.document-table td\{padding:5px 7px;font-size:10\.5px;line-height:1\.4\}/,'ukuran baris tabel rapor tetap');
});
