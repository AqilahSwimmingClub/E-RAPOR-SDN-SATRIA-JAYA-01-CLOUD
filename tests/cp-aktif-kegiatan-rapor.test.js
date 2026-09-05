import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { generateCocurricularDescription } from '../src/data/cocurricular.js';
import { defaultExtracurricularActivities,
  generateExtracurricularDescription } from '../src/data/extracurricular-defaults.js';
import { ASSESSMENT_TYPES, assessmentRubricConsistency, getAssessmentSettings,
  saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { ACTIVITY_PREDICATES, getStudentCocurricular, listCocurricularActivities,
  listExtracurriculars, previewAllCocurricular, previewAllExtracurricular,
  saveAllCocurricular, saveAllExtracurricular } from '../src/services/completeness.js';
import { listCpButir, listCpButirForSemester, setCpButirActive } from '../src/services/cp-butir.js';
import { composeIntracurricularButirDescription, composeReportButirDescription,
  deskripsiBocorFase, deskripsiMengulangMapel, kalimatRapor } from '../src/services/cp-descriptions.js';
import { generateAllReportDescriptions, generateReportDescription,
  getReportDescription, PESAN_TANPA_BUTIR_AKTIF } from '../src/services/descriptions.js';
import { composeIntracurricularDescriptionFromCp, listIntracurricularButir,
  listIntracurricularSubjects, previewAllIntracurricular,
  saveAllIntracurricular } from '../src/services/intracurricular.js';
import { createLearningObjective, listLearningObjectives } from '../src/services/objectives.js';
import { listSchoolObjectives } from '../src/services/learning-objectives.js';
import { REPORT_CATEGORIES, rubricConsistency,
  suggestReportRubricForKktp } from '../src/services/report-rubric.js';
import { saveAllAutomaticReports } from '../src/services/report-bulk.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';

/* SATU DASAR PENILAIAN, DUA KEGIATAN YANG TIDAK BOCOR, DAN RAPOR YANG OTOMATIS.

   Empat pendirian yang dijaga suite ini, seluruhnya lahir dari keadaan nyata di aplikasi:

     1. ARSIP TUJUAN PEMBELAJARAN tidak lagi tampil di menu Capaian Pembelajaran, dan tidak
        satu pun jalur penilaian yang membacanya. Datanya tetap utuh di penyimpanan.
     2. BUTIR CP AKTIF adalah satu-satunya dasar penilaian dan deskripsi. Tidak ada rantai
        cadangan ke TP, ke nama Elemen CP, ke butir nonaktif, maupun ke mata pelajaran lain.
     3. KOKURIKULER dan EKSTRAKURIKULER tidak pernah membawa deskripsi kegiatan sebelumnya.
     4. DESKRIPSI RAPOR memakai empat rujukan final, otomatis, dari Nilai Akhir terhadap
        rubrik mata pelajaran itu - dan rubriknya tidak boleh bertentangan dengan KKTP.

   Seluruh pemeriksaan mapel DINAMIS: daftarnya diambil dari konfigurasi aplikasi. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const buangKomentar=teks=>teks.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
function muatUlang(){invalidateDbCache();}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
function aktifkanSemuaMapel(session){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
}
function tambahSiswa(session,index=1,nama=`Siswa ${index}`){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`6611${String(index).padStart(6,'0')}`,name:nama,gender:index%2?'L':'P',photo:''});
}
function nilaiPenuh(session,subjectId,studentId,nilai,kktp=75){
  saveAssessmentSettings(session,subjectId,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,subjectId,jenis.id,{[studentId]:nilai});
}
function aturRubrik(session,subjectId,batas){
  const lama=getAssessmentSettings(session,subjectId);
  saveAssessmentSettings(session,subjectId,{...lama,
    rubric:REPORT_CATEGORIES.map((category,index)=>({category,min:batas[index][0],max:batas[index][1]}))});
}
/* Mapel yang benar-benar punya Butir CP aktif bagi murid itu - diambil dari aplikasi. */
function mapelBerButir(session,student){
  const milik=new Set(listSubjectsForStudent(session,student).map(item=>item.id));
  return listIntracurricularSubjects(session)
    .filter(item=>milik.has(item.id)&&listCpButirForSemester(session,item.id).length>0);
}

/* ==================================================== §A ARSIP TP HILANG DARI MENU CP */

test('1. Menu Capaian Pembelajaran tidak merender Arsip Tujuan Pembelajaran',()=>{
  const halaman=buangKomentar(read('src/pages/objectives.js'));
  /* Tidak ada judulnya, tidak ada wadahnya, dan tidak ada fungsi yang menggambarnya. */
  for(const jejak of ['Arsip Tujuan Pembelajaran','drawLegacy','data-legacy','legacyHost',
    'listSchoolObjectives','Pulihkan','Hapus Arsip'])
    assert.equal(halaman.includes(jejak),false,`menu CP tidak lagi memuat "${jejak}"`);
  /* Halaman ini tidak membaca koleksi TP sama sekali, jadi tidak ada jalan untuk kembali. */
  assert.equal(/learning-objectives\.js/.test(halaman)&&/listLearningObjectives|listSchoolObjectives/.test(halaman),
    false,'halaman CP tidak membaca koleksi TP');
  /* Yang tersisa memang pengelolaan Butir CP. */
  for(const wajib of ['Butir CP','data-subject','data-toggle','data-edit','data-tambah','Nonaktifkan Semua'])
    assert.ok(halaman.includes(wajib),`menu CP tetap memuat "${wajib}"`);
});

test('2. TP legacy tetap tersimpan di penyimpanan meski tidak tampil di UI',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const subject=mapelBerButir(session,tambahSiswa(session,1))[0];
  const tp=createLearningObjective(session,subject.id,{description:'TP lama sekolah',active:true});
  const sebelum=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');
  /* Datanya ada, dan tetap dapat dibaca lewat layanannya sendiri. */
  assert.ok(listLearningObjectives(session,subject.id).some(item=>item.id===tp.id));
  assert.ok(listSchoolObjectives(session,subject.id).some(item=>item.id===tp.id));
  /* Membangun deskripsi tidak menghapusnya. */
  nilaiPenuh(session,subject.id,listSubjectsForStudent(session,{classId:'5B'})&&
    JSON.parse(sebelum).students&&Object.values(JSON.parse(sebelum).students)[0].id,85);
  muatUlang();
  assert.ok(listLearningObjectives(session,subject.id).some(item=>item.id===tp.id),
    'catatan TP lama tidak dihapus oleh perubahan ini');
});

