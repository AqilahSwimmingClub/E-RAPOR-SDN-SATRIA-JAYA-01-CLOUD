import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import {
  ACTIVITY_PREDICATES, DEFAULT_ACTIVITY_PREDICATE,
  createExtracurricular, getStudentCocurricular, getStudentExtracurricular, getStudentIntracurricular,
  listExtracurriculars, saveExtracurricularBulk, saveCocurricularBulk,
  saveStudentCocurricular, saveStudentExtracurricular, saveStudentIntracurricular,
} from '../src/services/completeness.js';
import { defaultExtracurricularActivities, generateExtracurricularDescription } from '../src/data/extracurricular-defaults.js';
import { generateCocurricularDescription } from '../src/data/cocurricular.js';
import { generateIntracurricularDescription } from '../src/data/intracurricular-defaults.js';
import { getReportDocument } from '../src/services/documents.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping, scopeKey, updateDb } from '../src/services/storage.js';
import { cocurricularTable, extracurricularTable, intracurricularTable } from '../src/pages/print.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css').replace(/\/\*[\s\S]*?\*\//g,'');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:index<2,order:index+1})));}
function siswa(session,suffix){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:''});}
function siapkan(classId='5B'){useMemoryStorage();const session=guru(classId);aktifkan(session);return session;}
/* Tiga bagian kegiatan pada rapor satu siswa, dibaca dari HTML yang benar-benar dicetak. */
function bagianRapor(session,studentId){
  const doc=getReportDocument(session,studentId);
  return {
    doc,
    ekstra:extracurricularTable(doc),
    koku:cocurricularTable(doc),
    intra:intracurricularTable(doc),
    get terisi(){return ['ekstra','koku','intra'].filter(nama=>this[nama]!=='');},
  };
}

/* ------------------------------------------------------- 1-2. Isi langsung tanpa master */

test('1. Ekstrakurikuler dapat langsung diisi tanpa membuat master terlebih dahulu',()=>{
  const session=siapkan();const student=siswa(session,'a');
  /* Tidak ada satu pun kegiatan master yang dibuat sebelum ini. */
  assert.deepEqual(loadDb().extracurricularScores,{});
  const pilihan=defaultExtracurricularActivities(session.classId);
  assert.ok(pilihan.length>=3,'dropdown sudah punya pilihan kegiatan bawaan');
  assert.match(pilihan[0].name,/^Pramuka/,'Pramuka menjadi pilihan utama sesuai data aplikasi');
  const saved=saveStudentExtracurricular(session,student.id,{name:pilihan[0].name,predicate:'Baik',description:'Aktif mengikuti latihan.'});
  assert.equal(saved.name,pilihan[0].name);
  assert.equal(getStudentExtracurricular(session,student.id).predicate,'Baik');
});

test('2. Kokurikuler dapat langsung diisi tanpa konfigurasi tambahan',()=>{
  const session=siapkan();const student=siswa(session,'b');
  assert.deepEqual(loadDb().cocurricularScores,{});
  const saved=saveStudentCocurricular(session,student.id,{activity:'Proyek Peduli Lingkungan',predicate:'Cukup',description:'Ikut menjaga kebersihan.'});
  assert.equal(saved.activity,'Proyek Peduli Lingkungan');
  assert.equal(getStudentCocurricular(session,student.id).predicate,'Cukup');
});

test('3. Predikat menyediakan Cukup, Baik, dan Sangat Baik',()=>{
  assert.deepEqual(ACTIVITY_PREDICATES,['Cukup','Baik','Sangat Baik']);
  assert.equal(DEFAULT_ACTIVITY_PREDICATE,'Baik','Baik tetap menjadi pilihan awal, bukan Cukup');
  const session=siapkan();const student=siswa(session,'c');
  for(const predikat of ACTIVITY_PREDICATES){
    saveStudentExtracurricular(session,student.id,{name:'Pramuka Penggalang',predicate:predikat,description:'Deskripsi.'});
    saveStudentCocurricular(session,student.id,{activity:'Kunjungan Edukasi (Field Trip)',predicate:predikat,description:'Deskripsi.'});
    saveStudentIntracurricular(session,student.id,{activity:'Literasi Kritis dan Presentasi',predicate:predikat,description:'Deskripsi.'});
  }
  assert.equal(getStudentExtracurricular(session,student.id).predicate,'Sangat Baik');
});

