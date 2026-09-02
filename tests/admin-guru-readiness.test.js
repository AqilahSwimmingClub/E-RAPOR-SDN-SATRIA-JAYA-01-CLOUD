import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { getAdminReadiness, activateTeacherUsage, deactivateTeacherUsage, isTeacherUsageActive,
  READINESS_ITEMS, teacherUsageScopeKey } from '../src/services/admin-readiness.js';
import { saveSchoolIdentitySetup, saveTeacherProfile } from '../src/services/master.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';
import { saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { createStudent } from '../src/services/students.js';

/* Admin lokal mengendalikan kapan Guru boleh mulai memakai e-Rapor pada satu tahun pelajaran
   dan semester. Statusnya tersimpan di database lokal perangkat dan sama sekali tidak
   bersinggungan dengan lisensi. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:k=>values.has(k)?values.get(k):null,
  setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear()};invalidateDbCache();return values;}
const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});

function lengkapiChecklist(){
  saveSchoolIdentitySetup({name:'SDN Contoh Nusantara 02',npsn:'12345678',status:'Negeri',address:'Jl Contoh',
    village:'Desa',district:'Kecamatan',city:'Kabupaten Contoh',province:'Provinsi',postalCode:'17510',phone:'021',
    email:'a@contoh.sch.id',website:'',registrationNumber:'',principalName:'Kepala Sekolah Contoh',
    principalNip:'198001012006041001',schoolLogo:''});
  saveTeacherProfile(admin,'5B',{name:'Wali Kelas 5B',nip:'198502022010012001',phone:'08',email:'w@contoh.sch.id',photo:''});
  const sesiGuru=guru();
  const aktif=SUBJECTS_DEFAULT.slice(0,3).map(item=>item.id);
  saveSubjectMapping(sesiGuru,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:aktif.includes(item.id),order:index+1})));
  for(const subjectId of aktif)
    saveAssessmentSettings(sesiGuru,subjectId,{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
}

test('Checklist kesiapan menyebut seluruh syarat dan menolak aktivasi bila belum lengkap',()=>{
  useMemoryStorage();
  const kesiapan=getAdminReadiness(admin);
  assert.equal(kesiapan.ready,false,'instalasi baru belum siap dipakai Guru');
  assert.ok(kesiapan.items.length>=6,'checklist memuat seluruh syarat wajib');
  assert.deepEqual(kesiapan.items.map(item=>item.id).sort(),[...READINESS_ITEMS].sort());
  for(const item of kesiapan.items)assert.ok(item.label&&item.reason!==undefined,`${item.id} punya label dan alasan`);
  assert.ok(kesiapan.missing.length>0,'alasan belum siap dijelaskan');
  assert.throws(()=>activateTeacherUsage(admin),/belum lengkap/i);
  assert.equal(isTeacherUsageActive(guru()),false);
});

test('Checklist lengkap membuat Admin dapat mengaktifkan penggunaan Guru',()=>{
  useMemoryStorage();
  lengkapiChecklist();
  const kesiapan=getAdminReadiness(admin);
  assert.equal(kesiapan.ready,true,`seharusnya siap, yang kurang: ${kesiapan.missing.join(', ')}`);
  const hasil=activateTeacherUsage(admin);
  assert.equal(hasil.active,true);
  assert.equal(hasil.scope,teacherUsageScopeKey(admin));
  assert.ok(hasil.activatedAt);
  assert.equal(isTeacherUsageActive(guru()),true);
  assert.equal(isTeacherUsageActive(guru('1A')),true,'aktivasi berlaku untuk seluruh rombel pada scope itu');
});

test('Status kesiapan terscope per tahun pelajaran dan semester',()=>{
  useMemoryStorage();
  lengkapiChecklist();
  activateTeacherUsage(admin);
  assert.equal(isTeacherUsageActive(guru()),true);
  const semesterLain={...guru(),semester:`Genap ${ACADEMIC_YEAR}`};
  assert.equal(isTeacherUsageActive(semesterLain),false,'semester berikutnya diaktifkan tersendiri');
  assert.notEqual(teacherUsageScopeKey(admin),teacherUsageScopeKey(semesterLain));
});

test('Hanya Admin yang boleh mengaktifkan; Guru tidak dapat menugaskan dirinya sendiri',()=>{
  useMemoryStorage();
  lengkapiChecklist();
  assert.throws(()=>activateTeacherUsage(guru()),/Hanya Admin/i);
  assert.throws(()=>deactivateTeacherUsage(guru()),/Hanya Admin/i);
  /* Penugasan rombel tetap milik Admin: Guru tidak dapat menugaskan dirinya ke rombel lain. */
  assert.throws(()=>saveTeacherProfile(guru('5B'),'1A',{name:'Menugaskan Diri Sendiri'}),/tidak berwenang|Hanya Admin/i);
  assert.throws(()=>saveTeacherProfile(guru('5B'),'6D',{name:'Pindah Sendiri'}),/tidak berwenang|Hanya Admin/i);
  const navigasi=read('src/data/navigation.js');
  assert.equal(navigasi.includes("'reference-teachers','teacher-assignment'"),false);
  const menuGuru=navigasi.slice(navigasi.indexOf('teacher:Object.freeze'));
  for(const larangan of ['reference-teachers','admin-readiness'])
    assert.equal(menuGuru.includes(larangan),false,`menu Guru tidak memuat ${larangan}`);
});

