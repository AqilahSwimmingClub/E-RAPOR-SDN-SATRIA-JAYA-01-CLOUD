import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { canAccessRoute, resolveRoute } from '../src/core/router.js';
import { cpNaskahGaps } from '../src/data/curriculum-cp.js';
import { flattenNavigation, navigationForRole } from '../src/data/navigation.js';
import { getAdminReadiness } from '../src/services/admin-readiness.js';
import { ensureSecurityBootstrap } from '../src/services/auth.js';
import { listActiveSubjects, requireActiveSubject } from '../src/services/subjects.js';
import { assignedSubjectIds, setTeacherAssignment } from '../src/services/teacher-assignments.js';
import { addReferenceObjectives, listReferenceObjectives } from '../src/services/learning-objectives.js';
import { saveTeacherProfile } from '../src/services/master.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* SATU fungsi, SATU pemilik.

   Admin memegang konfigurasi sistem, data master, akun dan penugasan Guru, monitoring,
   Dapodik, transkrip, backup, dan pembaruan. Guru memegang pekerjaan operasional rombelnya.
   Menu yang menduplikasi dihapus — layanan dan datanya tidak. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const rute=role=>flattenNavigation(role).map(item=>item.route);
const label=role=>flattenNavigation(role).map(item=>item.label);

