import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultExtracurricularActivities, pramukaActivityName } from '../src/data/extracurricular-defaults.js';
import { generateCocurricularDescription } from '../src/data/cocurricular.js';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT, religionMatches, religionOfSubject } from '../src/data/constants.js';
import { COCURRICULAR_ACTIVITY_PRESETS } from '../src/data/cocurricular.js';
import { ACTIVITY_PREDICATES, cocurricularDescriptionsForClass, getStudentCocurricular, listCocurricularActivities, listExtracurriculars, pramukaDescriptionsForClass, pramukaPresetForClass, saveCocurricularBulk, saveExtracurricularBulk, saveStudentCocurricular } from '../src/services/completeness.js';
import { calculateReportScore, getStoredReportRows, saveAutomaticReportScores } from '../src/services/report.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { getLeger, getReportCompleteness, getReportDocument } from '../src/services/documents.js';
import { createStudent } from '../src/services/students.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';
import { loadDb, storageKey } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { runAppMigrations } from '../src/services/migrations.js';
import { APP_SCHEMA_VERSION, PREVIOUS_RELEASE } from '../src/data/version.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
let bacaan=0;
function useMemoryStorage(){const values=new Map();bacaan=0;globalThis.localStorage={getItem:key=>{if(key==='erapor_satria_jaya_01_v1')bacaan+=1;return values.has(key)?values.get(key):null;},setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}
const PAI='Pendidikan Agama Islam dan Budi Pekerti';
const PAK='Pendidikan Agama Kristen dan Budi Pekerti';

/* ------------------------------------------------------------ 1-4. Preset Pramuka otomatis */

test('1. Kelas 1-3 otomatis memakai Pramuka Siaga',()=>{
  for(const kelas of ['1A','2B','3C'])assert.equal(pramukaPresetForClass(kelas),'Pramuka Siaga',`${kelas} memakai Siaga`);
});

test('2. Kelas 4-6 otomatis memakai Pramuka Penggalang',()=>{
  for(const kelas of ['4A','5B','6D'])assert.equal(pramukaPresetForClass(kelas),'Pramuka Penggalang',`${kelas} memakai Penggalang`);
});

test('3 & 4. Siaga dan Penggalang masing-masing punya 5 deskripsi yang berbeda',()=>{
  const siaga=pramukaDescriptionsForClass('2A');
  const penggalang=pramukaDescriptionsForClass('5B');
  assert.equal(siaga.length,5);
  assert.equal(penggalang.length,5);
  assert.equal(new Set([...siaga,...penggalang]).size,10,'tidak ada deskripsi generik yang dipakai ulang');
  /* Deskripsi menyentuh disiplin, tanggung jawab, kerja sama, kemandirian, dan kepedulian. */
  const gabungan=[...siaga,...penggalang].join(' ').toLowerCase();
  for(const tema of ['disiplin','tanggung jawab','bekerja sama','kemandirian','kepedulian'])
    assert.ok(gabungan.includes(tema),`deskripsi memuat tema ${tema}`);
});

test('Form ekstrakurikuler menyediakan pilihan otomatis, bukan ketikan bebas',()=>{
  const page=read('src/pages/extracurricular-input.js');
  assert.match(page,/defaultExtracurricularActivities\(session\.classId\)/,'kegiatan berupa pilihan bawaan');
  assert.match(page,/select class="input" data-activity/,'kegiatan berupa dropdown');
  assert.match(page,/select class="input" data-predicate/,'predikat berupa pilihan');
  assert.match(page,/function predicateOptions\(/,'pilihan predikat dibangun dari daftar resmi');
  /* Pramuka tetap kegiatan utama dan namanya mengikuti tingkat kelas. */
  assert.match(pramukaActivityName('2A'),/Siaga/);
  assert.match(pramukaActivityName('5B'),/Penggalang/);
  assert.equal(defaultExtracurricularActivities('5B')[0].name,'Pramuka Penggalang');
  /* Tidak lagi memakai input teks bebas untuk nama, predikat, dan deskripsi ekstrakurikuler. */
  assert.equal(/<input class="input" name="predicate"/.test(page),false);
  assert.equal(/input class="input" data-activity/.test(page),false,'bukan lagi ketikan bebas');
});

test('5. Ekstrakurikuler dapat diterapkan ke semua siswa sekaligus',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const daftar=[siswa(session,'A'),siswa(session,'B'),siswa(session,'C')];
  const deskripsi=pramukaDescriptionsForClass('5B')[2];
  const hasil=saveExtracurricularBulk(session,{name:pramukaPresetForClass('5B'),predicate:'Sangat Baik',description:deskripsi});
  assert.equal(hasil.studentCount,daftar.length);
  for(const anak of daftar){
    const record=listExtracurriculars(session,anak.id)[0];
    assert.equal(record.name,'Pramuka Penggalang');
    assert.equal(record.predicate,'Sangat Baik');
    assert.equal(record.description,deskripsi);
  }
  /* Ulangi dengan overwrite dimatikan: data individual tidak tersentuh. */
  saveStudentCocurricular;
  const ulang=saveExtracurricularBulk(session,{name:'Pramuka Penggalang',predicate:'Baik',description:pramukaDescriptionsForClass('5B')[0]},{overwrite:false});
  assert.equal(ulang.skipped,daftar.length,'seluruh data individual dilewati');
  assert.equal(listExtracurriculars(session,daftar[0].id)[0].predicate,'Sangat Baik','predikat lama tidak berubah');
  /* Tombol massalnya berganti nama mengikuti pola Intrakurikuler: data-fill-all menyusun draf,
     data-save-all menyimpannya. Layanan saveExtracurricularBulk di atas tetap ada dan tetap
     diuji, sehingga data lama yang dibuatnya tidak kehilangan penjaganya. */
  const halamanEkstra=read('src/pages/extracurricular-input.js');
  assert.match(halamanEkstra,/data-fill-all/,'tersedia tombol massal pada halaman input');
  assert.match(halamanEkstra,/data-save-all/,'tersedia tombol Simpan Semua pada halaman input');
});

/* ------------------------------------------------------------- 6-9. Kokurikuler preset */

test('6. Lima kegiatan kokurikuler tersedia sebagai pilihan',()=>{
  assert.deepEqual(listCocurricularActivities(),['Kunjungan Edukasi (Field Trip)','Proyek Peduli Lingkungan','Bakti Sosial','Pengenalan Budaya','Pelatihan Literasi']);
  const page=read('src/pages/cocurricular-input.js');
  assert.match(page,/listCocurricularActivities\(\)/,'halaman memakai daftar preset');
  assert.match(page,/select class="input" data-activity/,'kegiatan berupa dropdown');
  assert.equal(/input class="input" data-activity/.test(page),false,'bukan lagi input teks kosong');
});

test('7 & 8. Setiap kegiatan punya 5 deskripsi kelas rendah dan 5 kelas tinggi yang berbeda',()=>{
  const semua=[];
  for(const preset of COCURRICULAR_ACTIVITY_PRESETS){
    const rendah=cocurricularDescriptionsForClass('2A',preset.name);
    const tinggi=cocurricularDescriptionsForClass('5B',preset.name);
    assert.equal(rendah.length,5,`${preset.name} punya 5 deskripsi kelas rendah`);
    assert.equal(tinggi.length,5,`${preset.name} punya 5 deskripsi kelas tinggi`);
    assert.notDeepEqual(rendah,tinggi,`${preset.name} membedakan kelas rendah dan tinggi`);
    semua.push(...rendah,...tinggi);
  }
  assert.equal(semua.length,50);
  assert.equal(new Set(semua).size,50,'seluruh 50 deskripsi unik');
  /* Deskripsi berubah mengikuti kegiatan yang dipilih, bukan satu daftar generik. */
  assert.notDeepEqual(cocurricularDescriptionsForClass('5B','Bakti Sosial'),cocurricularDescriptionsForClass('5B','Pelatihan Literasi'));
  /* Deskripsi otomatis pada halaman input juga mengikuti kegiatan dan tingkat kelas. */
  assert.notEqual(
    generateCocurricularDescription({studentName:'Bayu',activity:'Bakti Sosial',predicate:'Baik',classId:'5B'}),
    generateCocurricularDescription({studentName:'Bayu',activity:'Pelatihan Literasi',predicate:'Baik',classId:'5B'}),
  );
});

test('9. Kokurikuler dapat diterapkan ke semua siswa dan tetap dapat diedit satuan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const daftar=[siswa(session,'A'),siswa(session,'B')];
  const kegiatan='Bakti Sosial';
  const deskripsi=cocurricularDescriptionsForClass('5B',kegiatan)[1];
  const hasil=saveCocurricularBulk(session,{activity:kegiatan,predicate:'Baik',description:deskripsi});
  assert.equal(hasil.studentCount,2);
  for(const anak of daftar){
    const record=getStudentCocurricular(session,anak.id);
    assert.equal(record.activity,kegiatan);
    assert.equal(record.predicate,'Baik');
    assert.equal(record.description,deskripsi);
  }
  /* Edit satuan setelah generate massal tetap berlaku. */
  saveStudentCocurricular(session,daftar[0].id,{activity:'Pelatihan Literasi',predicate:'Sangat Baik',description:cocurricularDescriptionsForClass('5B','Pelatihan Literasi')[0]});
  assert.equal(getStudentCocurricular(session,daftar[0].id).activity,'Pelatihan Literasi');
  assert.equal(getStudentCocurricular(session,daftar[1].id).activity,kegiatan,'siswa lain tidak ikut berubah');
  assert.deepEqual(ACTIVITY_PREDICATES,['Sangat Baik','Baik','Cukup','Perlu Bimbingan']);
});

