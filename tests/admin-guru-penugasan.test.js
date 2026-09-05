import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ensureSecurityBootstrap, listUserAccounts, resetTeacherPassword,
  setTeacherActive } from '../src/services/auth.js';
import { saveTeacherProfile } from '../src/services/master.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
/* Suite ini justru MENGUJI mekanisme penugasan, jadi ia memakai penyimpan Mapping yang asli:
   tidak boleh ada penugasan yang dibuat diam-diam oleh pembantu test. */
import { saveSubjectMapping } from '../src/services/storage.js';
import { listActiveSubjects, requireActiveSubject } from '../src/services/subjects.js';
import { assignedSubjectIds, assignableSubjects, assignmentScopeKey, currentTeacherScope,
  getTeacherAssignment, isSubjectAssigned, listTeacherAssignments,
  setTeacherAssignment } from '../src/services/teacher-assignments.js';
import { getAssessmentSheet, saveAssessmentScores } from '../src/services/assessment.js';

/* Admin adalah pusat kendali akun Guru.

   Aplikasi tetap cocok dipakai perorangan: satu orang boleh memegang akun Admin sebagai
   pengelola sekaligus akun Guru untuk pekerjaan kelasnya. Yang dijaga suite ini bukan jumlah
   penggunanya, melainkan siapa yang berwenang menentukan rombel dan mata pelajaran. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const TAHUN_DEPAN='2027/2028';

function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
  return nilai;
}
const admin=(academicYear=ACADEMIC_YEAR,semester=`Ganjil ${academicYear}`)=>
  ({role:'admin',academicYear,semester,userName:'Admin'});
const guru=(classId='5B',academicYear=ACADEMIC_YEAR,semester=`Ganjil ${academicYear}`)=>
  ({role:'teacher',classId,academicYear,semester});

const MAPEL=['agama','pancasila','bindo','mtk'];
function aktifkanMapel(session,ids=MAPEL){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:ids.includes(item.id),order:index+1})));
}

/* ------------------------------------------------------------------- Akun Guru (§C) */

test('1. Admin dapat membuat, mengedit, mereset, dan menonaktifkan akun Guru',async()=>{
  useMemoryStorage();
  await ensureSecurityBootstrap();
  const sesi=admin();

  const akun=await listUserAccounts(sesi);
  assert.ok(akun.length>=24,'akun Guru tersedia untuk setiap rombel');
  const lima=akun.find(item=>item.classId==='5B');
  /* Akun Guru baru sengaja NONAKTIF: lisensi yang sah membuka aplikasi untuk Admin, bukan
     untuk seluruh wali kelas sekaligus. Admin yang membukanya lewat menu ini. */
  assert.equal(lima.active,false,'akun Guru baru menunggu diaktifkan Admin');
  assert.equal(Object.hasOwn(lima,'passwordHash'),false,'hash password tidak pernah keluar dari layanan');

  /* Identitas Guru diubah Admin. */
  saveTeacherProfile(sesi,'5B',{name:'Fahmi Djawas, S.Pd.',nip:'198501012010011001',
    phone:'08123456789',email:'fahmi@contoh.sch.id',photo:''});
  assert.equal(loadDb().masterData.teachers['5B'].name,'Fahmi Djawas, S.Pd.');

  /* Reset password menghasilkan password sementara, bukan password tetap yang bisa ditebak. */
  const hasil=await resetTeacherPassword(sesi,'5B');
  assert.ok(hasil.temporaryPassword&&hasil.temporaryPassword.length>=10);
  assert.equal(loadDb().userAccounts['teacher:5B'].mustChangePassword,true);

  /* Aktif/nonaktif akun. */
  await setTeacherActive(sesi,'5B',false);
  assert.equal((await listUserAccounts(sesi)).find(item=>item.classId==='5B').active,false);
  await setTeacherActive(sesi,'5B',true);
  assert.equal((await listUserAccounts(sesi)).find(item=>item.classId==='5B').active,true);

  /* Guru tidak boleh melakukan satu pun dari itu. */
  await assert.rejects(()=>listUserAccounts(guru()),/Hanya Admin/i);
  await assert.rejects(()=>resetTeacherPassword(guru(),'5B'),/Hanya Admin/i);
  await assert.rejects(()=>setTeacherActive(guru(),'5B',false),/Hanya Admin/i);
});

/* --------------------------------------------------------------- Penugasan Admin (§C) */