function useMemoryStorage(){
  const nilai=new Map();
  globalThis.localStorage={getItem:k=>nilai.has(k)?nilai.get(k):null,
    setItem:(k,v)=>nilai.set(k,String(v)),removeItem:k=>nilai.delete(k),clear:()=>nilai.clear()};
  invalidateDbCache();
}
const admin=()=>({role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`,userName:'Admin'});
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,
  semester:`Ganjil ${ACADEMIC_YEAR}`});

/* --------------------------------------------------------------- Menu Admin (§C, §D) */

test('1. Admin tidak lagi memiliki menu operasional milik Guru',()=>{
  const menu=rute('admin');
  /* Cetak rapor operasional. */
  for(const route of ['print-report','print-ledger','print-supplement'])
    assert.equal(menu.includes(route),false,`Admin tidak punya menu ${route}`);
  assert.equal(navigationForRole('admin').some(group=>/cetak/i.test(group.label)),false,
    'grup Cetak Nilai Admin dihapus');
  /* Input kegiatan. */
  for(const route of ['intracurricular','cocurricular','intracurricular-input',
    'cocurricular-input','extra-input'])
    assert.equal(menu.includes(route),false,`Admin tidak punya menu ${route}`);
  assert.equal(navigationForRole('admin').some(group=>group.id==='activities'),false,
    'grup KEGIATAN Admin dihapus');
  /* Menu Data Pengguna lama sudah tidak ada. */
  assert.equal(menu.includes('users'),false,'menu Data Pengguna lama dihapus');
  assert.equal(label('admin').includes('Data Pengguna'),false);
});

test('2. Admin tetap memegang seluruh fungsi sistem',()=>{
  const menu=rute('admin');
  for(const route of [
    'dashboard','profile',
    'dapodik-service','dapodik-pull','dapodik-push',
    'teacher-assignments','teacher-readiness','teacher-access',
    'reference-school','reference-teachers','reference-students','student-handover',
    'reference-classes','reference-subjects','reference-learning','reference-mapping',
    'assessment-status','assessment-statistics','admin-progress','admin-progress-graph',
    'transcript-number-import','transcript-settings','transcript-mapping',
    'transcript-input','transcript-import','transcript-print',
    'backup','account-settings','about-updates',
  ]) assert.ok(menu.includes(route),`Admin memiliki ${route}`);
  const grup=navigationForRole('admin').map(item=>item.label);
  assert.deepEqual(grup,['UTAMA','DAPODIK','DATA PENGGUNA','DATA REFERENSI','MONITORING',
    'TRANSKRIP IJAZAH','BACKUP & RESTORE','AKUN']);
});

/* --------------------------------------------------------------- Menu Guru (§F) */

test('3. Guru memegang seluruh pekerjaan kelasnya',()=>{
  const menu=rute('teacher');
  for(const route of [
    'dashboard','profile','student-update','student-handover',
    'objectives','weights','assessment','attitudes',
    'intracurricular-input','cocurricular-input','extra-input',
    'attendance',
    'report-input','report-import','homeroom-note','promotion-input',
    'print-report','print-ledger','print-supplement',
    'account-settings',
  ]) assert.ok(menu.includes(route),`Guru memiliki ${route}`);
  const grup=navigationForRole('teacher').map(item=>item.label);
  assert.deepEqual(grup,['UTAMA','DATA KELAS','PEMBELAJARAN','KEGIATAN','KEHADIRAN',
    'RAPOR','AKUN']);
  /* KKTP dan Penilaian memakai halaman yang sudah ada, bukan halaman baru. */
  assert.ok(label('teacher').includes('KKTP'));
  assert.ok(label('teacher').includes('Tujuan Pembelajaran'));
});

test('4. Guru tidak memiliki fungsi sistem milik Admin',()=>{
  const menu=rute('teacher');
  for(const route of [
    'dapodik-service','dapodik-pull','dapodik-push',
    'teacher-assignments','teacher-readiness','teacher-access',
    'assessment-status','assessment-statistics','admin-progress','admin-progress-graph',
    'backup','about-updates',
    'transcript-input','transcript-import','transcript-print',
    'reference-school','reference-subjects','reference-mapping','reference-classes',
  ]) assert.equal(menu.includes(route),false,`Guru tidak punya ${route}`);
  /* Route-nya ikut tertutup, bukan sekadar menunya disembunyikan. */
  for(const route of ['dapodik-pull','teacher-assignments','backup','reference-mapping']){
    assert.equal(canAccessRoute(route,'teacher'),false,`${route} tertutup bagi Guru`);
    assert.equal(resolveRoute(route,guru()),'dashboard',`${route} mengembalikan Guru ke Dashboard`);
  }
});

test('5. Tidak ada route yang dimiliki dua peran untuk pekerjaan yang sama',()=>{
  const bersama=rute('admin').filter(route=>rute('teacher').includes(route));
  /* Yang boleh sama hanyalah identitas akun masing-masing dan dashboard perannya. */
  assert.deepEqual([...bersama].sort(),
    ['account-settings','dashboard','profile','student-handover'].sort(),
    'hanya Dashboard, Profil, Pengaturan Akun, dan Serah Terima Siswa yang tersedia di dua peran');
  for(const role of ['admin','teacher']){
    const daftar=rute(role);
    assert.equal(new Set(daftar).size,daftar.length,`route ${role} tidak ganda`);
  }
});

/* ------------------------------------------------ Halaman dan layanan tetap utuh (§S) */

test('6. Menghapus menu tidak menghapus halaman maupun layanan',()=>{
  const app=read('src/app.js');
  for(const route of ['intracurricular','cocurricular','print-report','print-ledger','print-supplement'])
    assert.match(app,new RegExp(`case '${route}':`),`route ${route} tetap terdaftar`);
  for(const berkas of ['src/pages/intracurricular.js','src/pages/cocurricular.js',
    'src/pages/print.js','src/services/intracurricular.js','src/services/cocurricular.js'])
    assert.ok(read(berkas).length>0,`${berkas} tidak dihapus`);
});

/* ------------------------------------ Akun Guru & Penugasan menyerap menu lama (§E, §H) */

test('7. Akun Guru & Penugasan memuat seluruh fungsi akun yang dulu terpisah',()=>{
  const halaman=read('src/pages/users.js');
  for(const fungsi of ['resetTeacherPassword','setTeacherActive','saveTeacherProfile',
    'setTeacherAssignment','listTeacherAssignments'])
    assert.match(halaman,new RegExp(fungsi),`fungsi ${fungsi} tersedia di halaman ini`);
  for(const tombol of ['Ubah Penugasan','Edit Identitas','Reset Password','Nonaktifkan'])
    assert.ok(halaman.includes(tombol),`aksi ${tombol} tersedia`);
  assert.match(halaman,/<th>Username<\/th>/,'username akun terlihat');
  /* Bagian Data Pengguna lama sudah tidak ada, dan tidak ada dua form identitas bernama sama. */
  assert.equal(/users:\{title:'Data Pengguna'/.test(halaman),false);
  assert.equal(halaman.includes('function openTeacherForm('),false,
    'tidak ada dua fungsi bernama sama yang saling menimpa');
  assert.match(halaman,/function openAccountIdentityForm\(/);
  assert.match(halaman,/function openReferenceTeacherForm\(/);
});

/* --------------------------------------------------------- Kesiapan Guru nyata (§I) */

test('8. Kesiapan Guru menyebut penyebab yang konkret, bukan checklist tetap',async()=>{
  useMemoryStorage();
  await ensureSecurityBootstrap();
  const sesi=admin();
  const kelas=guru('5B');
  /* Rombel dianggap dipakai setelah Admin mengisi identitas wali kelasnya. */
  saveTeacherProfile(sesi,'5B',{name:'Fahmi Djawas, S.Pd.',nip:'198501012010011001',
    phone:'08',email:'f@contoh.sch.id',photo:''});
  saveSubjectMapping(kelas,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:['mtk','ipas'].includes(item.id),order:index+1})));

  const kesiapan=getAdminReadiness(sesi);
  assert.equal(kesiapan.ready,false);
  assert.ok(Array.isArray(kesiapan.blockers)&&kesiapan.blockers.length>0,
    'penyebab belum siap tersedia sebagai daftar');
  /* Penyebabnya menyebut mata pelajaran dan rombel yang benar-benar kurang. */
  const teks=kesiapan.blockers.join(' | ');
  assert.ok(kesiapan.blockers.some(item=>/^TP .+ 5B$/.test(item)),
    'menyebut TP mapel dan rombelnya');
  assert.ok(kesiapan.blockers.some(item=>/^KKTP .+ 5B$/.test(item)),
    'menyebut KKTP mapel dan rombelnya');
  assert.ok(teks.length>0);
  /* Alasannya ikut pada butir checklist, bukan kalimat tetap. */
  const butirTP=kesiapan.items.find(item=>item.id==='learning-objectives');
  assert.ok(butirTP.detail.length>0&&butirTP.reason.includes('Belum siap:'));
  const halaman=read('src/pages/users.js');
  assert.match(halaman,/BELUM SIAP/,'status BELUM SIAP tampil di layar');
  assert.match(halaman,/kesiapan\.blockers/,'penyebabnya ikut ditampilkan');
});

/* ------------------------------------------------- Hak akses mengikuti penugasan (§G, §J) */

test('9. Akses Guru mengikuti penugasan Admin dan perubahannya langsung berlaku',()=>{
  useMemoryStorage();
  const sesi=admin();
  const kelas=guru('5B');
  saveSubjectMapping(kelas,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:['mtk','ipas','bindo'].includes(item.id),order:index+1})));

  setTeacherAssignment(sesi,'5B',{subjectIds:['mtk','ipas'],active:true});
  assert.deepEqual(listActiveSubjects(kelas).map(item=>item.id).sort(),['ipas','mtk']);
  assert.ok(requireActiveSubject(kelas,'mtk'));
  assert.throws(()=>requireActiveSubject(kelas,'bindo'),/tidak termasuk penugasan/i);

  /* Admin mempersempit menjadi IPAS saja: akses Guru langsung mengikuti. */
  setTeacherAssignment(sesi,'5B',{subjectIds:['ipas'],active:true});
  assert.deepEqual(listActiveSubjects(kelas).map(item=>item.id),['ipas']);
  assert.throws(()=>requireActiveSubject(kelas,'mtk'),/tidak termasuk penugasan/i);

  /* Mapping mata pelajaran — datanya — tidak ikut terhapus. */
  const mapping=loadDb().subjectMappings;
  assert.ok(JSON.stringify(mapping).includes('mtk'),'data mapel lama tetap tersimpan');

  /* Riwayat penugasan hanya bertambah. */
  const record=Object.values(loadDb().teacherAssignments)[0];
  assert.equal(record.history.length,2,'kedua keputusan Admin tercatat');
  assert.deepEqual(record.history[0].subjectIds,['mtk','ipas'],'penugasan lama tetap terbaca');
});

test('10. Guru tidak dapat mengubah penugasannya sendiri',()=>{
  useMemoryStorage();
  const kelas=guru('5B');
  saveSubjectMapping(kelas,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:item.id==='mtk',order:index+1})));
  assert.throws(()=>setTeacherAssignment(kelas,'5B',{subjectIds:['mtk']}),/Hanya Admin/i);
  for(const berkas of ['src/pages/assessment.js','src/pages/objectives.js',
    'src/pages/intracurricular-input.js','src/pages/profile.js'])
    assert.equal(read(berkas).includes('setTeacherAssignment'),false,
      `${berkas} tidak dapat mengubah penugasan`);
});

/* ------------------------------------------------------------ Naskah CP resmi (§A) */

test('11. CP tanpa naskah resmi dilaporkan apa adanya, bukan diisi karangan',()=>{
  const kurang=cpNaskahGaps();
  /* Selama naskah resmi belum dimuat, daftar ini yang menjadi laporannya. */
  for(const entri of kurang){
    assert.ok(entri.subjectId&&['A','B','C'].includes(entri.phase));
    assert.match(entri.decision,/BSKAP Nomor 046\/H\/KR\/2025|BKPDM Nomor 020 Tahun 2026/,
      'setiap CP tetap menyebut regulasinya');
  }
  /* Yang dilarang adalah naskah karangan, bukan naskah kosong. */
  const sumber=read('src/data/curriculum-cp.js');
  assert.match(sumber,/naskah:null/,'naskah dibiarkan kosong sampai dokumen resmi dimuat');
  assert.match(sumber,/tidak boleh menjadi sumber kedua/,'alasannya tercatat di kode');
});

test('12. Pandangan Admin tidak ikut dipersempit oleh penugasan satu Guru',()=>{
  useMemoryStorage();
  const sesi=admin();
  const kelas=guru('5B');
  saveTeacherProfile(sesi,'5B',{name:'Fahmi Djawas, S.Pd.',nip:'198501012010011001',
    phone:'08',email:'f@contoh.sch.id',photo:''});
  saveSubjectMapping(kelas,SUBJECTS_DEFAULT.map((item,index)=>
    ({...item,active:['mtk','ipas'].includes(item.id),order:index+1})));
  /* Kedua mapel dilengkapi TP. */
  for(const subjectId of ['mtk','ipas']){
    const referensi=listReferenceObjectives({...kelas,adminContext:true},subjectId);
    addReferenceObjectives({...kelas,adminContext:true},subjectId,referensi.map(item=>item.id));
  }
  /* Admin lalu mempersempit penugasan Guru menjadi IPAS saja. */
  setTeacherAssignment(sesi,'5B',{subjectIds:['ipas'],active:true});
  assert.deepEqual(listActiveSubjects(kelas).map(item=>item.id),['ipas'],'Guru memang dibatasi');

  /* Kesiapan Guru tetap melihat konfigurasi sekolah apa adanya: Matematika sudah punya TP. */
  const kesiapan=getAdminReadiness(sesi);
  /* Dicocokkan pada awal butir supaya "KKTP Matematika" tidak salah tertangkap. */
  const kurangTP=(kesiapan.blockers||[]).filter(item=>item.startsWith('TP '));
  assert.deepEqual(kurangTP,[],
    'TP kedua mapel sudah ada, jadi tidak boleh dilaporkan belum tersedia');
  const butirTP=kesiapan.items.find(item=>item.id==='learning-objectives');
  assert.equal(butirTP.done,true,'seluruh mapel aktif sudah punya TP');

  /* Penandanya eksplisit, bukan kebetulan. */
  assert.equal(assignedSubjectIds({...kelas,adminContext:true}),null,
    'konteks Admin tidak dibatasi penugasan');
  assert.deepEqual(assignedSubjectIds(kelas),['ipas'],'sesi Guru tetap dibatasi');
});