test('Kokurikuler tetap tidak diwajibkan untuk mencetak rapor',()=>{
  assert.equal(/cocurricular/.test(read('src/services/documents.js').match(/const categories=\{[^}]*\}/)[0]),false,'kokurikuler bukan syarat kelengkapan');
});

/* ------------------------------------------------------- 10-12. Mapel agama pada rapor */

test('10. Siswa Islam menampilkan PAI BP pada rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'ISL',{religion:'Islam'});
  fillAllAssessmentScores(session,'agama','85');
  saveAutomaticReportScores(session,'agama');
  const nama=getReportDocument(session,anak.id).subjects.map(item=>item.subject.name);
  assert.ok(nama.includes(PAI));
  assert.equal(nama.includes(PAK),false);
});

test('11. Siswa Kristen menampilkan PAK BP pada rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const anak=siswa(session,'KRS',{religion:'Kristen'});
  fillAllAssessmentScores(session,'agama_kristen','88');
  saveAutomaticReportScores(session,'agama_kristen');
  const nama=getReportDocument(session,anak.id).subjects.map(item=>item.subject.name);
  assert.ok(nama.includes(PAK));
  assert.equal(nama.includes(PAI),false);
});

test('12. Mapel agama tidak hilang karena NIS kosong, nilai belum ada, atau Mapping nonaktif',()=>{
  useMemoryStorage();
  const session=guru('5B');
  /* Mapel agama sengaja TIDAK diaktifkan di Mapping rombel. */
  aktifkan(session,['mtk']);
  const tanpaNis=siswa(session,'TANPA',{nis:'',religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});

  assert.ok(listSubjectsForStudent(session,tanpaNis).some(item=>item.id==='agama'),'NIS kosong tidak menghilangkan mapel agama');
  assert.ok(listSubjectsForStudent(session,kristen).some(item=>item.id==='agama_kristen'),'Mapping nonaktif tidak menghilangkan mapel agama');
  /* Belum ada nilai sama sekali pun mapelnya tetap tampil di rapor. */
  const nama=getReportDocument(session,tanpaNis.id).subjects.map(item=>item.subject.name);
  assert.ok(nama.includes(PAI),'mapel agama tampil walau nilainya belum ada');
  assert.equal(getReportDocument(session,kristen.id).subjects.some(item=>item.subject.name===PAI),false,'siswa Kristen tidak menerima PAI');

  /* Mapping lama yang memakai id berbeda tetap dikenali sebagai mapel agama. */
  assert.equal(religionOfSubject({id:'pai',name:'Pendidikan Agama Islam dan Budi Pekerti'}),'Islam');
  assert.equal(religionOfSubject({id:'agama_katolik',name:'Pendidikan Agama Katolik'}),'Katolik');
  assert.equal(religionOfSubject({id:'mtk',name:'Matematika'}),null);
  assert.equal(religionMatches('Kristen','Kristen Protestan'),true,'penulisan agama yang lebih panjang tetap cocok');
  assert.equal(religionMatches('Islam','Kristen'),false);

  /* Agama kosong tetap tidak menampilkan PAI maupun PAK. */
  const kosong=siswa(session,'KOSONG',{religion:''});
  const mapelKosong=listSubjectsForStudent(session,kosong).map(item=>item.id);
  assert.equal(mapelKosong.includes('agama')||mapelKosong.includes('agama_kristen'),false);
  assert.equal(getReportCompleteness(session).students.find(row=>row.student.id===kosong.id).categories.religion,false);
});