/* ============================================ §B BUTIR CP AKTIF SATU-SATUNYA DASAR */

test('3. Butir CP aktif dipakai, TP arsip pada mapel yang sama tidak',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  const tp=createLearningObjective(session,subject.id,
    {description:'kompetensi TP arsip yang tidak boleh terbawa',active:true});
  nilaiPenuh(session,subject.id,anak.id,85);
  const hasil=generateReportDescription(session,subject.id,anak.id);
  assert.equal(hasil.source,'CP_BUTIR');
  assert.equal(hasil.text.includes(tp.description),false,'isi TP arsip tidak masuk deskripsi');
  const butir=listCpButirForSemester(session,subject.id);
  assert.ok(hasil.text.includes(String(butir[0].teori)),'substansi Butir CP aktif yang dipakai');
  /* Dan TP-nya tetap ada. */
  assert.ok(listLearningObjectives(session,subject.id).some(item=>item.id===tp.id));
});

test('4. Tanpa Butir CP aktif, TP arsip TIDAK menjadi cadangan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  nilaiPenuh(session,subject.id,anak.id,85);
  const tp=createLearningObjective(session,subject.id,{description:'TP arsip',active:true});
  /* Seluruh Butir CP mapel ini dinonaktifkan. */
  for(const butir of listCpButir(session,subject.id))setCpButirActive(session,subject.id,butir.id,false);
  assert.equal(listCpButirForSemester(session,subject.id).length,0);
  assert.throws(()=>generateReportDescription(session,subject.id,anak.id),
    new RegExp(PESAN_TANPA_BUTIR_AKTIF.slice(0,40)),'tidak ada kalimat yang dikarang');
  /* Pesannya menyebut apa yang harus dilakukan guru. */
  assert.match(PESAN_TANPA_BUTIR_AKTIF,/Aktifkan atau tambahkan Butir CP/);
  /* Dan TP-nya tetap tersimpan, hanya tidak dipakai. */
  assert.ok(listLearningObjectives(session,subject.id).some(item=>item.id===tp.id));
});

