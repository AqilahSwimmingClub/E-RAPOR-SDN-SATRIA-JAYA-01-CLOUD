import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, CLASSES, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { cpBerlaku } from '../src/data/curriculum-cp.js';
import { phaseForClassId } from '../src/data/learning-objective-defaults.js';
import {
  assignableSubjects, clearTeacherAssignment, getTeacherAssignment, listTeacherAssignments,
  PESAN_BELUM_DITUGASKAN, PESAN_DI_LUAR_PENUGASAN, setTeacherAssignment,
} from '../src/services/teacher-assignments.js';
import { listActiveSubjects, requireActiveSubject } from '../src/services/subjects.js';
import { getAssessmentSettings, getAssessmentSheet, saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { createStudent } from '../src/services/students.js';
import { saveAttendance } from '../src/services/attendance.js';
import { ATTITUDE_DIMENSIONS, ATTITUDE_LEVELS, saveStudentAttitude } from '../src/services/attitudes.js';
import { saveSubjectMapping } from '../src/services/storage.js';
import { createCpButir, listCpButir, setCpButirActive } from '../src/services/cp-butir.js';
import { composeIntracurricularDescriptionFromCp, PESAN_BUTIR_WAJIB, saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { DEFAULT_REPORT_RUBRIC, categoryForScore } from '../src/services/report-rubric.js';
import { getAdminReadiness } from '../src/services/admin-readiness.js';
import { ensureSecurityBootstrap, setTeacherActive } from '../src/services/auth.js';
import { saveTeacherProfile } from '../src/services/master.js';
import { loadDb } from '../src/services/storage.js';

/* SINKRONISASI ADMIN → GURU.

   Satu kalimat yang diuji berulang kali di berkas ini: ADMIN ADALAH SUMBER OTORISASI.
   Akun menentukan boleh tidaknya MASUK; penugasan menentukan boleh tidaknya BEKERJA. Diamnya
   Admin bukan izin, dan mencabut izin tidak pernah menghapus data.

   Seluruh test menyusun mapel dan rombelnya dari data aplikasi - CLASSES, SUBJECTS_DEFAULT,
   katalog fase CP - bukan dari nama yang diketik. Tidak ada "Guru5B", "Fahmi", "Matematika",
   atau "IPAS" yang dijadikan syarat lulus: yang dipakai hanyalah "mapel pertama" dan "mapel
   kedua" yang berlaku pada rombel yang sedang diuji. */

function useMemoryStorage(){
  const values=new Map();
  const buat=()=>({getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),clear:()=>values.clear()});
  globalThis.localStorage=buat();globalThis.sessionStorage=buat();
}

const SEMESTER=`Ganjil ${ACADEMIC_YEAR}`;
const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:SEMESTER,userName:'Admin Sekolah'};
const guru=classId=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:SEMESTER});

/* Rombel contoh diambil dari daftar rombel aplikasi, bukan ditulis tangan. */
const KELAS_RENDAH=CLASSES.filter(id=>Number(id[0])<=3);
const KELAS_TINGGI=CLASSES.filter(id=>Number(id[0])>=4);
const kelasUji=KELAS_TINGGI[0];

/* Mapel yang benar-benar berlaku pada satu rombel menurut katalog fase CP aplikasi. */
function mapelBerlaku(classId){
  const phase=phaseForClassId(classId);
  return SUBJECTS_DEFAULT.filter(item=>!phase||cpBerlaku(item.id,phase)).map(item=>item.id);
}
function aktifkanSeluruhMapping(classId){
  saveSubjectMapping(guru(classId),SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
}
function butirPertama(session,subjectId){
  const butir=listCpButir(session,subjectId,{activeOnly:true});
  return butir.length?butir[0]:createCpButir(session,subjectId,{description:'memahami konsep dasar pembelajaran'});
}
function tambahSiswa(session,index=1){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`77${String(index).padStart(8,'0')}`,religion:'Islam',name:`Siswa Uji ${index}`,
    gender:index%2?'L':'P',photo:''});
}

/* Keadaan awal yang dipakai hampir seluruh test: Mapping lengkap, satu siswa, dan penugasan
   yang isinya ditentukan pemanggil. */