/* ---------------------------------------------------- 13-16. Bobot dan nilai parsial */

test('13. Bobot memengaruhi nilai rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk','bindo']);
  const anak=siswa(session,'A');
  const nilai={formative:100,daily:0,practice:0,scopeSummative:0,semesterSummative:0};
  for(const [tipe,value] of Object.entries(nilai)){saveAssessmentScores(session,'mtk',tipe,{[anak.id]:value});saveAssessmentScores(session,'bindo',tipe,{[anak.id]:value});}
  saveAssessmentSettings(session,'bindo',{formative:50,daily:10,practice:10,scopeSummative:15,semesterSummative:15,kktp:75});
  assert.equal(calculateReportScore(session,'mtk',anak.id).rawScore,30,'bobot formative bawaan 30');
  assert.equal(calculateReportScore(session,'bindo',anak.id).rawScore,50,'bobot formative 50 menghasilkan nilai berbeda');
});

test('14-15. Bobot dinormalisasi untuk 1/5 sampai 5/5 komponen terisi',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentSettings(session,'mtk',{formative:40,daily:20,practice:20,scopeSummative:10,semesterSummative:10,kktp:70});
  const isi=(tipe,value)=>saveAssessmentScores(session,'mtk',tipe,{[anak.id]:value});
  const nilai=()=>+calculateReportScore(session,'mtk',anak.id).rawScore.toFixed(6);

  isi('formative',80);
  assert.equal(nilai(),80,'1/5: nilai komponen itu sendiri');
  isi('daily',90);
  assert.equal(nilai(),+((80*40+90*20)/60).toFixed(6),'2/5: (80x40 + 90x20) / (40+20)');
  isi('practice',70);
  assert.equal(nilai(),+((80*40+90*20+70*20)/80).toFixed(6),'3/5 memakai penyebut 80');
  isi('scopeSummative',60);
  assert.equal(nilai(),+((80*40+90*20+70*20+60*10)/90).toFixed(6),'4/5 memakai penyebut 90');
  isi('semesterSummative',100);
  assert.equal(nilai(),+((80*40+90*20+70*20+60*10+100*10)/100).toFixed(6),'5/5 memakai bobot penuh');
  assert.equal(calculateReportScore(session,'mtk',anak.id).completionStatus,'COMPLETE');
});