test('5. Butir CP NONAKTIF tidak pernah dipakai',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  nilaiPenuh(session,subject.id,anak.id,85);
  const semua=listCpButir(session,subject.id);
  assert.ok(semua.length>=2,'mapel uji punya beberapa butir');
  /* Butir pertama dinonaktifkan; substansinya tidak boleh muncul di mana pun. */
  const dimatikan=semua[0];
  setCpButirActive(session,subject.id,dimatikan.id,false);
  const rapor=generateReportDescription(session,subject.id,anak.id);
  assert.equal(rapor.text.includes(String(dimatikan.teori)),false,
    'substansi butir nonaktif tidak masuk Deskripsi Rapor');
  assert.equal(rapor.butirIds.includes(dimatikan.id),false,'butir nonaktif tidak menjadi acuan');
  /* Butir nonaktif yang dipaksa dikirim tidak lolos; karena hanya itu yang dikirim, tidak ada
     butir sah yang tersisa dan penyusun menolak dengan pesan wajib-pilih. */
  assert.throws(()=>composeIntracurricularDescriptionFromCp(session,{studentName:anak.name,
    subjectId:subject.id,butirIds:[dimatikan.id],predicate:'Baik'}),
    /Pilih minimal 1 Butir CP aktif/,'butir nonaktif tidak pernah menjadi dasar');
});

/* ============================================================ §C DESKRIPSI INTRAKURIKULER */

test('6. Intrakurikuler: nama + Butir CP aktif + Teori + predikat guru',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1,'Adwa Habibi Rizky');
  const subject=mapelBerButir(session,anak)[0];
  const butir=listIntracurricularButir(session,subject.id).slice(0,1);
  const teks=composeIntracurricularDescriptionFromCp(session,{studentName:anak.name,
    subjectId:subject.id,butirIds:butir.map(item=>item.id),jenis:'teori',predicate:'Baik'});
  assert.match(teks,/^Ananda Adwa Habibi Rizky /,'dibuka dengan nama murid');
  assert.ok(teks.includes(String(butir[0].teori)),'memuat substansi Butir CP yang dipilih');
  assert.match(teks,/pemahaman|memahami|penguasaan/,'Teori berbicara pemahaman');
  assert.match(teks,/\.$/);
  /* Bebas dari bahasa administratif kurikulum. */
  assert.equal(deskripsiBocorFase(teks),false);
  assert.equal(deskripsiMengulangMapel(teks,subject.name),false);
});

test('7. Praktik berbeda dari Teori dan tidak mengarang keterampilan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  for(const subject of mapelBerButir(session,anak)){
    const butir=listIntracurricularButir(session,subject.id).slice(0,2);
    const ids=butir.map(item=>item.id);
    const teori=composeIntracurricularDescriptionFromCp(session,{studentName:anak.name,
      subjectId:subject.id,butirIds:ids,jenis:'teori',predicate:'Baik'});
    const praktik=composeIntracurricularDescriptionFromCp(session,{studentName:anak.name,
      subjectId:subject.id,butirIds:ids,jenis:'praktik',predicate:'Baik'});
    assert.notEqual(teori,praktik,`${subject.name}: dua jenis, dua kalimat`);
    assert.match(praktik,/keterampilan|terampil|mampu/,`${subject.name}: Praktik berbahasa keterampilan`);
    /* Kalimat Praktik hanya boleh memuat rumusan keterampilan yang MEMANG tertulis pada
       butirnya. Butir yang hanya punya rumusan pengetahuan tetap dilaporkan sebagai
       pemahaman - tidak dikarang menjadi keterampilan. */
    for(const item of butir){
      const rumusanPraktik=String(item.praktik||'').trim();
      if(rumusanPraktik)assert.ok(praktik.includes(rumusanPraktik),
        `${subject.name}: rumusan keterampilan dipakai apa adanya`);
      else assert.ok(praktik.includes(String(item.teori)),
        `${subject.name}: butir tanpa rumusan keterampilan tetap dilaporkan sebagai pemahaman`);
    }
  }
});