function siapkan(classId=kelasUji,{tugaskan=null}={}){
  useMemoryStorage();
  aktifkanSeluruhMapping(classId);
  const berlaku=mapelBerlaku(classId);
  const daftar=tugaskan===null?berlaku:tugaskan;
  if(daftar.length)setTeacherAssignment(admin,classId,{subjectIds:daftar,active:true});
  const sesi=guru(classId);
  return {sesi,berlaku,ditugaskan:daftar};
}

test('1. Akun aktif tetapi belum ditugaskan tidak punya satu pun akses akademik',()=>{
  useMemoryStorage();
  aktifkanSeluruhMapping(kelasUji);
  const sesi=guru(kelasUji);
  /* Belum ada catatan penugasan sama sekali: Admin belum menentukan apa pun. */
  assert.equal(getTeacherAssignment(admin,kelasUji),null);
  assert.deepEqual(listActiveSubjects(sesi),[]);
  const mapel=mapelBerlaku(kelasUji)[0];
  assert.throws(()=>requireActiveSubject(sesi,mapel),new RegExp(PESAN_BELUM_DITUGASKAN.slice(0,30)));
  assert.throws(()=>getAssessmentSettings(sesi,mapel),/belum mendapatkan penugasan/i);
});

test('2. Akun aktif dan ditugaskan satu mapel dapat mengerjakan mapel itu',()=>{
  const {sesi,berlaku}=siapkan(kelasUji,{tugaskan:[]});
  const mapel=berlaku[0];
  setTeacherAssignment(admin,kelasUji,{subjectIds:[mapel],active:true});
  assert.deepEqual(listActiveSubjects(sesi).map(item=>item.id),[mapel]);
  assert.equal(requireActiveSubject(sesi,mapel).id,mapel);
  const siswa=tambahSiswa(sesi);
  assert.doesNotThrow(()=>saveAssessmentScores(sesi,mapel,'formative',{[siswa.id]:85}));
  assert.equal(getAssessmentSheet(sesi,mapel,'formative').rows[0].score,85);
});

test('3. Ditugaskan hanya satu mapel: mapel lain yang aktif pada Mapping tetap ditolak',()=>{
  const {sesi,berlaku}=siapkan(kelasUji,{tugaskan:[]});
  const [pertama,kedua]=berlaku;
  setTeacherAssignment(admin,kelasUji,{subjectIds:[pertama],active:true});
  assert.equal(listActiveSubjects(sesi).some(item=>item.id===kedua),false);
  assert.throws(()=>requireActiveSubject(sesi,kedua),new RegExp(PESAN_DI_LUAR_PENUGASAN.slice(0,30)));
  assert.throws(()=>getAssessmentSettings(sesi,kedua),/tidak termasuk penugasan/i);
});

test('4. Memanipulasi subjectId ke mapel yang tidak ditugaskan ditolak di lapisan layanan',()=>{
  const {sesi,berlaku}=siapkan(kelasUji,{tugaskan:[]});
  const [pertama,kedua]=berlaku;
  setTeacherAssignment(admin,kelasUji,{subjectIds:[pertama],active:true});
  const siswa=tambahSiswa(sesi);
  /* Menyembunyikan menu saja tidak cukup: panggilan langsung ke layanan pun harus ditolak,
     apa pun jalan masuknya - URL, state halaman, atau pemanggilan modul. */
  assert.throws(()=>saveAssessmentScores(sesi,kedua,'formative',{[siswa.id]:90}),/tidak termasuk penugasan/i);
  assert.throws(()=>saveAssessmentSettings(sesi,kedua,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75}),/tidak termasuk penugasan/i);
  assert.throws(()=>listCpButir(sesi,kedua),/tidak termasuk penugasan/i);
});

test('5. Admin menambah penugasan: akses Guru ikut bertambah tanpa langkah lain',()=>{
  const {sesi,berlaku}=siapkan(kelasUji,{tugaskan:[]});
  const [pertama,kedua]=berlaku;
  setTeacherAssignment(admin,kelasUji,{subjectIds:[pertama],active:true});
  assert.equal(listActiveSubjects(sesi).length,1);
  setTeacherAssignment(admin,kelasUji,{subjectIds:[pertama,kedua],active:true});
  assert.deepEqual(listActiveSubjects(sesi).map(item=>item.id).sort(),[pertama,kedua].sort());
  assert.equal(requireActiveSubject(sesi,kedua).id,kedua);
});