test('16. Komponen kosong tidak dianggap nol dan bobot nol tidak menghasilkan NaN',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentSettings(session,'mtk',{formative:40,daily:20,practice:20,scopeSummative:10,semesterSummative:10,kktp:70});
  saveAssessmentScores(session,'mtk','formative',{[anak.id]:80});
  saveAssessmentScores(session,'mtk','daily',{[anak.id]:90});
  const hasil=calculateReportScore(session,'mtk',anak.id);
  assert.equal(hasil.weightTotal,60,'hanya bobot komponen terisi yang menjadi penyebut');
  assert.notEqual(hasil.rawScore,(80*40+90*20)/100,'bukan dibagi total seluruh bobot');
  assert.equal(hasil.components.find(item=>item.id==='practice').score,null,'komponen kosong tetap null');

  /* Seluruh bobot komponen terisi bernilai 0: hasilnya tetap angka, bukan NaN, dan diberi peringatan. */
  saveAssessmentSettings(session,'mtk',{formative:0,daily:0,practice:0,scopeSummative:50,semesterSummative:50,kktp:70});
  const nol=calculateReportScore(session,'mtk',anak.id);
  assert.ok(Number.isFinite(nol.rawScore),'tidak menghasilkan NaN');
  assert.equal(nol.rawScore,85,'jatuh ke rata-rata polos sebagai pengaman');
  assert.equal(nol.weightValid,false);
  assert.match(nol.weightWarning,/Bobot Penilaian/);
});

/* -------------------------------------------------------------- 17-19. Performa */

