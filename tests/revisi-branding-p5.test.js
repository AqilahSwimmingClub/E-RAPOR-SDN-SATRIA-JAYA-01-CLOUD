import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { DEFAULT_PREDIKAT_KOKURIKULER, PREDIKAT_KOKURIKULER, PREDIKAT_KOKURIKULER_LAMA,
  adalahKegiatanP5, generateCocurricularDescription, kategoriCapaianKokurikuler,
  predikatKokurikuler } from '../src/data/cocurricular.js';
import { ACTIVITY_PREDICATES, COCURRICULAR_PREDICATES, getStudentCocurricular,
  hapusSemuaCocurricular, previewAllCocurricular, saveAllCocurricular, saveStudentCocurricular,
  saveStudentExtracurricular, saveStudentIntracurricular } from '../src/services/completeness.js';
import { ATTITUDE_LEVELS } from '../src/services/attitudes.js';
import { ASSESSMENT_TYPES, getAssessmentSettings, saveAssessmentScores,
  saveAssessmentSettings } from '../src/services/assessment.js';
import { REPORT_CATEGORIES } from '../src/services/report-rubric.js';
import { capaianButirSiswa, komposisiDeskripsiCapaian, predikatIntraDariCapaian,
  ringkasanCapaianSiswa } from '../src/services/cp-attainment.js';
import { listCpButir, setCpButirActive } from '../src/services/cp-butir.js';
import { getSchoolMaster, saveSchoolMaster } from '../src/services/master.js';
import { getPrintSettings, getReportDateDefault, saveReportDateDefault,
  savePrintSettings } from '../src/services/print-settings.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, scopeKey, updateDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* REVISI 1.2.8: PREDIKAT KOKURIKULER, SATU BUTIR CP, LOGO MASTER, DAN TANGGAL RAPOR.

   Empat perbaikan yang berdiri sendiri tetapi satu temanya: aplikasi berhenti memaksakan
   istilah, angka, dan gambar yang bukan milik sekolah penggunanya.

     1. Kokurikuler menilai PERKEMBANGAN karakter, jadi predikatnya BB/MB/BSH/SB - bukan
        "Cukup" dan "Baik" yang dipinjam dari penguasaan materi. Intrakurikuler,
        Ekstrakurikuler, dan Nilai Sikap tidak ikut berubah, dan itu diperiksa di sini.
     2. Mata pelajaran yang hanya punya SATU Butir CP aktif tetap dibaca lewat KKTP dan Rubrik
        sekolah - bukan lewat interval angka yang ditulis mati di dalam kode.
     3. Lambang daerah tidak lagi terkunci pada satu kabupaten. Ketiga logo dibaca dari master
        Admin, dengan berkas bawaan aplikasi hanya sebagai cadangan.
     4. Tanggal rapor Admin dan tanggal rombel berhenti menjadi dua data yang tidak saling
        berhubungan. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
function muatUlang(){invalidateDbCache();}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
const admin=(semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'admin',academicYear:ACADEMIC_YEAR,semester,userName:'Admin'});
function aktifkanSemuaMapel(session){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
}
function tambahSiswa(session,index=1,nama){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`5511${String(index).padStart(6,'0')}`,name:nama||`Siswa ${index}`,gender:'P',photo:''});
}
function panggung(classId='5B'){
  useMemoryStorage();
  const sesi=guru(classId);
  aktifkanSemuaMapel(sesi);
  return {sesi,siswa:[tambahSiswa(sesi,1,'Andi Saputra'),tambahSiswa(sesi,2,'Bunga Lestari')]};
}
const P5='Projek Penguatan Profil Pelajar Pancasila (P5)';

/* ================================================== A. PREDIKAT KOKURIKULER BB/MB/BSH/SB */

test('1. Kokurikuler menawarkan tepat empat predikat perkembangan, urut dari yang tertinggi',()=>{
  assert.deepEqual(COCURRICULAR_PREDICATES,
    ['Sangat Berkembang','Berkembang Sesuai Harapan','Mulai Berkembang','Belum Berkembang']);
  assert.deepEqual(PREDIKAT_KOKURIKULER.map(item=>item.kode),['SB','BSH','MB','BB']);
  assert.equal(DEFAULT_PREDIKAT_KOKURIKULER,'Berkembang Sesuai Harapan');
  /* Istilah lama tidak lagi ditawarkan untuk catatan baru. */
  for(const lama of ['Perlu Bimbingan','Cukup','Baik','Sangat Baik'])
    assert.equal(COCURRICULAR_PREDICATES.includes(lama),false,`${lama} tidak lagi muncul di dropdown`);
});

test('2. Perubahan ini KHUSUS Kokurikuler: Intrakurikuler, Ekstrakurikuler, dan Sikap tidak ikut',()=>{
  assert.deepEqual(ACTIVITY_PREDICATES,['Sangat Baik','Baik','Cukup','Perlu Bimbingan'],
    'predikat Intrakurikuler dan Ekstrakurikuler tidak berubah');
  assert.deepEqual(ATTITUDE_LEVELS,['Sangat Berkembang','Berkembang Sesuai Harapan','Mulai Berkembang'],
    'capaian Nilai Sikap tidak berubah');
  const {sesi,siswa}=panggung();
  /* Keduanya masih menerima dan menyimpan predikatnya sendiri. */
  const ekstra=saveStudentExtracurricular(sesi,siswa[0].id,{name:'Pramuka Penggalang',predicate:'Cukup',description:'Deskripsi.'});
  assert.equal(ekstra.predicate,'Cukup');
  const intra=saveStudentIntracurricular(sesi,siswa[0].id,{activity:'Literasi Kritis dan Presentasi',
    predicate:'Baik',description:'Deskripsi.',includeInReport:true});
  assert.equal(intra.predicate,'Baik');
});