test('8. Predikat setiap siswa dipakai apa adanya, tidak diseragamkan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const murid=[1,2,3,4].map(index=>tambahSiswa(session,index));
  const subject=mapelBerButir(session,murid[0])[0];
  const pilihan=Object.fromEntries(murid.map((anak,index)=>[anak.id,ACTIVITY_PREDICATES[index]]));
  const butir=listCpButirForSemester(session,subject.id).slice(0,1).map(item=>item.id);
  const pratinjau=previewAllIntracurricular(session,{subjectId:subject.id,butirIds:butir,
    predicate:'Baik',predicates:pilihan});
  for(const row of pratinjau.rows)
    assert.equal(row.predicate,pilihan[row.studentId],'predikat murid dipakai apa adanya');
  assert.equal(new Set(pratinjau.rows.map(row=>row.predicate)).size,ACTIVITY_PREDICATES.length,
    'empat predikat berbeda bertahan, tidak diseragamkan menjadi Baik');
  /* Kalimatnya pun mengikuti predikat masing-masing. */
  assert.equal(new Set(pratinjau.rows.map(row=>row.description)).size,murid.length);
  saveAllIntracurricular(session,{subjectId:subject.id,rows:pratinjau.rows});
  muatUlang();
  for(const anak of murid)assert.equal(
    previewAllIntracurricular(session,{subjectId:subject.id,butirIds:butir,predicate:'Baik'}).rows
      .find(row=>row.studentId===anak.id).predicate,pilihan[anak.id],
    'predikat tersimpan tetap dipakai pada generate berikutnya');
});

/* ==================================== §E-§G KOKURIKULER DAN EKSTRAKURIKULER TANPA BOCOR */

test('9. Kokurikuler: ganti kegiatan tidak membawa deskripsi kegiatan sebelumnya',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const murid=[1,2].map(index=>tambahSiswa(session,index));
  const [kegiatanA,kegiatanB]=listCocurricularActivities();
  assert.ok(kegiatanA&&kegiatanB&&kegiatanA!==kegiatanB);
  const susun=({student,activity,predicate})=>generateCocurricularDescription(
    {studentName:student.name,activity,predicate,classId:session.classId});

  const draftA=previewAllCocurricular(session,{activity:kegiatanA,predicate:'Baik',describe:susun});
  for(const row of draftA.rows){
    assert.equal(row.activity,kegiatanA);
    assert.ok(row.description.includes(kegiatanA),'kalimat menyebut kegiatannya sendiri');
    assert.match(row.description,/^Ananda /);
  }
  saveAllCocurricular(session,{activity:kegiatanA,rows:draftA.rows});

  const draftB=previewAllCocurricular(session,{activity:kegiatanB,predicate:'Baik',describe:susun});
  for(const row of draftB.rows){
    assert.equal(row.activity,kegiatanB);
    assert.ok(row.description.includes(kegiatanB),'kalimat B menyebut kegiatan B');
    assert.equal(row.description.includes(kegiatanA),false,'deskripsi A tidak terbawa ke B');
    assert.equal(row.description,draftA.rows.find(item=>item.studentId===row.studentId).description===row.description
      ?row.description:row.description,'baris B berdiri sendiri');
    assert.notEqual(row.description,draftA.rows.find(item=>item.studentId===row.studentId).description);
  }
  saveAllCocurricular(session,{activity:kegiatanB,rows:draftB.rows});
  muatUlang();
  for(const anak of murid){
    const tersimpan=getStudentCocurricular(session,anak.id);
    assert.equal(tersimpan.activity,kegiatanB);
    assert.ok(tersimpan.description.includes(kegiatanB));
    assert.equal(tersimpan.description.includes(kegiatanA),false);
  }
});