test('2. Admin menentukan rombel dan mata pelajaran; penugasan tersimpan per tahun dan semester',()=>{
  useMemoryStorage();
  const sesi=admin();
  aktifkanMapel(guru());

  const tersedia=assignableSubjects(sesi,'5B');
  assert.equal(tersedia.length,MAPEL.length,'hanya mapel aktif yang dapat ditugaskan');

  const hasil=setTeacherAssignment(sesi,'5B',{subjectIds:MAPEL.slice(0,3),active:true});
  assert.deepEqual(hasil.subjectIds,MAPEL.slice(0,3));
  assert.equal(hasil.academicYear,ACADEMIC_YEAR);
  assert.equal(hasil.semester,`Ganjil ${ACADEMIC_YEAR}`);

  /* Kuncinya memuat tahun pelajaran, semester, dan rombel sekaligus. */
  assert.equal(assignmentScopeKey(sesi,'5B'),`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B`);
  assert.ok(loadDb().teacherAssignments[assignmentScopeKey(sesi,'5B')]);

  /* Semester berbeda adalah penugasan yang berbeda. */
  const genap=admin(ACADEMIC_YEAR,`Genap ${ACADEMIC_YEAR}`);
  assert.equal(getTeacherAssignment(genap,'5B'),null,'semester lain belum ditugaskan');

  const daftar=listTeacherAssignments(sesi);
  const baris=daftar.find(item=>item.classId==='5B');
  assert.equal(baris.assigned,true);
  assert.equal(baris.subjects.length,3);
  assert.equal(daftar.find(item=>item.classId==='1A').assigned,false,'rombel lain belum ditugaskan');
});

test('3. Guru tidak dapat menentukan penugasannya sendiri',()=>{
  useMemoryStorage();
  aktifkanMapel(guru());
  assert.throws(()=>setTeacherAssignment(guru(),'5B',{subjectIds:MAPEL}),/Hanya Admin/i);
  assert.throws(()=>listTeacherAssignments(guru()),/Hanya Admin/i);
  /* Halaman Guru tidak memuat satu pun jalur penulisan penugasan. */
  for(const berkas of ['src/pages/assessment.js','src/pages/objectives.js','src/pages/profile.js'])
    assert.equal(read(berkas).includes('setTeacherAssignment'),false,
      `${berkas} tidak dapat mengubah penugasan`);
});

/* ------------------------------------------------------- Penegakan hak akses (§E) */

test('4. Guru hanya dapat membuka mata pelajaran yang ditugaskan Admin',()=>{
  useMemoryStorage();
  const sesi=admin();
  const kelas=guru();
  aktifkanMapel(kelas);
  /* HARAPAN DIBALIK ATAS PERMINTAAN RESMI. Sebelum ditugaskan, Guru tidak punya satu mapel
     pun: diamnya Admin bukan izin. Dulu rombel yang belum pernah ditugaskan dibiarkan tanpa
     batas, sehingga akun AKTIF tetapi BELUM DITUGASKAN masih dapat bekerja penuh. */
  assert.equal(listActiveSubjects(kelas).length,0,'sebelum ditugaskan tidak ada akses akademik');
  assert.throws(()=>requireActiveSubject(kelas,MAPEL[0]),/belum mendapatkan penugasan/i);

  setTeacherAssignment(sesi,'5B',{subjectIds:[MAPEL[0],MAPEL[1]],active:true});
  const boleh=listActiveSubjects(kelas).map(item=>item.id);
  assert.deepEqual(boleh.sort(),[MAPEL[0],MAPEL[1]].sort(),'daftar mapel mengikuti penugasan');

  assert.equal(isSubjectAssigned(kelas,MAPEL[0]),true);
  assert.equal(isSubjectAssigned(kelas,MAPEL[2]),false);

  /* Pembatasan berlaku pada lapisan data, bukan sekadar menyembunyikan menu. */
  assert.throws(()=>requireActiveSubject(kelas,MAPEL[2]),/tidak termasuk penugasan/i);
  assert.throws(()=>getAssessmentSheet(kelas,MAPEL[2],'formative'),/tidak termasuk penugasan/i);
  assert.throws(()=>saveAssessmentScores(kelas,MAPEL[2],'formative',{}),/tidak termasuk penugasan/i);

  /* Mapel yang ditugaskan tetap dapat dikerjakan seperti biasa. */
  assert.ok(getAssessmentSheet(kelas,MAPEL[0],'formative'));

  const lingkup=currentTeacherScope(kelas);
  assert.equal(lingkup.restricted,true);
  assert.equal(lingkup.classId,'5B');
  assert.deepEqual(lingkup.subjectIds.sort(),[MAPEL[0],MAPEL[1]].sort());
});