test('3. Halaman Kokurikuler memakai domainnya sendiri, bukan predikat bersama',()=>{
  const halaman=read('src/pages/cocurricular-input.js');
  assert.match(halaman,/COCURRICULAR_PREDICATES, DEFAULT_COCURRICULAR_PREDICATE/,'mengambil domain kokurikuler');
  assert.doesNotMatch(halaman,/ACTIVITY_PREDICATES/,'tidak lagi memakai predikat bersama');
  assert.match(halaman,/COCURRICULAR_PREDICATES\.map\(value=>/,'dropdown disusun dari domain kokurikuler');
  /* Dua menu lain tidak disentuh. */
  assert.match(read('src/pages/extracurricular-input.js'),/ACTIVITY_PREDICATES\.map\(value=>/);
  assert.match(read('src/pages/intracurricular-input.js'),/ACTIVITY_PREDICATES\.map\(value=>/);
});

test('4. Kompatibilitas data lama: empat predikat lama dipetakan satu lawan satu',()=>{
  assert.deepEqual(PREDIKAT_KOKURIKULER_LAMA,
    {'Perlu Bimbingan':'BB','Cukup':'MB','Baik':'BSH','Sangat Baik':'SB'});
  assert.deepEqual(predikatKokurikuler('Perlu Bimbingan'),{kode:'BB',label:'Belum Berkembang'});
  assert.deepEqual(predikatKokurikuler('Cukup'),{kode:'MB',label:'Mulai Berkembang'});
  assert.deepEqual(predikatKokurikuler('Baik'),{kode:'BSH',label:'Berkembang Sesuai Harapan'});
  assert.deepEqual(predikatKokurikuler('Sangat Baik'),{kode:'SB',label:'Sangat Berkembang'});
  /* Kode dan istilah baru dikenali oleh pintu yang sama; istilah karangan tetap ditolak. */
  for(const item of PREDIKAT_KOKURIKULER){
    assert.deepEqual(predikatKokurikuler(item.label),item);
    assert.deepEqual(predikatKokurikuler(item.kode),item);
  }
  assert.equal(predikatKokurikuler('Luar Biasa'),null);
  assert.equal(predikatKokurikuler(''),null);
  assert.equal(kategoriCapaianKokurikuler('Baik').kode,'BSH','nama lama fungsinya tetap berjalan');
});

test('5. Catatan lama tidak dimigrasi massal; ia berpindah hanya saat guru menyimpannya',()=>{
  const {sesi,siswa}=panggung();
  const kunci=`${scopeKey(sesi)}|${siswa[0].id}`;
  updateDb(db=>{db.cocurricularScores[kunci]={classId:'5B',studentId:siswa[0].id,
    semester:sesi.semester,academicYear:sesi.academicYear,activity:'Bakti Sosial',
    predicate:'Cukup',description:'Catatan versi lama.',
    createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z'};return db;});
  muatUlang();
  /* Membacanya berkali-kali tidak menulis ulang apa pun. */
  getStudentCocurricular(sesi,siswa[0].id);
  getStudentCocurricular(sesi,siswa[0].id);
  muatUlang();
  const mentah=loadDb().cocurricularScores[kunci];
  assert.equal(mentah.predicate,'Cukup','predikat lama tetap utuh di dalam database');
  assert.equal(mentah.updatedAt,'2025-01-01T00:00:00.000Z');
  /* Baru ketika guru menyimpannya kembali, istilahnya berpindah. */
  saveStudentCocurricular(sesi,siswa[0].id,{activity:'Bakti Sosial',predicate:'Cukup',
    description:'Catatan versi lama.'});
  muatUlang();
  assert.equal(loadDb().cocurricularScores[kunci].predicate,'Mulai Berkembang');
});

test('6. Dropdown, penyimpanan, dan deskripsi memakai istilah yang sama',()=>{
  const {sesi,siswa}=panggung();
  for(const predikat of COCURRICULAR_PREDICATES){
    const disimpan=saveStudentCocurricular(sesi,siswa[0].id,{activity:'Bakti Sosial',predicate:predikat,
      dimension:'gotong-royong',
      description:generateCocurricularDescription({studentName:siswa[0].name,activity:'Bakti Sosial',
        predicate:predikat,classId:'5B',dimension:'gotong-royong'})});
    assert.equal(disimpan.predicate,predikat,`${predikat} tersimpan apa adanya`);
    assert.match(disimpan.description,new RegExp(`^Ananda ${siswa[0].name} ${predikat} dalam dimensi Gotong Royong,`),
      'kalimatnya memakai istilah yang sama dengan dropdown dan penyimpanan');
  }
});

test('7. Pratinjau semua siswa mengembalikan istilah baru walau dipanggil dengan predikat lama',()=>{
  const {sesi,siswa}=panggung();
  const hasil=previewAllCocurricular(sesi,{activity:'Bakti Sosial',predicate:'Baik',
    dimension:'gotong-royong',
    describe:({student,activity,predicate,dimension})=>generateCocurricularDescription(
      {studentName:student.name,activity,predicate,classId:'5B',dimension})});
  assert.equal(hasil.predicate,'Berkembang Sesuai Harapan');
  assert.equal(hasil.rows.length,siswa.length);
  for(const row of hasil.rows){
    assert.equal(row.predicate,'Berkembang Sesuai Harapan');
    assert.match(row.description,/Berkembang Sesuai Harapan dalam dimensi Gotong Royong/);
  }
  assert.throws(()=>previewAllCocurricular(sesi,{activity:'Bakti Sosial',predicate:'Luar Biasa',
    describe:()=>'x'}),/Predikat kokurikuler tidak valid/);
});

/* ============================================ B. REKOMENDASI DINAMIS DAN P5 VS NON-P5 */

test('8. Setiap tingkat perkembangan punya kalimat rekomendasinya sendiri',()=>{
  const harapan={
    'Belum Berkembang':'memerlukan bimbingan agar perkembangannya meningkat sesuai konteks kegiatan',
    'Mulai Berkembang':'dapat ditingkatkan melalui pendampingan/stimulus yang lebih terarah',
    'Berkembang Sesuai Harapan':'masih dapat ditingkatkan agar lebih konsisten pada kegiatan berikutnya',
    'Sangat Berkembang':'sangat baik dan dapat menjadi contoh positif sesuai konteks kegiatan',
  };
  for(const [predikat,penutup] of Object.entries(harapan)){
    const teks=generateCocurricularDescription({studentName:'Andi',activity:'Bakti Sosial',
      predicate:predikat,classId:'5B',dimension:'gotong-royong'});
    assert.ok(teks.endsWith(`Capaian dimensi Gotong Royong Ananda Andi ${penutup}.`),
      `${predikat} memakai rekomendasinya sendiri — dapat: ${teks.slice(-90)}`);
  }
  /* Keempatnya benar-benar berbeda, bukan satu kalimat yang diulang. */
  const semua=COCURRICULAR_PREDICATES.map(predikat=>generateCocurricularDescription(
    {studentName:'Andi',activity:'Bakti Sosial',predicate:predikat,classId:'5B',dimension:'gotong-royong'}));
  assert.equal(new Set(semua).size,4);
});

test('9. Projek P5 hanya disebut pada kegiatan P5',()=>{
  assert.equal(adalahKegiatanP5(P5),true);
  for(const kegiatan of ['Bakti Sosial','Kunjungan Edukasi (Field Trip)','Pentas Seni dan Budaya'])
    assert.equal(adalahKegiatanP5(kegiatan),false,`${kegiatan} bukan Projek P5`);
  /* Kegiatan P5 boleh menyebutnya. */
  const p5=generateCocurricularDescription({studentName:'Andi',activity:P5,
    predicate:'Sangat Berkembang',classId:'5B',dimension:'gotong-royong'});
  assert.match(p5,/sesuai konteks Projek P5\.$/);
  /* Kegiatan lain TIDAK PERNAH menyebutnya - itu akan menuliskan kegiatan yang tidak terjadi. */
  for(const kegiatan of ['Bakti Sosial','Kunjungan Edukasi (Field Trip)'])
    for(const predikat of COCURRICULAR_PREDICATES){
      const teks=generateCocurricularDescription({studentName:'Andi',activity:kegiatan,
        predicate:predikat,classId:'5B',dimension:'gotong-royong'});
      assert.doesNotMatch(teks,/P5/,`${kegiatan} · ${predikat} tidak menyebut P5`);
      assert.match(teks,new RegExp(`pada kegiatan kokurikuler ${kegiatan.replace(/[()]/g,'\\$&')}`));
    }
});

test('10. Deskripsi tetap dapat diulang dan tidak mengarang dimensi',()=>{
  const sekali=generateCocurricularDescription({studentName:'Andi',activity:'Bakti Sosial',
    predicate:'Mulai Berkembang',classId:'5B',dimension:'mandiri'});
  const lagi=generateCocurricularDescription({studentName:'Andi',activity:'Bakti Sosial',
    predicate:'Mulai Berkembang',classId:'5B',dimension:'mandiri'});
  assert.equal(sekali,lagi,'Generate kedua kalinya menghasilkan kalimat yang sama');
  /* Kegiatan bebas yang tidak dikenal presetnya tidak dipaksa punya dimensi maupun rekomendasi. */
  const bebas=generateCocurricularDescription({studentName:'Andi',activity:'Kegiatan Sekolah Kami',
    predicate:'Berkembang Sesuai Harapan',classId:'5B'});
  assert.match(bebas,/^Ananda Andi Berkembang Sesuai Harapan, /);
  assert.doesNotMatch(bebas,/dalam dimensi/,'tidak menyebut dimensi yang tidak pernah dipilih');
});

test('11. Hapus Semua Kokurikuler tetap aman dan tetap terbatas pada kegiatannya',()=>{
  const {sesi,siswa}=panggung();
  saveAllCocurricular(sesi,{activity:'Bakti Sosial',rows:siswa.map(item=>({studentId:item.id,
    name:item.name,activity:'Bakti Sosial',predicate:'Berkembang Sesuai Harapan',
    description:`Ananda ${item.name} Berkembang Sesuai Harapan.`}))});
  /* Satu siswa dipindahkan ke kegiatan lain supaya batasnya benar-benar teruji. */
  saveStudentCocurricular(sesi,siswa[1].id,{activity:P5,predicate:'Sangat Berkembang',
    description:'Ananda Bunga Lestari Sangat Berkembang.'});
  const hasil=hapusSemuaCocurricular(sesi,'Bakti Sosial');
  assert.equal(hasil.terhapus,1,'hanya catatan kegiatan itu yang terhapus');
  muatUlang();
  assert.equal(getStudentCocurricular(sesi,siswa[0].id),null);
  assert.equal(getStudentCocurricular(sesi,siswa[1].id).activity,P5,'kegiatan lain tidak tersentuh');
  /* Otorisasi tetap di layanan. */
  assert.throws(()=>hapusSemuaCocurricular({...sesi,role:'admin'},'Bakti Sosial'),/Session Guru tidak valid/);
});

/* ======================================================== D. SATU BUTIR CP AKTIF SAJA */

function siapkanSatuButir(sesi,subjectId,kktp=75){
  saveAssessmentSettings(sesi,subjectId,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp});
  const butir=listCpButir(sesi,subjectId,{activeOnly:true});
  assert.ok(butir.length>1,'mapel uji harus punya lebih dari satu butir sebelum dinonaktifkan');
  for(const item of butir.slice(1))setCpButirActive(sesi,subjectId,item.id,false);
  const tersisa=listCpButir(sesi,subjectId,{activeOnly:true});
  assert.equal(tersisa.length,1,'tinggal satu butir aktif');
  return tersisa[0];
}
function nilaiButir(sesi,subjectId,studentId,butirId,nilai){
  for(const jenis of ASSESSMENT_TYPES)
    saveAssessmentScores(sesi,subjectId,jenis.id,{[studentId]:nilai},{cpButirId:butirId});
}

test('12. Satu Butir CP aktif: capaiannya dibaca lewat KKTP dan Rubrik, bukan MAX/MIN palsu',()=>{
  const {sesi,siswa}=panggung();
  const butir=siapkanSatuButir(sesi,'mtk',75);
  nilaiButir(sesi,'mtk',siswa[0].id,butir.id,82);
  const daftar=capaianButirSiswa(sesi,'mtk',siswa[0].id);
  assert.equal(daftar.length,1,'hanya butir aktif yang dihitung');
  assert.equal(daftar[0].capaian,82,'capaiannya nilai butir itu sendiri');
  assert.equal(daftar[0].kktp,75,'KKTP yang dipakai adalah KKTP mata pelajaran itu');
  assert.equal(daftar[0].mencapai,true);
  assert.ok(REPORT_CATEGORIES.includes(daftar[0].kategori),'kategorinya dibaca lewat Rubrik');
  const ringkasan=ringkasanCapaianSiswa(sesi,'mtk',siswa[0].id);
  assert.equal(ringkasan.dinilai.length,1);
  assert.equal(ringkasan.terkuat.cpButirId,butir.id,'butir itu sendiri, bukan hasil MAX antar butir lain');
  assert.deepEqual(ringkasan.penguatan,[],'tidak ada kekurangan yang dikarang saat KKTP tercapai');
  assert.equal(ringkasan.seluruhnyaMencapai,true);
});

test('13. KKTP yang berbeda mengubah ketercapaian satu butir yang sama',()=>{
  const {sesi,siswa}=panggung();
  const butir=siapkanSatuButir(sesi,'mtk',75);
  nilaiButir(sesi,'mtk',siswa[0].id,butir.id,72);
  assert.equal(capaianButirSiswa(sesi,'mtk',siswa[0].id)[0].mencapai,false,'72 di bawah KKTP 75');
  const lama=getAssessmentSettings(sesi,'mtk');
  saveAssessmentSettings(sesi,'mtk',{...lama,kktp:70});
  assert.equal(capaianButirSiswa(sesi,'mtk',siswa[0].id)[0].mencapai,true,'KKTP 70 membuat 72 tercapai');
  /* Deskripsinya ikut berubah, dan tetap disusun dari butir itu - bukan dari angka. */
  const komposisi=komposisiDeskripsiCapaian(sesi,'mtk',siswa[0].id,{studentName:siswa[0].name});
  assert.equal(komposisi.dinilai.length,1);
  assert.deepEqual(komposisi.kompetensiPenguatan,[],'tidak ada penguatan setelah KKTP tercapai');
  assert.equal(komposisi.kompetensiKuat.length,1);
});

test('14. Rubrik sekolah menentukan kategorinya, bukan interval yang ditulis mati di kode',()=>{
  const {sesi,siswa}=panggung();
  const butir=siapkanSatuButir(sesi,'mtk',75);
  nilaiButir(sesi,'mtk',siswa[0].id,butir.id,82);
  const dasar=getAssessmentSettings(sesi,'mtk');
  /* Rubrik bawaan menaruh 82 pada BAIK. */
  assert.equal(capaianButirSiswa(sesi,'mtk',siswa[0].id)[0].kategori,'BAIK');
  /* Rubrik yang diatur Admin menggeser batasnya, dan kategorinya ikut bergeser. */
  saveAssessmentSettings(sesi,'mtk',{...dasar,rubric:[
    {category:'SANGAT BAIK',min:80,max:100},{category:'BAIK',min:70,max:79},
    {category:'CUKUP',min:60,max:69},{category:'PERLU BIMBINGAN',min:0,max:59}]});
  assert.equal(capaianButirSiswa(sesi,'mtk',siswa[0].id)[0].kategori,'SANGAT BAIK',
    'kategori mengikuti rubrik sekolah');
  assert.equal(predikatIntraDariCapaian(sesi,'mtk',siswa[0].id).kategori,'SANGAT BAIK');
});

test('15. Tidak ada interval 86-100/71-85/60-70 yang ditulis mati pada jalur capaian CP',()=>{
  for(const berkas of ['src/services/cp-attainment.js','src/services/cp-descriptions.js',
    'src/services/report-rubric.js']){
    const isi=read(berkas).replace(/\/\*[\s\S]*?\*\//g,'');
    for(const angka of ['86','71','85','70'])
      assert.doesNotMatch(isi,new RegExp(`>=\\s*${angka}\\b`),`${berkas} tidak membandingkan langsung dengan ${angka}`);
  }
  /* Ambang satu-satunya yang boleh dibandingkan langsung adalah KKTP dan batas rubrik. */
  const attainment=read('src/services/cp-attainment.js');
  assert.match(attainment,/capaian>=kktp/,'ketercapaian dibaca terhadap KKTP');
  assert.match(attainment,/categoryForScore\(capaian,rubrik\)/,'kategori dibaca terhadap Rubrik');
});

test('16. Multi-CP tidak berubah: kekuatan dan penguatan tetap dari butir yang dinilai',()=>{
  const {sesi,siswa}=panggung();
  saveAssessmentSettings(sesi,'mtk',{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  const butir=listCpButir(sesi,'mtk',{activeOnly:true});
  assert.ok(butir.length>=3,'mapel uji punya beberapa butir aktif');
  nilaiButir(sesi,'mtk',siswa[0].id,butir[0].id,90);
  nilaiButir(sesi,'mtk',siswa[0].id,butir[1].id,68);
  const ringkasan=ringkasanCapaianSiswa(sesi,'mtk',siswa[0].id);
  assert.equal(ringkasan.dinilai.length,2,'butir tanpa bukti tidak ikut');
  assert.equal(ringkasan.terkuat.cpButirId,butir[0].id);
  assert.deepEqual(ringkasan.penguatan.map(item=>item.cpButirId),[butir[1].id]);
  assert.equal(ringkasan.seluruhnyaMencapai,false);
  assert.equal(ringkasan.belumDinilai.length,butir.length-2);
});

/* ============================================================ E-M. TIGA LOGO MASTER ADMIN */

test('17. Ketiga logo tersimpan pada master Admin dan hanya Admin yang boleh mengubahnya',()=>{
  useMemoryStorage();
  const sesi=admin();
  saveSchoolMaster(sesi,{...getSchoolMaster(),name:'SD NEGERI UJI',
    schoolLogo:'data:image/png;base64,AAAA',ministryLogo:'data:image/png;base64,BBBB',
    regionLogo:'data:image/png;base64,CCCC'});
  muatUlang();
  const master=getSchoolMaster();
  assert.equal(master.schoolLogo,'data:image/png;base64,AAAA');
  assert.equal(master.ministryLogo,'data:image/png;base64,BBBB');
  assert.equal(master.regionLogo,'data:image/png;base64,CCCC');
  assert.throws(()=>saveSchoolMaster(guru(),{...master,schoolLogo:''}),/Hanya Admin/);
});

test('18. Guru membaca logo master Admin: tidak ada master logo terpisah per Guru',()=>{
  useMemoryStorage();
  saveSchoolMaster(admin(),{...getSchoolMaster(),name:'SD NEGERI UJI',
    schoolLogo:'data:image/png;base64,AAAA',ministryLogo:'data:image/png;base64,BBBB',
    regionLogo:'data:image/png;base64,CCCC'});
  muatUlang();
  /* getSchoolMaster tidak menerima session sama sekali: satu master untuk semua peran. */
  assert.equal(getSchoolMaster.length,0,'tidak ada master logo per rombel maupun per Guru');
  const dari5B=getSchoolMaster(),dari1A=getSchoolMaster();
  assert.equal(dari5B.regionLogo,dari1A.regionLogo);
  /* Tidak ada koleksi logo lain di dalam database. */
  const db=loadDb();
  assert.equal(Object.keys(db).some(key=>/logo/i.test(key)),false,'logo hanya hidup di masterData.school');
  assert.equal(read('src/services/master.js').includes('teacherLogo'),false);
});

test('19. Form Login memakai tiga logo dengan urutan Tut Wuri, daerah, lalu sekolah',()=>{
  const halaman=read('src/pages/login.js');
  const panel=halaman.slice(halaman.indexOf('<section class="login-panel">'));
  const baris=panel.slice(panel.indexOf('class="login-crest-row"'),panel.indexOf('<h2>Masuk ke e-Rapor</h2>'));
  const urutan=[...baris.matchAll(/data-crest="(\w+)"/g)].map(item=>item[1]);
  assert.deepEqual(urutan,['ministry','region','school'],'urutan ketiganya tidak berubah');
  assert.equal((baris.match(/<img/g)||[]).length,3,'tepat tiga logo, tidak lebih dan tidak kurang');
  /* Ketiganya membaca master Admin, dengan berkas bawaan hanya sebagai cadangan. */
  assert.match(halaman,/const ministryUpload=String\(school\.ministryLogo\|\|''\)\.trim\(\);/);
  assert.match(halaman,/const regionUpload=String\(school\.regionLogo\|\|''\)\.trim\(\);/);
  assert.match(halaman,/const ministryLogo=ministryUpload\|\|'\.\/assets\/logo-tut-wuri-handayani\.png';/);
  assert.match(halaman,/const regionLogo=regionUpload\|\|'\.\/assets\/logo-kabupaten-bekasi\.png';/);
  assert.match(halaman,/const crest=schoolLogo\|\|'\.\/assets\/app-icon-192\.png'/);
  assert.doesNotMatch(baris,/src="\.\/assets\//,'tidak ada berkas lambang yang ditulis mati');
  /* Berkas UNGGAHAN dipasang pada kotak berukuran tetap, sehingga rasio apa pun tidak menggeser
     tinggi area, jarak, maupun urutan barisnya. Kompensasi margin negatif milik berkas bawaan
     lambang daerah hanya berlaku ketika berkas bawaan itu yang dipakai. */
  assert.match(halaman,/const kelasUnggahan=nilai=>nilai\?' login-crest-upload':'';/);
  assert.match(baris,/regionUpload\?'login-crest-upload':'login-crest-region'/);
  const gaya=read('src/styles/app.css');
  assert.equal((gaya.match(/\.login-crest-upload\{width:(\d+)px;height:\1px;margin:0\}/g)||[]).length,3,
    'kotak tetap disediakan pada ketiga ukuran layar');
  for(const [,tinggi] of [...gaya.matchAll(/\.login-crest\{height:(\d+)px/g)])
    assert.match(gaya,new RegExp(`\\.login-crest-upload\\{width:${tinggi}px;height:${tinggi}px`),
      `kotak unggahan setinggi ${tinggi}px, sama dengan lambang bawaan`);
});

test('20. Logo Sekolah dipakai di kiri atas Login dan sebagai logo ketiga form',()=>{
  const halaman=read('src/pages/login.js');
  const foto=halaman.slice(halaman.indexOf('<section class="login-photo">'),halaman.indexOf('<section class="login-panel">'));
  assert.match(foto,/class="login-logo" src="\$\{escapeHtml\(crest\)\}"/,'kiri atas memakai Logo Sekolah');
  assert.match(halaman,/data-crest="school"/,'logo ketiga form juga Logo Sekolah');
  /* Logo Sekolah TIDAK boleh masuk slot Cover. */
  const cetak=read('src/pages/print.js');
  const cover=cetak.slice(cetak.indexOf('report-cover-a4'),cetak.indexOf('cover-ministry')+400);
  assert.doesNotMatch(cover,/schoolLogo/,'Cover tidak pernah memakai Logo Sekolah');
});

test('21. Cover memakai Tut Wuri dan lambang daerah dari unggahan Admin',()=>{
  const cetak=read('src/pages/print.js');
  assert.match(cetak,/coverLogo\(school\.ministryLogo,COVER_LOGO_DEFAULTS\.ministry,'cover-logo-ministry'/);
  assert.match(cetak,/coverLogo\(school\.regionLogo,COVER_LOGO_DEFAULTS\.region,'cover-logo-region'/);
  /* Slot lambang daerah tidak menyebut satu kabupaten pun pada teksnya. */
  assert.match(cetak,/'Lambang Daerah'/);
  assert.doesNotMatch(cetak.replace(/logo-kabupaten-bekasi\.png/g,''),/Kabupaten Bekasi/,
    'tidak ada nama daerah yang dipatenkan pada teks Cover');
  /* Label menu Admin pun netral. */
  assert.match(read('src/pages/references.js'),/'Logo Kabupaten\/Kota\/Provinsi'/);
});

test('22. Logo unggahan menyesuaikan container Cover, bukan sebaliknya',()=>{
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/\.cover-logo-custom>img\{width:100%;height:100%;object-fit:contain;margin:0\}/,
    'rasio dijaga: contain, tidak dipotong dan tidak digepengkan');
  assert.match(gaya,/\.cover-logo-custom\{overflow:visible;width:189px;height:189px\}/,
    'ukuran slotnya tetap, berapa pun ukuran berkas yang diunggah');
  assert.doesNotMatch(gaya,/\.cover-logo-custom>img\{[^}]*object-fit:(cover|fill)/,'tidak crop dan tidak stretch');
  /* Pada layar sempit slotnya mengecil menjadi 132px, dan gambarnya HARUS ikut mengecil.
     Tanpa penegasan ini, aturan gambar bawaan yang berdiri lebih belakang membuat logo
     unggahan tetap 136px - meleset 4px keluar kotaknya di setiap HP. */
  const sempit=gaya.slice(gaya.indexOf('@media screen and (max-width:767px)'));
  assert.match(sempit,/\.report-cover-a4>\.cover-logo-custom\{width:132px;height:132px\}/);
  const slotSempit=sempit.indexOf('.report-cover-a4>.cover-logo-custom{');
  const imgSempit=sempit.indexOf('.report-cover-a4>.cover-logo-custom>img{width:100%;height:100%;object-fit:contain;margin:0}');
  assert.ok(imgSempit>slotSempit,'ukuran gambar unggahan ditegaskan kembali pada layar sempit');
  const imgBawaan=sempit.indexOf('.report-cover-a4>.cover-logo-ministry>img{');
  assert.ok(imgSempit>imgBawaan,'penegasannya berdiri setelah aturan gambar bawaan agar menang');
});

test('23. Tanpa unggahan, ketiga logo jatuh ke berkas bawaan dan tidak pernah gambar rusak',()=>{
  useMemoryStorage();
  saveSchoolMaster(admin(),{...getSchoolMaster(),name:'SD NEGERI UJI'});
  muatUlang();
  const master=getSchoolMaster();
  assert.equal(String(master.schoolLogo||''),'','master baru belum punya unggahan');
  const halaman=read('src/pages/login.js');
  assert.match(halaman,/CADANGAN_CREST=\{ministry:'\.\/assets\/logo-tut-wuri-handayani\.png',/);
  assert.match(halaman,/image\.classList\.add\('hidden'\)/,'slot yang gagal disembunyikan, bukan menampilkan gambar patah');
  /* Menghapus unggahan mengembalikan cadangan, bukan menyisakan nilai kosong yang rusak. */
  saveSchoolMaster(admin(),{...master,regionLogo:'data:image/png;base64,CCCC'});
  muatUlang();
  assert.equal(getSchoolMaster().regionLogo,'data:image/png;base64,CCCC');
  saveSchoolMaster(admin(),{...getSchoolMaster(),regionLogo:''});
  muatUlang();
  assert.equal(getSchoolMaster().regionLogo,'','unggahan terhapus, halaman kembali ke berkas bawaan');
});

/* ==================================================== N. TANGGAL RAPOR ADMIN KE GURU */

test('24. Admin menetapkan tanggal rapor per tahun pelajaran dan semester',()=>{
  useMemoryStorage();
  const ganjil=admin(`Ganjil ${ACADEMIC_YEAR}`);
  const genap=admin(`Genap ${ACADEMIC_YEAR}`);
  saveReportDateDefault(ganjil,{reportDate:'2026-12-19',reportCity:'Kabupaten Bekasi'});
  saveReportDateDefault(genap,{reportDate:'2027-06-20',reportCity:'Kabupaten Bekasi'});
  muatUlang();
  assert.equal(getReportDateDefault(ganjil).reportDate,'2026-12-19');
  assert.equal(getReportDateDefault(genap).reportDate,'2027-06-20','semester lain punya tanggalnya sendiri');
  assert.equal(getReportDateDefault(ganjil).reportDateLabel,'Kabupaten Bekasi, 19 Desember 2026');
  /* Hanya Admin. */
  assert.throws(()=>saveReportDateDefault(guru(),{reportDate:'2026-12-19'}),/Hanya Admin/);
  assert.throws(()=>saveReportDateDefault(ganjil,{reportDate:'bukan-tanggal'}),/tidak valid/);
});

test('25. Guru tanpa timpaan membaca tanggal Admin, dan ikut ketika Admin mengubahnya',()=>{
  useMemoryStorage();
  const sesi=guru();
  aktifkanSemuaMapel(sesi);
  saveReportDateDefault(admin(),{reportDate:'2026-12-19',reportCity:'Kabupaten Bekasi'});
  muatUlang();
  assert.equal(getPrintSettings(sesi).printDate,'2026-12-19','sebelum menyimpan pun sudah mengikuti Admin');
  /* Guru menyimpan pengaturan cetaknya tanpa menyentuh tanggal. */
  savePrintSettings(sesi,{principalName:'Kepala',principalNip:'1',teacherName:'Wali',teacherNip:'2',
    city:'Kabupaten Bekasi',printDate:'2026-12-19'});
  muatUlang();
  let cetak=getPrintSettings(sesi);
  assert.equal(cetak.printDateSource,'ADMIN','tanggalnya tidak dicatat sebagai timpaan');
  assert.equal(cetak.printDateOverride,'');
  /* Admin mengubah tanggal sekolah - dan rombel ini ikut, tanpa dibuka lagi. */
  saveReportDateDefault(admin(),{reportDate:'2026-12-22',reportCity:'Kabupaten Bekasi'});
  muatUlang();
  cetak=getPrintSettings(sesi);
  assert.equal(cetak.printDate,'2026-12-22','perubahan Admin terbawa');
  assert.equal(cetak.printDateLabel,'Kabupaten Bekasi, 22 Desember 2026');
});

test('26. Guru boleh menimpa tanggal untuk rombelnya, dan dapat kembali mengikuti Admin',()=>{
  useMemoryStorage();
  const sesi=guru();
  aktifkanSemuaMapel(sesi);
  saveReportDateDefault(admin(),{reportDate:'2026-12-19',reportCity:'Kabupaten Bekasi'});
  muatUlang();
  savePrintSettings(sesi,{principalName:'Kepala',principalNip:'1',teacherName:'Wali',teacherNip:'2',
    city:'Kabupaten Bekasi',printDate:'2026-12-23'});
  muatUlang();
  let cetak=getPrintSettings(sesi);
  assert.equal(cetak.printDateSource,'OVERRIDE');
  assert.equal(cetak.printDate,'2026-12-23','tanggal rombel menang atas tanggal Admin');
  /* Admin mengubah tanggalnya: rombel yang menimpa TIDAK ikut. */
  saveReportDateDefault(admin(),{reportDate:'2026-12-22',reportCity:'Kabupaten Bekasi'});
  muatUlang();
  assert.equal(getPrintSettings(sesi).printDate,'2026-12-23','timpaan guru tidak tertimpa balik');
  /* Mengosongkan tanggal mengembalikan rombel itu mengikuti Admin. */
  savePrintSettings(sesi,{principalName:'Kepala',principalNip:'1',teacherName:'Wali',teacherNip:'2',
    city:'Kabupaten Bekasi',printDate:''});
  muatUlang();
  cetak=getPrintSettings(sesi);
  assert.equal(cetak.printDateSource,'ADMIN');
  assert.equal(cetak.printDate,'2026-12-22');
});

test('27. Tanggal terpisah per rombel, semester, dan tahun pelajaran',()=>{
  useMemoryStorage();
  const a=guru('5B',`Ganjil ${ACADEMIC_YEAR}`);
  const b=guru('5A',`Ganjil ${ACADEMIC_YEAR}`);
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  aktifkanSemuaMapel(a);aktifkanSemuaMapel(b);aktifkanSemuaMapel(genap);
  saveReportDateDefault(admin(`Ganjil ${ACADEMIC_YEAR}`),{reportDate:'2026-12-19',reportCity:'Bekasi'});
  saveReportDateDefault(admin(`Genap ${ACADEMIC_YEAR}`),{reportDate:'2027-06-20',reportCity:'Bekasi'});
  muatUlang();
  savePrintSettings(a,{principalName:'Kepala',principalNip:'1',teacherName:'Wali 5B',teacherNip:'2',
    city:'Bekasi',printDate:'2026-12-23'});
  muatUlang();
  assert.equal(getPrintSettings(a).printDate,'2026-12-23','rombel yang menimpa');
  assert.equal(getPrintSettings(b).printDate,'2026-12-19','rombel lain tetap mengikuti Admin');
  assert.equal(getPrintSettings(genap).printDate,'2027-06-20','semester lain memakai tanggalnya sendiri');
});

test('28. Catatan cetak versi lama tetap terbaca dan tidak ditulis ulang',()=>{
  useMemoryStorage();
  const sesi=guru();
  aktifkanSemuaMapel(sesi);
  saveReportDateDefault(admin(),{reportDate:'2026-12-19',reportCity:'Bekasi'});
  const kunci=`${scopeKey(sesi)}|document-print-settings`;
  /* Bentuk persis catatan sebelum 1.2.8: hanya printDate, tanpa printDateOverride. */
  const lama={classId:'5B',semester:sesi.semester,academicYear:sesi.academicYear,
    principalName:'Kepala',principalNip:'1',teacherName:'Wali',teacherNip:'2',city:'Bekasi',
    printDate:'2026-12-30',printDateLabel:'Bekasi, 30 Desember 2026',
    updatedAt:'2025-01-01T00:00:00.000Z'};
  updateDb(db=>{db.printSettings[kunci]={...lama};return db;});
  muatUlang();
  const cetak=getPrintSettings(sesi);
  assert.equal(cetak.printDate,'2026-12-30','tanggal guru versi lama tidak hilang');
  assert.equal(cetak.printDateSource,'OVERRIDE','karena berbeda dari tanggal Admin, ia diperlakukan timpaan');
  muatUlang();
  assert.deepEqual(loadDb().printSettings[kunci],lama,'membaca tidak menulis ulang catatan lama');

  /* Catatan lama yang tanggalnya SAMA dengan tanggal bawaan lama pada master sekolah memang
     salinan tanggal Admin, jadi ia mengikuti - dan statusnya tidak berubah-ubah ketika Admin
     memperbarui tanggalnya. */
  saveSchoolMaster(admin(),{...getSchoolMaster(),name:'SD NEGERI UJI',reportDate:'2026-12-15',reportCity:'Bekasi'});
  updateDb(db=>{db.printSettings[kunci]={...lama,printDate:'2026-12-15',
    printDateLabel:'Bekasi, 15 Desember 2026'};return db;});
  muatUlang();
  assert.equal(getPrintSettings(sesi).printDateSource,'ADMIN');
  assert.equal(getPrintSettings(sesi).printDate,'2026-12-19','langsung mengikuti tanggal Admin yang berlaku');
  saveReportDateDefault(admin(),{reportDate:'2026-12-22',reportCity:'Bekasi'});
  muatUlang();
  assert.equal(getPrintSettings(sesi).printDate,'2026-12-22','dan tetap ikut ketika Admin mengubahnya lagi');
  assert.equal(getPrintSettings(sesi).printDateSource,'ADMIN','statusnya tidak berpindah sendiri');
});