test('10. Ekstrakurikuler: ganti kegiatan tidak membawa deskripsi kegiatan sebelumnya',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const murid=[1,2].map(index=>tambahSiswa(session,index));
  const daftar=defaultExtracurricularActivities(session.classId);
  assert.ok(daftar.length>=2,'ada beberapa kegiatan bawaan');
  const [a,b]=daftar;
  const susun=({student,activity,predicate})=>generateExtracurricularDescription(
    {studentName:student.name,activity:daftar.find(item=>item.name===activity)||{name:activity},
      predicate,classId:session.classId});

  const draftA=previewAllExtracurricular(session,{name:a.name,predicate:'Baik',describe:susun});
  saveAllExtracurricular(session,{name:a.name,rows:draftA.rows});
  const draftB=previewAllExtracurricular(session,{name:b.name,predicate:'Baik',describe:susun});
  for(const row of draftB.rows){
    assert.equal(row.activity,b.name);
    assert.match(row.description,/^Ananda /);
    assert.ok(row.description.includes(b.name));
    assert.equal(row.description.includes(a.name),false,'deskripsi kegiatan A tidak terbawa');
  }
  saveAllExtracurricular(session,{name:b.name,rows:draftB.rows});
  muatUlang();
  for(const anak of murid){
    const catatan=listExtracurriculars(session,anak.id);
    const b1=catatan.find(item=>item.name===b.name);
    assert.ok(b1&&b1.description.includes(b.name));
    assert.equal(b1.description.includes(a.name),false);
    /* Catatan kegiatan A tetap ada - menyimpan B tidak menghapusnya. */
    assert.ok(catatan.some(item=>item.name===a.name),'catatan kegiatan sebelumnya tidak dihapus');
  }
});

test('11-12. Bulk kedua kegiatan menolak baris dari kegiatan lain',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const anak=tambahSiswa(session,1);
  const [kegiatanA,kegiatanB]=listCocurricularActivities();
  /* Baris yang membawa kegiatan A dipaksa disimpan pada kegiatan B: kegiatan yang sedang
     diproses selalu menang, sehingga deskripsi basi tidak dapat menyelinap masuk. */
  const hasil=saveAllCocurricular(session,{activity:kegiatanB,
    rows:[{studentId:anak.id,name:anak.name,activity:kegiatanA,predicate:'Baik',
      description:`Ananda ${anak.name} terlibat dengan baik pada kegiatan kokurikuler ${kegiatanA}.`}]});
  assert.equal(hasil.tersimpan,1);
  assert.equal(getStudentCocurricular(session,anak.id).activity,kegiatanB,
    'kegiatan yang tersimpan adalah kegiatan yang sedang diproses');
  /* Halaman kedua kegiatan memisahkan draf per kegiatan. */
  for(const berkas of ['src/pages/cocurricular-input.js','src/pages/extracurricular-input.js']){
    const halaman=read(berkas);
    assert.match(halaman,/drafPerKegiatan/,`${berkas}: draf dipisah per kegiatan`);
    assert.match(halaman,/\[data-activity\]'\)\.onchange/,`${berkas}: perubahan kegiatan ditangani`);
    assert.match(halaman,/data-fill-all/);
    assert.match(halaman,/data-save-all/);
  }
});

/* =========================================================== §H-§L DESKRIPSI RAPOR FINAL */