test('5. Penugasan nonaktif menutup akses tanpa menghapus satu pun data',()=>{
  useMemoryStorage();
  const sesi=admin();
  const kelas=guru();
  aktifkanMapel(kelas);
  setTeacherAssignment(sesi,'5B',{subjectIds:MAPEL,active:true});
  const sebelum=JSON.stringify(loadDb().subjectMapping);

  setTeacherAssignment(sesi,'5B',{subjectIds:MAPEL,active:false});
  assert.deepEqual(assignedSubjectIds(kelas),[],'penugasan nonaktif menutup seluruh mapel');
  assert.equal(listActiveSubjects(kelas).length,0);
  assert.equal(JSON.stringify(loadDb().subjectMapping),sebelum,'mapping mata pelajaran tidak tersentuh');

  /* Dibuka lagi, akses kembali seperti semula. */
  setTeacherAssignment(sesi,'5B',{subjectIds:MAPEL,active:true});
  assert.equal(listActiveSubjects(kelas).length,MAPEL.length);
});

/* ------------------------------------------------ Pergantian tahun dan arsip (§G) */

test('6. Penugasan tahun berikutnya tidak menimpa arsip tahun sebelumnya',()=>{
  useMemoryStorage();
  aktifkanMapel(guru());
  setTeacherAssignment(admin(),'5B',{subjectIds:MAPEL.slice(0,2),active:true});

  /* Tahun berikutnya guru yang sama memegang 6B. */
  const berikut=admin(TAHUN_DEPAN);
  aktifkanMapel(guru('6B',TAHUN_DEPAN));
  setTeacherAssignment(berikut,'6B',{subjectIds:MAPEL.slice(1,4),active:true});

  const lama=getTeacherAssignment(admin(),'5B');
  assert.ok(lama,'penugasan tahun lama masih ada');
  assert.deepEqual(lama.subjectIds,MAPEL.slice(0,2),'isinya tidak berubah');

  const baru=getTeacherAssignment(berikut,'6B');
  assert.deepEqual(baru.subjectIds,MAPEL.slice(1,4));

  /* Keduanya hidup berdampingan sebagai record terpisah. */
  const kunci=Object.keys(loadDb().teacherAssignments);
  assert.ok(kunci.includes(`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|5B`));
  assert.ok(kunci.includes(`${TAHUN_DEPAN}|Ganjil ${TAHUN_DEPAN}|6B`));
  assert.equal(getTeacherAssignment(berikut,'5B'),null,'5B tahun depan belum ditugaskan');
});

test('7. Riwayat penugasan hanya bertambah dan tidak pernah dihapus',()=>{
  useMemoryStorage();
  const sesi=admin();
  aktifkanMapel(guru());
  setTeacherAssignment(sesi,'5B',{subjectIds:[MAPEL[0]],active:true,reason:'awal tahun'});
  setTeacherAssignment(sesi,'5B',{subjectIds:MAPEL.slice(0,3),active:true,reason:'tambah mapel'});
  const record=loadDb().teacherAssignments[assignmentScopeKey(sesi,'5B')];
  assert.equal(record.history.length,2,'kedua perubahan tercatat');
  assert.equal(record.history[0].reason,'awal tahun');
  assert.ok(record.createdAt,'waktu pembuatan pertama dipertahankan');
});

/* ------------------------------------------------------------- Menu dan halaman (§B) */

test('8. Menu Data Pengguna memuat ketiga area kendali Admin',()=>{
  const nav=read('src/data/navigation.js');
  for(const [id,label] of [['teacher-assignments','Akun Guru & Penugasan'],
    ['teacher-readiness','Kesiapan Guru'],['teacher-access','Hak Akses Guru']]){
    assert.ok(nav.includes(`item('${id}','${label}'`),`menu ${label} tersedia`);
  }
  /* Ketiganya hanya untuk Admin. */
  const admin=nav.slice(nav.indexOf('admin:Object.freeze'),nav.indexOf('teacher:Object.freeze'));
  const guruNav=nav.slice(nav.indexOf('teacher:Object.freeze'));
  for(const id of ['teacher-assignments','teacher-readiness','teacher-access']){
    assert.ok(admin.includes(id),`${id} ada pada menu Admin`);
    assert.equal(guruNav.includes(id),false,`${id} tidak muncul pada menu Guru`);
  }
  const app=read('src/app.js');
  for(const [route,section] of [['teacher-assignments','assignments'],
    ['teacher-readiness','readiness'],['teacher-access','access']])
    assert.ok(app.includes(`case '${route}': return renderUsers(session,'${section}');`),
      `route ${route} terhubung`);
  const halaman=read('src/pages/users.js');
  for(const bagian of ['assignments','readiness','access'])
    assert.match(halaman,new RegExp(`${bagian}:\\{title:`),`bagian ${bagian} punya judul`);
  assert.match(halaman,/AKTIFKAN e-RAPOR UNTUK GURU/,'aksi utama kesiapan tersedia');
  /* Admin memantau, bukan menggantikan pekerjaan Guru. */
  assert.equal(halaman.includes('saveAssessmentScores'),false,'Admin tidak menulis nilai Guru');
});