/* --------------------------------------------------------- 3. Generate deskripsi otomatis */

test('4. Generate deskripsi mengikuti nama siswa, kegiatan, dan predikat',()=>{
  const pembuat=[
    ['ekstrakurikuler',(nama,predikat)=>generateExtracurricularDescription({studentName:nama,activity:{name:'Pramuka Penggalang'},predicate:predikat})],
    ['kokurikuler',(nama,predikat)=>generateCocurricularDescription({studentName:nama,activity:'Proyek Peduli Lingkungan',predicate:predikat,classId:'5B'})],
    ['intrakurikuler',(nama,predikat)=>generateIntracurricularDescription({studentName:nama,activity:{name:'Literasi Kritis dan Presentasi'},predicate:predikat})],
  ];
  for(const [label,buat] of pembuat){
    const teks=buat('Bayu Saputra','Sangat Baik');
    assert.ok(teks.includes('Bayu Saputra'),`${label} menyebut nama siswa`);
    assert.ok(teks.length>40,`${label} menghasilkan kalimat utuh`);
    assert.notEqual(buat('Bayu Saputra','Cukup'),teks,`${label} berubah mengikuti predikat`);
    assert.notEqual(buat('Sinta Dewi','Sangat Baik'),teks,`${label} berubah mengikuti siswa`);
  }
  /* Kegiatan yang berbeda menghasilkan deskripsi yang berbeda pula. */
  assert.notEqual(
    generateExtracurricularDescription({studentName:'Bayu',activity:{name:'Pramuka Penggalang'},predicate:'Baik'}),
    generateExtracurricularDescription({studentName:'Bayu',activity:{name:'Seni Tari'},predicate:'Baik'}),
  );
});

/* ------------------------------------------------- 4-5. Data lama tetap terbaca sepenuhnya */

test('5. Data ekstrakurikuler lama tetap terbaca dan dicetak',()=>{
  const session=siapkan();const student=siswa(session,'lama');
  /* Bentuk lama: beberapa kegiatan per siswa, dibuat lewat createExtracurricular. */
  createExtracurricular(session,student.id,{name:'Pramuka Penggalang',predicate:'Baik',description:'Deskripsi lama pramuka.'});
  createExtracurricular(session,student.id,{name:'Futsal',predicate:'Sangat Baik',description:'Deskripsi lama futsal.'});
  const daftar=listExtracurriculars(session,student.id);
  assert.equal(daftar.length,2,'kedua kegiatan lama tetap ada');
  assert.ok(getStudentExtracurricular(session,student.id),'form baru tetap membaca data lama');
  const {ekstra}=bagianRapor(session,student.id);
  assert.match(ekstra,/lama pramuka\./,'deskripsi pramuka lama ikut dicetak');
  assert.match(ekstra,/lama futsal\./,'kegiatan kedua tidak hilang dari rapor');
});

test('6. Predikat lama Cukup dan data kokurikuler lama tetap valid',()=>{
  const session=siapkan();const student=siswa(session,'legacy');
  /* Record ditanam langsung seperti hasil versi sebelumnya, tanpa lewat validasi baru. */
  updateDb(db=>{db.cocurricularScores[`${scopeKey(session)}|${student.id}`]={classId:session.classId,studentId:student.id,semester:session.semester,academicYear:session.academicYear,activity:'Gelar Karya',predicate:'Cukup',description:'Deskripsi kokurikuler lama.'};return db;});
  const record=getStudentCocurricular(session,student.id);
  assert.equal(record.predicate,'Cukup','predikat lama tidak menjadi tidak valid');
  assert.match(bagianRapor(session,student.id).koku,/kokurikuler lama\./);
});

test('7. Intrakurikuler yang sudah tersimpan tetap terbaca',()=>{
  const session=siapkan();const student=siswa(session,'intra');
  saveStudentIntracurricular(session,student.id,{activity:'Numerasi Kontekstual dan Data',predicate:'Baik',description:'Deskripsi intrakurikuler tersimpan.'});
  invalidateDbCache();
  assert.equal(getStudentIntracurricular(session,student.id).activity,'Numerasi Kontekstual dan Data');
  assert.match(bagianRapor(session,student.id).intra,/intrakurikuler tersimpan\./);
});