test('6. Admin mencabut penugasan: akses Guru langsung hilang',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  assert.ok(listActiveSubjects(sesi).length>0);
  clearTeacherAssignment(admin,kelasUji,{reason:'guru pindah tugas'});
  assert.deepEqual(listActiveSubjects(sesi),[]);
  assert.throws(()=>requireActiveSubject(sesi,berlaku[0]),/belum mendapatkan penugasan/i);
});

test('7. Pencabutan penugasan tidak menghapus satu pun data yang sudah tersimpan',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  const siswa=tambahSiswa(sesi);
  /* Sekolah diisi selengkap mungkin lebih dulu: nilai, absensi, sikap, intrakurikuler, dan
     pengaturan penilaian beserta KKTP dan rubriknya. */
  saveAssessmentSettings(sesi,mapel,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:74});
  saveAssessmentScores(sesi,mapel,'formative',{[siswa.id]:82});
  saveAttendance(sesi,'2026-08-10',{[siswa.id]:'Hadir'});
  saveStudentAttitude(sesi,siswa.id,ATTITUDE_DIMENSIONS[0].id,{level:ATTITUDE_LEVELS[0]});
  const butir=butirPertama(sesi,mapel);
  saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:mapel,butirIds:[butir.id],
    jenis:'teori',predicate:'Baik'});

  /* Seluruh isi database difoto, KECUALI koleksi penugasan itu sendiri - satu-satunya yang
     memang berubah. Perbandingannya menyeluruh, jadi tidak ada koleksi yang lolos tanpa
     diperiksa: siswa, absensi, nilai, sikap, kegiatan, rapor, CP, bobot, dan lisensi. */
  const potret=()=>{const db=loadDb();
    /* Dua hal yang memang BOLEH berubah: koleksi penugasan itu sendiri, dan stempel waktu
       terakhir database disentuh. Selebihnya wajib sama persis. */
    delete db.teacherAssignments;delete db.updatedAt;return JSON.stringify(db);};
  const sebelum=potret();
  clearTeacherAssignment(admin,kelasUji,{reason:'uji pencabutan'});
  assert.equal(potret(),sebelum,'mencabut hak akses tidak mengubah satu byte pun data lain');
});

test('8. Menugaskan kembali membuka data lama apa adanya',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  const siswa=tambahSiswa(sesi);
  saveAssessmentScores(sesi,mapel,'formative',{[siswa.id]:82});
  clearTeacherAssignment(admin,kelasUji,{reason:'uji'});
  assert.throws(()=>getAssessmentSheet(sesi,mapel,'formative'),/belum mendapatkan penugasan/i);
  setTeacherAssignment(admin,kelasUji,{subjectIds:[mapel],active:true});
  assert.equal(getAssessmentSheet(sesi,mapel,'formative').rows[0].score,82);
});

test('9. Akun Guru yang dinonaktifkan tidak dapat masuk meskipun penugasannya ada',async()=>{
  const {sesi}=siapkan(kelasUji);
  await ensureSecurityBootstrap();
  await setTeacherActive(admin,kelasUji,true);
  assert.equal(loadDb().userAccounts[`teacher:${kelasUji}`].active,true);
  await setTeacherActive(admin,kelasUji,false);
  assert.equal(loadDb().userAccounts[`teacher:${kelasUji}`].active,false);
  /* Status akun dan status penugasan adalah dua hal berbeda: penugasannya tetap utuh. */
  assert.equal(getTeacherAssignment(admin,sesi.classId).active,true);
});