test('13-15. Empat rujukan final, otomatis, dan selalu menyapa murid',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1,'Adwa Habibi Rizky');
  const subject=mapelBerButir(session,anak)[0];
  /* Rubrik contoh dari permintaan: KKTP 75 dengan 90/80/75/0-74. */
  nilaiPenuh(session,subject.id,anak.id,80,75);
  aturRubrik(session,subject.id,[[90,100],[80,89],[75,79],[0,74]]);
  const harapan=[[92,'menunjukkan capaian penguasaan yang sangat baik dalam '],
    [80,'menunjukkan capaian yang baik dalam '],
    [77,'telah menunjukkan capaian pemahaman yang cukup mengenai '],
    [70,'perlu meningkatkan pemahaman mengenai ']];
  for(const [nilai,bingkai] of harapan){
    nilaiPenuh(session,subject.id,anak.id,nilai,75);
    const teks=generateReportDescription(session,subject.id,anak.id).text;
    assert.ok(teks.startsWith(`Ananda ${anak.name} ${bingkai}`),`nilai ${nilai}: ${teks}`);
    /* Guru tidak pernah memilih kategorinya: ia lahir dari Nilai Akhir terhadap rubrik. */
    assert.equal(generateReportDescription.length,3,'generator tidak menerima pilihan kategori');
  }
  /* Nilai Akhir 80 pada rubrik itu berbunyi persis seperti contoh yang diminta: bingkai BAIK,
     kompetensi dari Butir CP aktif mapel itu, dan tidak ada yang lain. */
  nilaiPenuh(session,subject.id,anak.id,80,75);
  const butir=listCpButirForSemester(session,subject.id);
  const teks=generateReportDescription(session,subject.id,anak.id).text;
  assert.ok(teks.startsWith(`Ananda ${anak.name} menunjukkan capaian yang baik dalam memahami `));
  assert.ok(teks.includes(String(butir[0].teori)),'kompetensi pertama Butir CP aktif ikut');
  assert.match(teks,/\.$/);
});

test('16. Kalimat rapor tidak pernah rusak secara tata bahasa',()=>{
  const nama='Siswa 1';
  const benda='bilangan cacah sampai 1.000.000 beserta nilai tempatnya';
  const kerja='menganalisis pelaksanaan kewajiban warga negara';
  for(const kategori of [...REPORT_CATEGORIES,null]){
    for(const fokus of [benda,kerja]){
      const kalimat=kalimatRapor(kategori,fokus,nama);
      assert.match(kalimat,/^Ananda Siswa 1 /);
      assert.match(kalimat,/\.$/);
      for(const rusak of ['memahami memahami','mengenai memahami','dalam dalam','mengenai mengenai'])
        assert.equal(kalimat.includes(rusak),false,`${kategori}/${fokus}: tidak ada "${rusak}"`);
    }
  }
  /* Frasa benda diberi kata kerja setelah "dalam"; frasa yang sudah berkata kerja tidak. */
  assert.ok(kalimatRapor('BAIK',benda,nama).includes(`dalam memahami ${benda}`));
  assert.ok(kalimatRapor('BAIK',kerja,nama).includes(`dalam ${kerja}`));
  assert.ok(kalimatRapor('CUKUP',benda,nama).includes(`mengenai ${benda}`));
});

test('17. KKTP dan rubrik tidak boleh bertentangan, dan konfliknya dinyatakan',()=>{
  /* Contoh yang diminta: KKTP 75 dengan 90-100 / 80-89 / 75-79 / 0-74 adalah selaras. */
  const selaras=suggestReportRubricForKktp(null,75);
  assert.deepEqual(selaras.map(item=>[item.category,item.min,item.max]),
    [['SANGAT BAIK',90,100],['BAIK',80,89],['CUKUP',75,79],['PERLU BIMBINGAN',0,74]]);
  assert.equal(rubricConsistency(selaras,75).consistent,true);
  /* Menaikkan KKTP tanpa menyentuh rubrik membuatnya bertentangan - dan itu dikatakan. */
  const konflik=rubricConsistency(selaras,85);
  assert.equal(konflik.consistent,false);
  assert.match(konflik.message,/belum selaras dengan KKTP 85/);
  assert.ok(konflik.issues.length,'alasannya disebutkan');
  /* Nilai yang sudah tuntas tidak boleh dinyatakan PERLU BIMBINGAN. */
  const terbalik=suggestReportRubricForKktp(null,60);
  assert.equal(rubricConsistency(terbalik,60).consistent,true);
  assert.equal(rubricConsistency(terbalik,50).consistent,false);
  /* Penyelarasan yang tidak mungkin dikatakan apa adanya, bukan dikarang. */
  assert.equal(suggestReportRubricForKktp(null,0),null);
  assert.equal(suggestReportRubricForKktp(null,100),null);
});