/* ------------------------------------------- 6-12. Rapor menampilkan hanya bagian yang terisi */

function isi(session,studentId,bagian){
  if(bagian.includes('ekstra'))saveStudentExtracurricular(session,studentId,{name:'Pramuka Penggalang',predicate:'Baik',description:'Deskripsi ekstrakurikuler.'});
  if(bagian.includes('koku'))saveStudentCocurricular(session,studentId,{activity:'Proyek Peduli Lingkungan',predicate:'Baik',description:'Deskripsi kokurikuler.'});
  if(bagian.includes('intra'))saveStudentIntracurricular(session,studentId,{activity:'Literasi Kritis dan Presentasi',predicate:'Baik',description:'Deskripsi intrakurikuler.'});
}

test('8. Ketiga bagian kosong sehingga tidak ada satu pun tabel kegiatan',()=>{
  const session=siapkan();const student=siswa(session,'kosong');
  const hasil=bagianRapor(session,student.id);
  assert.deepEqual(hasil.terisi,[],'tidak ada tabel kegiatan yang dicetak');
  for(const label of ['EKSTRAKURIKULER','KOKURIKULER','INTRAKURIKULER'])
    assert.equal(`${hasil.ekstra}${hasil.koku}${hasil.intra}`.includes(label),false,`judul ${label} tidak muncul sebagai placeholder`);
});

for(const [nama,bagian] of [['ekstra',['ekstra']],['koku',['koku']],['intra',['intra']]]){
  test(`9. Hanya ${nama} yang diisi sehingga hanya bagian itu yang dicetak`,()=>{
    const session=siapkan();const student=siswa(session,`satu-${nama}`);
    isi(session,student.id,bagian);
    assert.deepEqual(bagianRapor(session,student.id).terisi,bagian);
  });
}

for(const bagian of [['ekstra','koku'],['ekstra','intra'],['koku','intra']]){
  test(`10. Kombinasi ${bagian.join(' + ')} mencetak tepat dua bagian`,()=>{
    const session=siapkan();const student=siswa(session,`dua-${bagian.join('-')}`);
    isi(session,student.id,bagian);
    const terisi=bagianRapor(session,student.id).terisi;
    assert.deepEqual(terisi,bagian);
    assert.equal(terisi.length,2,'tidak ada bagian ketiga yang ikut tercetak');
  });
}

test('11. Ketiga bagian terisi sehingga ketiganya dicetak berurutan',()=>{
  const session=siapkan();const student=siswa(session,'tiga');
  isi(session,student.id,['ekstra','koku','intra']);
  const hasil=bagianRapor(session,student.id);
  assert.deepEqual(hasil.terisi,['ekstra','koku','intra']);
  assert.match(hasil.intra,/<th colspan="3" class="activity-title">INTRAKURIKULER<\/th>/);
  assert.match(hasil.intra,/Literasi Kritis dan Presentasi/);
  assert.match(hasil.intra,/<span class="activity-predicate">BAIK<\/span>/);
});

test('12. Data siswa lain tidak memunculkan tabel pada rapor siswa yang kosong',()=>{
  const session=siapkan();
  const a=siswa(session,'punya-data');const b=siswa(session,'masih-kosong');
  isi(session,a.id,['ekstra','koku','intra']);
  assert.deepEqual(bagianRapor(session,a.id).terisi,['ekstra','koku','intra']);
  assert.deepEqual(bagianRapor(session,b.id).terisi,[],'rapor siswa B tetap bersih');
});

test('13. Terapkan ke Siswa Kosong tidak menimpa siswa yang sudah diisi',()=>{
  const session=siapkan();
  const terisi=siswa(session,'sudah');const kosong=siswa(session,'belum');
  saveStudentExtracurricular(session,terisi.id,{name:'Futsal',predicate:'Sangat Baik',description:'Deskripsi individual.'});
  saveStudentCocurricular(session,terisi.id,{activity:'Gelar Karya',predicate:'Sangat Baik',description:'Deskripsi individual koku.'});
  const hasilEkstra=saveExtracurricularBulk(session,{name:'Pramuka Penggalang',predicate:'Baik',description:'Deskripsi massal.'},{onlyEmpty:true});
  const hasilKoku=saveCocurricularBulk(session,{activity:'Proyek Peduli Lingkungan',predicate:'Baik',description:'Deskripsi massal koku.'},{overwrite:false});
  assert.equal(hasilEkstra.skipped,1,'siswa yang sudah punya ekstrakurikuler dilewati');
  assert.equal(hasilKoku.skipped,1,'siswa yang sudah punya kokurikuler dilewati');
  assert.equal(getStudentExtracurricular(session,terisi.id).description,'Deskripsi individual.');
  assert.equal(listExtracurriculars(session,kosong.id)[0].name,'Pramuka Penggalang');
  assert.equal(getStudentCocurricular(session,kosong.id).activity,'Proyek Peduli Lingkungan');
});

