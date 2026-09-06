import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import {
  COCURRICULAR_ACTIVITY_PRESETS, DIMENSI_PROFIL_PELAJAR_PANCASILA,
  cocurricularActivityNames, dimensiKokurikuler, findCocurricularPreset, findDimensiProfil,
  generateCocurricularDescription, kategoriCapaianKokurikuler,
} from '../src/data/cocurricular.js';
import { ACTIVITY_PREDICATES, getStudentCocurricular, hapusSemuaCocurricular,
  previewAllCocurricular, saveAllCocurricular } from '../src/services/completeness.js';
import { setTeacherAssignment } from '../src/services/teacher-assignments.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { getReportDocument } from '../src/services/documents.js';
import { readFileSync } from 'node:fs';

/* KOKURIKULER MENGIKUTI PANDUAN KEGIATAN KOKURIKULER.

   Panduan menetapkan tiga hal yang sebelumnya belum punya tempat di aplikasi:

     INDIKATORNYA adalah Dimensi Profil Pelajar Pancasila - bukan penguasaan materi.
     KATEGORI CAPAIAN diucapkan sebagai Belum/Mulai/Berkembang Sesuai Harapan/Sangat Berkembang.
     KALIMAT RAPOR menyebut nama, kategori capaian, dimensi, kegiatan nyata, dan - bila memang
     ada - aspek yang masih perlu dikembangkan.

   Yang TIDAK berubah, dan ikut dijaga berkas ini: predikat tersimpan tetap empat predikat lama
   milik aplikasi, kegiatan lama tetap ada, dan seluruh alur Kokurikuler beserta Hapus Semua
   bekerja persis seperti sebelumnya. */