test('10. Mapel yang tidak berlaku pada Mapping rombel tidak dapat ditugaskan',()=>{
  useMemoryStorage();
  const berlaku=mapelBerlaku(kelasUji);
  const [pertama,kedua]=berlaku;
  /* Admin menonaktifkan satu mapel pada Mapping rombel ini. */
  saveSubjectMapping(guru(kelasUji),SUBJECTS_DEFAULT.map(item=>({...item,active:item.id!==kedua})));
  assert.equal(assignableSubjects(admin,kelasUji).some(item=>item.id===kedua),false);
  const hasil=setTeacherAssignment(admin,kelasUji,{subjectIds:[pertama,kedua],active:true});
  assert.deepEqual(hasil.subjectIds,[pertama]);
});

test('11. Kelas rendah: mapel yang belum berlaku pada fasenya tidak dapat ditugaskan',()=>{
  const kelas=KELAS_RENDAH[0];
  useMemoryStorage();
  aktifkanSeluruhMapping(kelas);
  const berlaku=new Set(mapelBerlaku(kelas));
  const diluar=SUBJECTS_DEFAULT.map(item=>item.id).filter(id=>!berlaku.has(id));
  assert.ok(diluar.length>0,'katalog fase memang membedakan kelas rendah dari kelas tinggi');
  const tersedia=assignableSubjects(admin,kelas).map(item=>item.id);
  for(const id of diluar)assert.equal(tersedia.includes(id),false,`${id} belum berlaku di ${kelas}`);
  const hasil=setTeacherAssignment(admin,kelas,{subjectIds:SUBJECTS_DEFAULT.map(item=>item.id),active:true});
  for(const id of diluar)assert.equal(hasil.subjectIds.includes(id),false);
});

test('12. Kelas tinggi: seluruh mapel aktif pada Mapping dapat ditugaskan',()=>{
  const kelas=KELAS_TINGGI[0];
  useMemoryStorage();
  aktifkanSeluruhMapping(kelas);
  const berlaku=mapelBerlaku(kelas);
  const tersedia=assignableSubjects(admin,kelas).map(item=>item.id);
  assert.deepEqual([...tersedia].sort(),[...berlaku].sort());
  const hasil=setTeacherAssignment(admin,kelas,{subjectIds:berlaku,active:true});
  assert.deepEqual([...hasil.subjectIds].sort(),[...berlaku].sort());
});

test('13. Pembelajaran/CP tidak otomatis terbuka untuk seluruh mapel aktif',()=>{
  const {sesi,berlaku}=siapkan(kelasUji,{tugaskan:[]});
  const [pertama,kedua]=berlaku;
  setTeacherAssignment(admin,kelasUji,{subjectIds:[pertama],active:true});
  /* Mapping-nya aktif untuk semua mapel, tetapi hak kerjanya hanya satu. */
  assert.equal(assignableSubjects(admin,kelasUji).length,berlaku.length);
  assert.deepEqual(listActiveSubjects(sesi).map(item=>item.id),[pertama]);
  assert.doesNotThrow(()=>listCpButir(sesi,pertama));
  assert.throws(()=>listCpButir(sesi,kedua),/tidak termasuk penugasan/i);
});

test('14. Kesiapan Guru melaporkan penugasan yang belum lengkap sebagai penghalang',()=>{
  useMemoryStorage();
  aktifkanSeluruhMapping(kelasUji);
  saveTeacherProfile(admin,kelasUji,{name:'Wali Kelas Uji',nip:'198001012005011001',
    phone:'08',email:'w@contoh.sch.id',photo:''});
  const sebelum=getAdminReadiness(admin);
  const butir=sebelum.items.find(item=>item.id==='teacher-assignments');
  assert.equal(butir.done,false);
  assert.equal(sebelum.ready,false);
  assert.ok(sebelum.missing.includes('Penugasan Guru'));
  setTeacherAssignment(admin,kelasUji,{subjectIds:mapelBerlaku(kelasUji),active:true});
  assert.equal(getAdminReadiness(admin).items.find(item=>item.id==='teacher-assignments').done,true);
});

test('15. Perubahan KKTP terbaca apa adanya oleh Guru pada mapel yang ditugaskan',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  saveAssessmentSettings(sesi,mapel,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:70});
  assert.equal(getAssessmentSettings(sesi,mapel).kktp,70);
  saveAssessmentSettings(sesi,mapel,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:78});
  assert.equal(getAssessmentSettings(sesi,mapel).kktp,78);
});