test('17b. Perubahan KKTP memicu peringatan pada pengaturan mata pelajaran',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  nilaiPenuh(session,subject.id,anak.id,80,75);
  assert.equal(assessmentRubricConsistency(session,subject.id).consistent,true,
    'bawaan aplikasi selaras dengan KKTP bawaan');
  /* KKTP dinaikkan; rubriknya tidak ikut, jadi konfliknya harus terlihat. */
  const lama=getAssessmentSettings(session,subject.id);
  saveAssessmentSettings(session,subject.id,{...lama,kktp:85});
  const periksa=assessmentRubricConsistency(session,subject.id);
  assert.equal(periksa.consistent,false);
  assert.match(periksa.message,/belum selaras dengan KKTP 85/);
  /* PERINGATAN, BUKAN PENOLAKAN: rubrik dan KKTP-nya tetap tersimpan apa adanya. */
  assert.equal(getAssessmentSettings(session,subject.id).kktp,85);
  assert.deepEqual(getAssessmentSettings(session,subject.id).rubric,lama.rubric);
  /* Halaman menampilkan peringatan dan menyediakan penyesuaian sekali tekan. */
  const halaman=read('src/pages/weights.js');
  assert.match(halaman,/rubricConsistency\(/);
  assert.match(halaman,/data-align-rubric/);
  assert.match(halaman,/rubric-warning/);
  assert.match(halaman,/suggestReportRubricForKktp\(/);
});

test('18. Generate Semua Siswa dan Simpan Otomatis Semua Mapel memakai pipeline yang sama',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const murid=[1,2].map(index=>tambahSiswa(session,index));
  const subjects=mapelBerButir(session,murid[0]);
  for(const subject of subjects)
    for(const anak of murid)nilaiPenuh(session,subject.id,anak.id,80,75);
  /* Jalur A: Generate Semua Siswa per mapel. */
  for(const subject of subjects)generateAllReportDescriptions(session,subject.id,{overwriteEdited:true});
  const jalurA=subjects.map(subject=>murid.map(anak=>getReportDescription(session,subject.id,anak.id).text));
  /* Jalur B: Simpan Otomatis Semua Mapel. */
  const hasil=saveAllAutomaticReports(session,{overwriteEdited:true});
  assert.equal(hasil.errors.length,0);
  const jalurB=subjects.map(subject=>murid.map(anak=>getReportDescription(session,subject.id,anak.id).text));
  assert.deepEqual(jalurB,jalurA,'dua jalur, satu logika kategori');
  /* Dan keduanya memang memanggil penyusun yang sama. */
  assert.match(read('src/services/report-bulk.js'),/generateAllReportDescriptions/);
});

test('19. Seluruh subjectId aktif diuji dinamis dan tidak pernah bercampur',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,anak);
  assert.ok(subjects.length>=3,'beberapa mapel diuji sekaligus');
  const kalimat=new Map();
  for(const subject of subjects){
    nilaiPenuh(session,subject.id,anak.id,88,75);
    const hasil=generateReportDescription(session,subject.id,anak.id);
    const butir=listCpButirForSemester(session,subject.id);
    assert.ok(hasil.text.includes(String(butir[0].teori)),`${subject.name}: kompetensinya sendiri`);
    assert.equal(deskripsiBocorFase(hasil.text),false,`${subject.name}: bebas Fase, kode CP, dan TP`);
    assert.equal(deskripsiMengulangMapel(hasil.text,subject.name),false,`${subject.name}: nama mapel tidak diulang`);
    kalimat.set(subject.id,hasil.text);
  }
  assert.equal(new Set(kalimat.values()).size,subjects.length,'tidak ada dua mapel berbagi kalimat');
  /* Kompetensi mapel lain tidak pernah menyeberang. */
  for(const subject of subjects)
    for(const lain of subjects){
      if(lain.id===subject.id)continue;
      const butirLain=listCpButirForSemester(session,lain.id);
      assert.equal(kalimat.get(subject.id).includes(String(butirLain[0].teori)),false,
        `${subject.name} tidak memuat kompetensi ${lain.name}`);
    }
});