test('17. Pindah mata pelajaran tidak memicu pembacaan database berlebihan',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,SUBJECTS_DEFAULT.map(item=>item.id));
  Array.from({length:12},(_,index)=>siswa(session,`S${index}`));
  ['agama','pancasila','bindo'].forEach(id=>fillAllAssessmentScores(session,id,'80'));

  const sebelum=bacaan;
  const mulai=Date.now();
  for(const subject of SUBJECTS_DEFAULT)calculateReportScore(session,subject.id,loadDb().students[Object.keys(loadDb().students)[0]].id);
  const durasi=Date.now()-mulai;
  const pembacaan=bacaan-sebelum;
  assert.ok(durasi<1500,`perpindahan 12 mapel harus cepat, terukur ${durasi} ms`);
  assert.ok(pembacaan<12*60,`pembacaan database wajar, terukur ${pembacaan}`);
  assert.match(read('src/services/storage.js'),/if\(raw===cacheRaw&&cacheDb\)return cacheDb;/,'hasil pembacaan dipakai ulang selama data belum berubah');
  assert.match(read('src/services/storage.js'),/invalidateDbCache\(\);\n  return next;/,'cache dibatalkan setiap penulisan');
});

test('18. Simpan otomatis tetap batch dalam satu commit',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk','bindo']);
  Array.from({length:10},(_,index)=>siswa(session,`B${index}`));
  fillAllAssessmentScores(session,'mtk','80');

  const mulai=Date.now();
  const saved=saveAutomaticReportScores(session,'mtk');
  assert.ok(Date.now()-mulai<1500,'simpan otomatis tidak membeku');
  assert.equal(saved.length,10);
  assert.match(read('src/services/report.js'),/updateDb\(db=>\{\n    calculations\.forEach/,'seluruh nilai ditulis dalam satu updateDb');
  /* Mapel lain tidak ikut berubah. */
  assert.equal(getStoredReportRows(session).filter(row=>row.subject.id==='bindo'&&row.score).length,0);
});

test('19. Preview rapor satu siswa tidak menghitung ulang seluruh rombel',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const daftar=Array.from({length:20},(_,index)=>siswa(session,`P${index}`));
  fillAllAssessmentScores(session,'mtk','80');
  saveAutomaticReportScores(session,'mtk');

  const mulai=Date.now();
  const dokumen=getReportDocument(session,daftar[0].id);
  assert.ok(Date.now()-mulai<800,'preview tampil langsung');
  assert.equal(dokumen.student.id,daftar[0].id);
  assert.match(read('src/services/documents.js'),/function studentCompleteness\(session,student,\{reportRows,attendance\}\)/,'kelengkapan satu siswa dihitung terpisah');
  assert.equal(/const completeness=getReportCompleteness\(session\);const summary/.test(read('src/services/documents.js')),false,'preview tidak lagi menghitung seluruh rombel');
});

/* ------------------------------------------------------------- 20. Data lama tetap utuh */

test('20. Data lama tetap utuh setelah update',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  const tanpaNis=siswa(session,'TANPA',{nis:''});
  fillAllAssessmentScores(session,'mtk','80');
  saveAutomaticReportScores(session,'mtk');
  saveExtracurricularBulk(session,{name:pramukaPresetForClass('5B'),predicate:'Baik',description:pramukaDescriptionsForClass('5B')[0]});
  saveCocurricularBulk(session,{activity:'Bakti Sosial',predicate:'Baik',description:cocurricularDescriptionsForClass('5B','Bakti Sosial')[0]});

  const db=loadDb();db.appVersion=PREVIOUS_RELEASE.version;db.appSchemaVersion=APP_SCHEMA_VERSION;
  localStorage.setItem(storageKey(),JSON.stringify(db));
  const sebelum=JSON.parse(localStorage.getItem(storageKey()));

  const hasil=runAppMigrations();
  assert.equal(hasil.migrated,false,'schema tidak berubah');
  const sesudah=loadDb();
  for(const bagian of ['students','reportScores','assessmentScores','assessmentSettings','subjectMappings','extracurricularScores','cocurricularScores','attendance','learningObjectives','transcriptScores'])
    assert.deepEqual(sesudah[bagian],sebelum[bagian],`${bagian} tidak berubah oleh update`);
  assert.equal(sesudah.students[`${session.academicYear}|${session.semester}|5B|${tanpaNis.id}`].nis,'');
  assert.deepEqual(listSubjectsForStudent(session,islam).map(item=>item.id),['agama','mtk']);
  assert.deepEqual(listSubjectsForStudent(session,kristen).map(item=>item.id),['agama_kristen','mtk']);
  assert.equal(getLeger(session).students.length,3,'seluruh siswa tetap masuk Leger');
});