test('16. Perubahan bobot penilaian terbaca apa adanya oleh Guru',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  saveAssessmentSettings(sesi,mapel,{formative:40,daily:15,practice:15,
    scopeSummative:15,semesterSummative:15,kktp:75});
  const tersimpan=getAssessmentSettings(sesi,mapel);
  assert.equal(tersimpan.formative,40);
  assert.equal(tersimpan.formative+tersimpan.daily+tersimpan.practice
    +tersimpan.scopeSummative+tersimpan.semesterSummative,100);
});

test('17. Perubahan rubrik kategori terbaca apa adanya oleh Guru',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  const rubrik=[{category:'SANGAT BAIK',min:88,max:100},{category:'BAIK',min:78,max:87},
    {category:'CUKUP',min:68,max:77},{category:'PERLU BIMBINGAN',min:0,max:67}];
  saveAssessmentSettings(sesi,mapel,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:68,rubric:rubrik});
  const tersimpan=getAssessmentSettings(sesi,mapel).rubric;
  assert.deepEqual(tersimpan.map(item=>[item.category,item.min,item.max]),
    rubrik.map(item=>[item.category,item.min,item.max]));
  assert.equal(categoryForScore(88,tersimpan),'SANGAT BAIK');
  assert.equal(categoryForScore(88,DEFAULT_REPORT_RUBRIC),'BAIK');
});

test('18. Perubahan status aktif Butir CP terbaca apa adanya oleh Guru',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  const butir=butirPertama(sesi,mapel);
  assert.equal(listCpButir(sesi,mapel,{activeOnly:true}).some(item=>item.id===butir.id),true);
  setCpButirActive(sesi,mapel,butir.id,false);
  assert.equal(listCpButir(sesi,mapel,{activeOnly:true}).some(item=>item.id===butir.id),false);
  setCpButirActive(sesi,mapel,butir.id,true);
  assert.equal(listCpButir(sesi,mapel,{activeOnly:true}).some(item=>item.id===butir.id),true);
});

test('19. Seluruh rombel 1A sampai 6D mengikuti aturan yang sama, diuji satu per satu',()=>{
  for(const classId of CLASSES){
    useMemoryStorage();
    aktifkanSeluruhMapping(classId);
    const sesi=guru(classId);
    /* Belum ditugaskan: tidak ada satu mapel pun. */
    assert.deepEqual(listActiveSubjects(sesi),[],`${classId} belum ditugaskan`);
    const berlaku=mapelBerlaku(classId);
    assert.ok(berlaku.length>0,`${classId} punya mapel yang berlaku`);
    setTeacherAssignment(admin,classId,{subjectIds:[berlaku[0]],active:true});
    assert.deepEqual(listActiveSubjects(sesi).map(item=>item.id),[berlaku[0]],`${classId} sesudah ditugaskan`);
    if(berlaku.length>1)
      assert.throws(()=>requireActiveSubject(sesi,berlaku[1]),/tidak termasuk penugasan/i,`${classId} mapel lain ditolak`);
  }
});

test('20. Aturan penugasan tidak bergantung pada nama guru atau nama mapel tertentu',()=>{
  /* Berkas layanan tidak boleh menyebut satu pun contoh yang dipakai saat pengembangan. */
  const sumber=[
    'src/services/teacher-assignments.js','src/services/subjects.js','src/app.js',
  ];
  for(const berkas of sumber){
    const isi=readFileSync(new URL(`../${berkas}`,import.meta.url),'utf8');
    for(const contoh of ['Guru5B','Fahmi'])
      assert.equal(isi.includes(contoh),false,`${berkas} tidak menyebut ${contoh}`);
    /* Nama mapel tidak boleh menjadi syarat: id mapel apa pun diperlakukan sama. */
    for(const id of ['mtk','ipas'])
      assert.equal(new RegExp(`['"\`]${id}['"\`]`).test(isi),false,`${berkas} tidak mengunci id ${id}`);
  }
  /* Daftar penugasan pun disusun dari CLASSES, bukan dari daftar yang diketik. */
  useMemoryStorage();
  assert.deepEqual(listTeacherAssignments(admin).map(row=>row.classId),[...CLASSES]);
});