/* ================================================================== §N DATA TIDAK HILANG */

test('20. Perubahan ini tidak menghapus data yang sudah ada',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  nilaiPenuh(session,subject.id,anak.id,85);
  const tp=createLearningObjective(session,subject.id,{description:'TP arsip sekolah',active:true});
  saveAllAutomaticReports(session,{overwriteEdited:true});
  const sebelum=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');

  muatUlang();
  generateReportDescription(session,subject.id,anak.id);
  listSchoolObjectives(session,subject.id);
  assessmentRubricConsistency(session,subject.id);
  assert.equal(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'),sebelum,
    'membaca data tidak pernah menuliskan perubahan');
  assert.ok(listLearningObjectives(session,subject.id).some(item=>item.id===tp.id),
    'TP arsip tetap tersimpan');
  /* Tidak ada satu jalur baru pun yang membuang koleksi. */
  for(const berkas of ['src/services/descriptions.js','src/services/completeness.js',
    'src/services/cp-descriptions.js','src/pages/objectives.js']){
    const isi=read(berkas);
    assert.equal(/localStorage\.clear|removeItem/.test(isi),false,`${berkas} tidak menghapus penyimpanan`);
    assert.equal(/delete db\.(learningObjectives|reportDescriptions|assessmentScores)\s*[;\n]/.test(isi),
      false,`${berkas} tidak membuang koleksi yang sudah ada`);
  }
});

test('21. Bahasa administratif kurikulum tidak pernah bocor ke kalimat mana pun',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const kalimat=[];
  for(const subject of mapelBerButir(session,anak)){
    nilaiPenuh(session,subject.id,anak.id,88,75);
    kalimat.push(generateReportDescription(session,subject.id,anak.id).text);
    kalimat.push(composeIntracurricularDescriptionFromCp(session,{studentName:anak.name,
      subjectId:subject.id,butirIds:listCpButirForSemester(session,subject.id).slice(0,1).map(item=>item.id),
      predicate:'Baik'}));
  }
  kalimat.push(generateCocurricularDescription({studentName:anak.name,
    activity:listCocurricularActivities()[0],predicate:'Baik',classId:'5B'}));
  kalimat.push(generateExtracurricularDescription({studentName:anak.name,
    activity:defaultExtracurricularActivities('5B')[0],predicate:'Baik',classId:'5B'}));
  for(const teks of kalimat){
    assert.ok(teks,'setiap kalimat tersusun');
    assert.equal(deskripsiBocorFase(teks),false,`bebas Fase/kode CP/TP: ${teks}`);
    assert.equal(/\bFase [ABC]\b|\bTujuan Pembelajaran\b|\bcp-butir\b/.test(teks),false,teks);
  }
});

test('22. Penyusun Intrakurikuler dan Rapor tetap dua fungsi yang berbeda',()=>{
  const butir=[{teori:'bilangan cacah sampai 1.000.000 beserta nilai tempatnya',
    praktik:'menyajikan bilangan cacah sampai 1.000.000'}];
  const intra=composeIntracurricularButirDescription({studentName:'Siswa 1',butir,
    jenis:'teori',predicate:'Baik'});
  const rapor=composeReportButirDescription({studentName:'Siswa 1',butir,finalScore:82});
  assert.notEqual(intra,rapor,'satu Butir CP, dua kalimat berbeda');
  for(const teks of [intra,rapor])assert.match(teks,/^Ananda Siswa 1 /);
  assert.equal(/menunjukkan capaian/.test(intra),false,'Intrakurikuler bukan bingkai rapor');
  /* Tanpa nama murid maupun tanpa butir, tidak ada kalimat yang dikarang. */
  assert.equal(composeIntracurricularButirDescription({studentName:'',butir,predicate:'Baik'}),null);
  assert.equal(composeReportButirDescription({studentName:'Siswa 1',butir:[],finalScore:82}),null);
});