function useMemoryStorage(){
  const values=new Map();
  const buat=()=>({getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),
    clear:()=>values.clear()});
  globalThis.localStorage=buat();globalThis.sessionStorage=buat();
  invalidateDbCache();
}
const SEMESTER=`Ganjil ${ACADEMIC_YEAR}`;
const admin=()=>({role:'admin',academicYear:ACADEMIC_YEAR,semester:SEMESTER,userName:'Admin'});
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:SEMESTER});
function panggung(){
  useMemoryStorage();
  const sesi=guru();
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  setTeacherAssignment(admin(),'5B',{subjectIds:SUBJECTS_DEFAULT.map(item=>item.id),active:true});
  const siswa=[1,2].map(index=>createStudent(sesi,{classId:'5B',nis:`5B-K${index}`,
    nisn:`5511${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,
    gender:index%2?'L':'P',religion:'Islam',photo:''}));
  return {sesi,siswa};
}
const susun=(opsi)=>generateCocurricularDescription({classId:'5B',...opsi});

/* ------------------------------------------------ §3 INDIKATOR: DIMENSI PROFIL PELAJAR */

test('1. Enam Dimensi Profil Pelajar Pancasila tersedia sebagai indikator',()=>{
  assert.equal(DIMENSI_PROFIL_PELAJAR_PANCASILA.length,6);
  const label=DIMENSI_PROFIL_PELAJAR_PANCASILA.map(item=>item.label);
  for(const nama of ['Berkebinekaan Global','Gotong Royong','Mandiri','Bernalar Kritis','Kreatif'])
    assert.ok(label.includes(nama),`${nama} termasuk dimensi`);
  assert.match(DIMENSI_PROFIL_PELAJAR_PANCASILA[0].penuh,/Beriman, Bertakwa kepada Tuhan Yang Maha Esa/);
});

test('2. Dimensi dikenali dari id maupun namanya',()=>{
  assert.equal(findDimensiProfil('gotong-royong').label,'Gotong Royong');
  assert.equal(findDimensiProfil('Gotong Royong').id,'gotong-royong');
  assert.equal(findDimensiProfil('Dimensi Karangan'),null,'yang tidak ada tetap null');
  assert.equal(findDimensiProfil(''),null);
});

test('3. Setiap kegiatan preset membawa dimensi yang relevan',()=>{
  for(const preset of COCURRICULAR_ACTIVITY_PRESETS){
    assert.ok(Array.isArray(preset.dimensions)&&preset.dimensions.length,
      `${preset.name} menyebut dimensinya`);
    for(const id of preset.dimensions)
      assert.ok(findDimensiProfil(id),`${preset.name}: dimensi ${id} dikenal`);
  }
});

test('4. Dimensi kegiatan dipakai bila guru belum memilih sendiri',()=>{
  const preset=findCocurricularPreset('Kewirausahaan (Market Day)');
  assert.equal(dimensiKokurikuler('Kewirausahaan (Market Day)','').id,preset.dimensions[0]);
  /* Pilihan guru selalu menang atas bawaan kegiatan. */
  assert.equal(dimensiKokurikuler('Kewirausahaan (Market Day)','kreatif').id,'kreatif');
  /* Kegiatan yang tidak dikenal tidak dipaksakan punya dimensi. */
  assert.equal(dimensiKokurikuler('Kegiatan Buatan Sekolah',''),null);
});

/* ------------------------------------------------- §3 KATEGORI CAPAIAN, PREDIKAT TETAP */

test('5. Predikat aplikasi TIDAK diganti oleh istilah panduan',()=>{
  assert.deepEqual(ACTIVITY_PREDICATES,['Sangat Baik','Baik','Cukup','Perlu Bimbingan'],
    'empat predikat lama tetap menjadi nilai yang disimpan dan dipilih guru');
});

test('6. Keempat predikat diterjemahkan ke kategori capaian panduan',()=>{
  assert.deepEqual(kategoriCapaianKokurikuler('Perlu Bimbingan'),{kode:'BB',label:'Belum Berkembang'});
  assert.deepEqual(kategoriCapaianKokurikuler('Cukup'),{kode:'MB',label:'Mulai Berkembang'});
  assert.deepEqual(kategoriCapaianKokurikuler('Baik'),{kode:'BSH',label:'Berkembang Sesuai Harapan'});
  assert.deepEqual(kategoriCapaianKokurikuler('Sangat Baik'),{kode:'SAB',label:'Sangat Berkembang'});
  assert.equal(kategoriCapaianKokurikuler('Entah'),null);
});

test('7. Data kokurikuler lama dengan predikat lama tetap tersimpan apa adanya',()=>{
  const {sesi,siswa}=panggung();
  saveAllCocurricular(sesi,{activity:'Bakti Sosial',rows:[{studentId:siswa[0].id,
    name:siswa[0].name,predicate:'Cukup',description:'Deskripsi kokurikuler lama.'}]});
  const tersimpan=getStudentCocurricular(sesi,siswa[0].id);
  assert.equal(tersimpan.predicate,'Cukup','predikat lama tidak diterjemahkan saat disimpan');
  assert.equal(tersimpan.description,'Deskripsi kokurikuler lama.');
});

/* ------------------------------------------------------- §4 POLA KALIMAT DESKRIPSI */

test('8. Kalimat menyebut nama, kategori capaian, dimensi, dan kegiatannya',()=>{
  const teks=susun({studentName:'Andi',activity:'Projek Penguatan Profil Pelajar Pancasila (P5)',
    predicate:'Sangat Baik',dimension:'gotong-royong'});
  assert.match(teks,/^Ananda Andi /,'dimulai dengan nama siswa');
  assert.match(teks,/Sangat Berkembang/,'memakai kategori capaian panduan');
  assert.match(teks,/dalam dimensi Gotong Royong/,'menyebut dimensi yang dinilai');
  assert.match(teks,/Projek Penguatan Profil Pelajar Pancasila \(P5\)/,'menyebut kegiatannya');
  assert.match(teks,/kokurikuler/i);
});

test('9. Capaian tertinggi tidak mengarang kekurangan',()=>{
  const teks=susun({studentName:'Rani',activity:'Kewirausahaan (Market Day)',
    predicate:'Sangat Baik',dimension:'mandiri'});
  assert.equal(/perlu|belum|kurang|bimbingan/i.test(teks),false,
    'tidak ada aspek pengembangan yang dibuat-buat untuk capaian tertinggi');
});

test('10. Capaian di bawah tertinggi menyebut aspek pengembangan secara konstruktif',()=>{
  for(const predikat of ['Baik','Cukup','Perlu Bimbingan']){
    const teks=susun({studentName:'Siti',activity:'Tugas Observasi Lapangan',
      predicate:predikat,dimension:'bernalar-kritis'});
    assert.match(teks,/Capaian dimensi Bernalar Kritis Ananda Siti/,
      `${predikat} menyebut aspek pengembangan pada dimensi yang dinilai`);
    assert.equal(/tidak mampu|gagal|lemah|buruk/i.test(teks),false,
      `${predikat} tetap berbahasa positif`);
  }
});

test('11. Aspek pengembangan tidak menuduh dimensi yang tidak pernah dinilai',()=>{
  const teks=susun({studentName:'Budi',activity:'Klub Mata Pelajaran',
    predicate:'Cukup',dimension:'mandiri'});
  const disebut=DIMENSI_PROFIL_PELAJAR_PANCASILA
    .filter(item=>teks.includes(item.label)).map(item=>item.label);
  assert.deepEqual(disebut,['Mandiri'],
    'hanya dimensi yang memang dipilih guru yang muncul di dalam kalimat');
});

test('12. Kegiatan nyata diambil dari preset, bukan dikarang',()=>{
  const preset=findCocurricularPreset('Penerbitan Mading dan Buletin Sekolah');
  const teks=susun({studentName:'Nadia',activity:preset.name,predicate:'Baik'});
  const inti=preset.upper[0].replace(/\.$/,'');
  assert.ok(teks.includes(`${inti.charAt(0).toLowerCase()}${inti.slice(1)}`),
    'kalimat memakai rumusan kegiatan milik preset itu sendiri');
});

test('13. Kegiatan tanpa preset tetap menghasilkan kalimat jujur tanpa dimensi karangan',()=>{
  const teks=susun({studentName:'Budi',activity:'Kegiatan Khas Sekolah',predicate:'Baik'});
  assert.match(teks,/^Ananda Budi /);
  assert.match(teks,/Kegiatan Khas Sekolah/);
  assert.equal(/dimensi/i.test(teks),false,'tidak menyebut dimensi yang tidak pernah ada');
  assert.equal(/Kegiatan ini mencakup/.test(teks),false,'tidak mengarang isi kegiatan');
});

test('14. Kalimat berubah mengikuti siswa, predikat, dimensi, dan kegiatan',()=>{
  const dasar={activity:'Bakti Sosial',predicate:'Baik',dimension:'gotong-royong',studentName:'Ali'};
  const teks=susun(dasar);
  assert.notEqual(susun({...dasar,studentName:'Budi'}),teks);
  assert.notEqual(susun({...dasar,predicate:'Cukup'}),teks);
  assert.notEqual(susun({...dasar,dimension:'beriman'}),teks);
  assert.notEqual(susun({...dasar,activity:'Pelatihan Literasi'}),teks);
});

test('15. Kalimat yang sama lahir lagi untuk masukan yang sama',()=>{
  const dasar={studentName:'Ali',activity:'Bakti Sosial',predicate:'Baik',dimension:'gotong-royong'};
  assert.equal(susun(dasar),susun(dasar));
});

/* ---------------------------------------------------------- §1-2 RAGAM KEGIATAN */

test('16. Ragam kegiatan panduan tersedia tanpa membuang kegiatan lama',()=>{
  const kegiatan=cocurricularActivityNames();
  assert.deepEqual(kegiatan.slice(0,5),['Kunjungan Edukasi (Field Trip)','Proyek Peduli Lingkungan',
    'Bakti Sosial','Pengenalan Budaya','Pelatihan Literasi'],
    'lima kegiatan terlama tetap ada dengan nama dan urutan yang sama');
  for(const nama of ['Projek Penguatan Profil Pelajar Pancasila (P5)','Tugas Observasi Lapangan',
    'Klub Mata Pelajaran','Bimbingan Pengayaan dan Remedial','Penerbitan Mading dan Buletin Sekolah'])
    assert.ok(kegiatan.includes(nama),`${nama} tersedia sebagai pilihan`);
  assert.equal(new Set(kegiatan).size,kegiatan.length,'tidak ada nama kegiatan kembar');
});

test('17. Setiap kegiatan tetap membawa 5 deskripsi kelas rendah dan 5 kelas tinggi yang unik',()=>{
  const semua=[];
  for(const preset of COCURRICULAR_ACTIVITY_PRESETS){
    assert.equal(preset.lower.length,5,`${preset.name} punya 5 deskripsi kelas rendah`);
    assert.equal(preset.upper.length,5,`${preset.name} punya 5 deskripsi kelas tinggi`);
    semua.push(...preset.lower,...preset.upper);
  }
  assert.equal(new Set(semua).size,semua.length,'seluruh deskripsi unik');
});

/* ------------------------------------------- ALUR GURU DAN HAPUS SEMUA TETAP UTUH */

test('18. Isi Otomatis membawa dimensi ke setiap baris dan ke kalimatnya',()=>{
  const {sesi}=panggung();
  const hasil=previewAllCocurricular(sesi,{activity:'Pentas Seni dan Kreativitas',
    predicate:'Baik',dimension:'kreatif',
    describe:({student,activity,predicate,dimension})=>generateCocurricularDescription(
      {studentName:student.name,activity,predicate,classId:'5B',dimension})});
  assert.equal(hasil.dimension,'kreatif');
  for(const row of hasil.rows){
    assert.equal(row.dimension,'kreatif');
    assert.match(row.description,/dalam dimensi Kreatif/);
    assert.ok(row.description.includes('Pentas Seni dan Kreativitas'));
  }
});

test('19. Simpan Semua menyimpan dimensi bersama catatannya',()=>{
  const {sesi,siswa}=panggung();
  saveAllCocurricular(sesi,{activity:'Bakti Sosial',rows:siswa.map(item=>({
    studentId:item.id,name:item.name,predicate:'Baik',dimension:'gotong-royong',
    description:`Ananda ${item.name} Berkembang Sesuai Harapan dalam dimensi Gotong Royong.`}))});
  const tersimpan=getStudentCocurricular(sesi,siswa[0].id);
  assert.equal(tersimpan.dimension,'gotong-royong');
  assert.equal(tersimpan.predicate,'Baik','predikat aplikasi yang disimpan, bukan istilah panduan');
});

test('20. Dimensi bersifat opsional: catatan tanpa dimensi tetap sah',()=>{
  const {sesi,siswa}=panggung();
  saveAllCocurricular(sesi,{activity:'Bakti Sosial',rows:[{studentId:siswa[0].id,
    name:siswa[0].name,predicate:'Baik',description:'Catatan tanpa dimensi.'}]});
  const tersimpan=getStudentCocurricular(sesi,siswa[0].id);
  assert.equal(Object.hasOwn(tersimpan,'dimension'),false,'tidak ada dimensi yang ditebak');
  assert.equal(tersimpan.description,'Catatan tanpa dimensi.');
});

test('21. Dimensi karangan ditolak layanan',()=>{
  const {sesi,siswa}=panggung();
  const hasil=saveAllCocurricular(sesi,{activity:'Bakti Sosial',rows:[{studentId:siswa[0].id,
    name:siswa[0].name,predicate:'Baik',dimension:'Dimensi Karangan',description:'Coba.'}]});
  assert.equal(hasil.tersimpan,0);
  assert.match(hasil.gagal[0].alasan,/Dimensi Profil Pelajar Pancasila tidak valid/);
});

test('22. Rapor membaca kokurikuler beserta dimensinya',()=>{
  const {sesi,siswa}=panggung();
  saveAllCocurricular(sesi,{activity:'Kewirausahaan (Market Day)',rows:[{studentId:siswa[0].id,
    name:siswa[0].name,predicate:'Sangat Baik',dimension:'mandiri',
    description:generateCocurricularDescription({studentName:siswa[0].name,
      activity:'Kewirausahaan (Market Day)',predicate:'Sangat Baik',classId:'5B',dimension:'mandiri'})}]});
  const doc=getReportDocument(sesi,siswa[0].id);
  const koku=Array.isArray(doc.cocurricular)?doc.cocurricular[0]:doc.cocurricular;
  assert.equal(koku.activity,'Kewirausahaan (Market Day)');
  assert.equal(koku.dimension,'mandiri');
  assert.match(koku.description,/Sangat Berkembang dalam dimensi Mandiri/);
});

test('23. Hapus Semua tetap membersihkan satu kegiatan saja',()=>{
  const {sesi,siswa}=panggung();
  const isi=(kegiatan,daftar)=>saveAllCocurricular(sesi,{activity:kegiatan,rows:daftar.map(item=>({
    studentId:item.id,name:item.name,predicate:'Baik',dimension:'gotong-royong',
    description:`Ananda ${item.name} pada ${kegiatan}.`}))});
  isi('Projek Penguatan Profil Pelajar Pancasila (P5)',[siswa[0]]);
  isi('Bakti Sosial',[siswa[1]]);
  hapusSemuaCocurricular(sesi,'Projek Penguatan Profil Pelajar Pancasila (P5)');
  assert.equal(getStudentCocurricular(sesi,siswa[0].id),null,'kegiatan yang dibatalkan hilang');
  assert.equal(getStudentCocurricular(sesi,siswa[1].id).activity,'Bakti Sosial','kegiatan lain utuh');
  const doc=getReportDocument(sesi,siswa[0].id);
  const koku=Array.isArray(doc.cocurricular)?doc.cocurricular:(doc.cocurricular?[doc.cocurricular]:[]);
  assert.equal(koku.length,0,'dan tidak lagi terbaca Rapor');
});

test('24. Halaman Kokurikuler menyediakan pemilih dimensi',()=>{
  const halaman=readFileSync(new URL('../src/pages/cocurricular-input.js',import.meta.url),'utf8');
  assert.match(halaman,/data-dimension/,'ada pemilih dimensi pada layar');
  assert.match(halaman,/DIMENSI_PROFIL_PELAJAR_PANCASILA/,'daftarnya dari data aplikasi');
  assert.match(halaman,/dimensi=''/,'berganti kegiatan mengembalikan dimensi ke bawaan kegiatan baru');
});

/* Ditemukan lewat verifikasi browser: sesudah Simpan Semua, mengganti dimensi tidak berpengaruh
   karena setiap gambar ulang mengembalikannya ke dimensi yang sudah tersimpan. Pilihan guru yang
   sedang berjalan harus menang atas catatan lama - kalau tidak, dimensi pada layar dan dimensi
   pada kalimat rapor berbeda tanpa guru menyadarinya. */
test('26. Pilihan dimensi guru menang atas dimensi yang sudah tersimpan',()=>{
  const halaman=readFileSync(new URL('../src/pages/cocurricular-input.js',import.meta.url),'utf8');
  assert.match(halaman,/const dimensiPilihan=new Map\(\)/,
    'pilihan guru dicatat per kegiatan');
  assert.match(halaman,/dimensiPilihan\.set\(kegiatan,dimensi\)/,
    'mengganti dimensi mencatat pilihannya');
  assert.match(halaman,/dimensi=dimensiPilihan\.get\(kegiatan\)\s*\|\|/,
    'dan pilihan itu dibaca lebih dulu daripada catatan tersimpan');
});

test('25. Penilaian kokurikuler tetap kualitatif, tanpa nilai angka',()=>{
  const {sesi,siswa}=panggung();
  saveAllCocurricular(sesi,{activity:'Bakti Sosial',rows:[{studentId:siswa[0].id,
    name:siswa[0].name,predicate:'Baik',dimension:'gotong-royong',description:'Deskripsi.'}]});
  const tersimpan=getStudentCocurricular(sesi,siswa[0].id);
  assert.equal(Object.hasOwn(tersimpan,'score'),false,'tidak ada angka pada catatan kokurikuler');
  assert.equal(Object.keys(loadDb().cocurricularScores).length,1);
});