test('21. Intrakurikuler tanpa satu pun Butir CP dipilih ditolak',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  butirPertama(sesi,mapel);
  const siswa=tambahSiswa(sesi);
  assert.throws(()=>composeIntracurricularDescriptionFromCp(sesi,{studentName:siswa.name,
    subjectId:mapel,butirIds:[],jenis:'teori',predicate:'Baik'}),new RegExp(PESAN_BUTIR_WAJIB));
  assert.throws(()=>saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:mapel,
    butirIds:[],jenis:'teori',predicate:'Baik'}),new RegExp(PESAN_BUTIR_WAJIB));
});

test('22. Intrakurikuler dengan minimal satu Butir CP aktif berhasil',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  const butir=butirPertama(sesi,mapel);
  const siswa=tambahSiswa(sesi);
  const deskripsi=composeIntracurricularDescriptionFromCp(sesi,{studentName:siswa.name,
    subjectId:mapel,butirIds:[butir.id],jenis:'teori',predicate:'Baik'});
  assert.ok(deskripsi.startsWith(`Ananda ${siswa.name}`),deskripsi);
  const tersimpan=saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:mapel,
    butirIds:[butir.id],jenis:'teori',predicate:'Baik',description:deskripsi});
  assert.deepEqual(tersimpan.butirIds,[butir.id]);
});

test('23. Butir CP yang dinonaktifkan tidak dapat dipakai menilai',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  const butir=butirPertama(sesi,mapel);
  const siswa=tambahSiswa(sesi);
  setCpButirActive(sesi,mapel,butir.id,false);
  assert.throws(()=>composeIntracurricularDescriptionFromCp(sesi,{studentName:siswa.name,
    subjectId:mapel,butirIds:[butir.id],jenis:'teori',predicate:'Baik'}),new RegExp(PESAN_BUTIR_WAJIB));
  assert.throws(()=>saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:mapel,
    butirIds:[butir.id],jenis:'teori',predicate:'Baik'}),new RegExp(PESAN_BUTIR_WAJIB));
});

test('24. Tujuan Pembelajaran legacy tidak pernah menjadi fallback Intrakurikuler',()=>{
  const {sesi,berlaku}=siapkan(kelasUji);
  const mapel=berlaku[0];
  const siswa=tambahSiswa(sesi);
  /* TP lama boleh tetap tersimpan; ia hanya tidak boleh dipakai. */
  const tp=createLearningObjective(sesi,mapel,{code:'TP-LAMA-1',description:'memahami konsep lama.'});
  assert.ok(tp.id);
  /* Seluruh Butir CP dinonaktifkan: yang tersisa hanya TP legacy. Hasilnya tetap penolakan,
     bukan diam-diam memakai TP. */
  for(const item of listCpButir(sesi,mapel,{activeOnly:true}))setCpButirActive(sesi,mapel,item.id,false);
  assert.throws(()=>composeIntracurricularDescriptionFromCp(sesi,{studentName:siswa.name,
    subjectId:mapel,butirIds:[tp.id],jenis:'teori',predicate:'Baik'}),/Butir CP/i);
  assert.throws(()=>saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:mapel,
    butirIds:[tp.id],jenis:'teori',predicate:'Baik'}),/Butir CP/i);
});

test('25. Riwayat penugasan hanya bertambah sehingga jejak Admin tidak pernah hilang',()=>{
  const {berlaku}=siapkan(kelasUji,{tugaskan:[]});
  setTeacherAssignment(admin,kelasUji,{subjectIds:[berlaku[0]],active:true,reason:'awal tahun'});
  setTeacherAssignment(admin,kelasUji,{subjectIds:berlaku,active:true,reason:'tambah mapel'});
  clearTeacherAssignment(admin,kelasUji,{reason:'guru cuti'});
  const record=getTeacherAssignment(admin,kelasUji);
  assert.equal(record.history.length,3);
  assert.deepEqual(record.history.map(item=>item.reason),['awal tahun','tambah mapel','guru cuti']);
  assert.deepEqual(record.subjectIds,[]);
  assert.equal(record.active,false);
});