/* --------------------------------------------------- 13. Cetak A4 aman dan tidak terpotong */

test('14. Cetak A4 memakai pagination aman dan huruf tetap terbaca',()=>{
  const t=css();
  /* Lembar rapor boleh mengalir ke halaman berikutnya, tetapi barisnya tidak boleh terbelah. */
  assert.match(t,/@media print\{[^@]*\.document-sheet\{break-inside:auto\}/,'lembar rapor boleh mengalir antar halaman');
  assert.match(t,/\.activity-table\{break-inside:auto\}/,'tabel kegiatan boleh berlanjut ke halaman berikutnya');
  assert.match(t,/\.activity-table tr,[^{]*\{break-inside:avoid\}|\.activity-table tr\{break-inside:avoid\}/,'baris kegiatan tidak pernah terbelah');
  assert.match(t,/\.activity-table thead\{display:table-header-group\}/,'judul bagian ikut tercetak di halaman lanjutan');
  /* Huruf tidak dikecilkan sampai sulit dibaca. */
  const ukuran=t.match(/\.report-a4 \.document-table th,\.report-a4 \.document-table td\{[^}]*font-size:([\d.]+)px/);
  assert.ok(ukuran&&Number(ukuran[1])>=10,`ukuran huruf tabel rapor ${ukuran?ukuran[1]:'?'}px tetap terbaca`);
});

/* ------------------------------------------------- Halaman input mengikuti pola Intrakurikuler */

test('15. Halaman Ekstrakurikuler dan Kokurikuler memakai pola Intrakurikuler yang sederhana',()=>{
  const intra=read('src/pages/intracurricular-input.js');
  for(const [label,path] of [['Ekstrakurikuler','src/pages/extracurricular-input.js'],['Kokurikuler','src/pages/cocurricular-input.js']]){
    const source=read(path);
    for(const teks of ['Generate Deskripsi Otomatis','Terapkan ke Siswa Kosong','Simpan Siswa Ini'])
      assert.ok(source.includes(teks),`${label}: tombol ${teks} tersedia`);
    for(const kontrol of ['data-student','data-activity','data-predicate','data-description'])
      assert.match(source,new RegExp(kontrol),`${label}: kontrol ${kontrol} mengikuti pola Intrakurikuler`);
    assert.match(source,/class="card module-filter"/,`${label}: memakai kartu filter siswa yang sama`);
    /* Tidak ada lagi alur tambah master, modal, atau hapus kegiatan sebelum mengisi nilai. */
    for(const larangan of ['Tambah Ekstrakurikuler','modal-backdrop','data-add-activity','data-delete-activity'])
      assert.equal(source.includes(larangan),false,`${label}: alur ${larangan} sudah dibuang`);
    assert.equal(source.includes('Terapkan ke Semua Siswa'),false,`${label}: tombol massal lama sudah diganti`);
  }
  assert.ok(intra.includes('Terapkan ke Siswa Kosong'),'halaman Intrakurikuler dipertahankan apa adanya');
});

test('16. Route input kegiatan menunjuk halaman sederhana yang baru',()=>{
  const app=read('src/app.js');
  assert.match(app,/case 'extra-input': return renderExtracurricularInput\(session\)/);
  assert.match(app,/case 'cocurricular-input': return renderCocurricularInput\(session\)/);
  assert.match(app,/case 'intracurricular-input': return renderIntracurricularInput\(session\)/,'route Intrakurikuler tidak berubah');
  /* Route lain pada halaman kelengkapan tetap seperti semula. */
  assert.match(app,/case 'homeroom-note': return renderCompleteness\(session,'note'\)/);
  assert.match(app,/case 'promotion-input': return renderCompleteness\(session,'promotion'\)/);
});