test('Sebelum diaktifkan, Guru tetap masuk tetapi menu operasional terkunci dengan alasan',()=>{
  useMemoryStorage();
  lengkapiChecklist();
  const sesi=guru();
  assert.equal(isTeacherUsageActive(sesi),false);
  const kunci=getAdminReadiness(admin);
  assert.ok(kunci.lockMessage&&kunci.lockMessage.length>20,'alasan penguncian dijelaskan ke Guru');
  /* Router menyediakan daftar route yang tetap terbuka bagi Guru. */
  const app=read('src/app.js');
  assert.match(app,/TEACHER_ALWAYS_OPEN_ROUTES/,'ada daftar route yang tetap terbuka');
  assert.match(app,/isTeacherUsageActive/,'router memeriksa status kesiapan');
  for(const aman of ['dashboard','profile','account-settings','backup'])
    assert.match(app,new RegExp(`'${aman}'`),`route aman ${aman} tetap terbuka`);
});

test('Aktivasi dan penonaktifan tidak menghapus data dan tidak menyentuh lisensi',()=>{
  const values=useMemoryStorage();
  lengkapiChecklist();
  const sebelum=JSON.stringify(loadDb());
  activateTeacherUsage(admin);
  deactivateTeacherUsage(admin,{reason:'perbaikan konfigurasi'});
  assert.equal(isTeacherUsageActive(guru()),false);
  /* Kembali diaktifkan tanpa kehilangan apa pun. */
  activateTeacherUsage(admin);
  assert.equal(isTeacherUsageActive(guru()),true);
  const sesudah=loadDb();
  for(const koleksi of ['students','attendance','assessmentScores','reportScores','masterData','subjectMappings'])
    assert.deepEqual(sesudah[koleksi],JSON.parse(sebelum)[koleksi],`${koleksi} tidak berubah`);
  /* Status kesiapan hidup di database sekolah, lisensi hidup di kunci penyimpanan lain. */
  assert.ok(sesudah.teacherUsageActivation,'koleksi kesiapan tersimpan di DB sekolah');
  assert.equal(values.get('erapor_license_v1'),undefined,'lisensi tidak tersentuh');
  const layanan=read('src/services/admin-readiness.js');
  for(const larangan of ['license','License','activation_token','installation'])
    assert.equal(layanan.includes(larangan),false,`layanan kesiapan tidak menyentuh ${larangan}`);
});

test('Riwayat perubahan status kesiapan tercatat tanpa menghapus riwayat lama',()=>{
  useMemoryStorage();
  lengkapiChecklist();
  activateTeacherUsage(admin);
  deactivateTeacherUsage(admin,{reason:'ganti KKTP'});
  activateTeacherUsage(admin);
  const record=loadDb().teacherUsageActivation[teacherUsageScopeKey(admin)];
  assert.equal(record.active,true);
  assert.ok(record.history.length>=3,'seluruh perubahan tercatat');
  assert.equal(record.history[1].reason,'ganti KKTP');
  assert.ok(record.history.every(item=>item.at&&item.actor),'setiap catatan punya waktu dan aktor');
});

/* ------------------------------------------------- Instalasi lama tidak boleh ikut terkunci */

function nilaiTersimpan(session='5B'){
  const sesi=guru(session);
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:item.id==='mtk',order:index+1})));
  const siswa=createStudent(sesi,{classId:sesi.classId,nis:`${sesi.classId}-1`,nisn:'9911000001',
    name:'Siswa Lama',gender:'P',photo:''});
  saveAssessmentScores(sesi,'mtk','formative',{[siswa.id]:88});
  return sesi;
}

test('Instalasi lama yang sudah berisi nilai tetap terbuka untuk Guru',()=>{
  useMemoryStorage();
  const sesi=nilaiTersimpan();
  /* Belum pernah ada tombol Aktifkan pada perangkat ini, tetapi sekolah jelas sudah memakai
     aplikasi: nilai untuk periode ini sudah tersimpan. Guru tidak boleh mendadak terkunci
     hanya karena aplikasinya diperbarui. */
  assert.equal(isTeacherUsageActive(sesi),true);
  const kesiapan=getAdminReadiness(admin);
  assert.equal(kesiapan.active,true);
  assert.equal(kesiapan.grandfathered,true);
});

test('Instalasi baru tanpa penilaian tetap menunggu Admin menekan Aktifkan',()=>{
  useMemoryStorage();
  const sesi=guru();
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:item.id==='mtk',order:index+1})));
  createStudent(sesi,{classId:sesi.classId,nis:'5B-1',nisn:'9911000002',name:'Siswa Baru',gender:'L',photo:''});
  assert.equal(isTeacherUsageActive(sesi),false,'baru ada siswa, belum ada penilaian apa pun');
  assert.equal(getAdminReadiness(admin).grandfathered,false);
});

test('Admin tetap dapat menutup penggunaan pada instalasi lama tanpa menghapus data',()=>{
  useMemoryStorage();
  const sesi=nilaiTersimpan();
  assert.equal(isTeacherUsageActive(sesi),true);
  deactivateTeacherUsage(admin,{reason:'perbaikan konfigurasi'});
  assert.equal(isTeacherUsageActive(sesi),false,'keputusan Admin mengalahkan penerusan otomatis');
  assert.equal(Object.keys(loadDb().assessmentScores).length,1,'data nilai tidak tersentuh');
});

test('Periode berikutnya tidak ikut terbuka oleh data periode sebelumnya',()=>{
  useMemoryStorage();
  const sesi=nilaiTersimpan();
  assert.equal(isTeacherUsageActive(sesi),true);
  assert.equal(isTeacherUsageActive({...sesi,semester:`Genap ${ACADEMIC_YEAR}`}),false,'semester baru tetap menunggu Admin');
});
