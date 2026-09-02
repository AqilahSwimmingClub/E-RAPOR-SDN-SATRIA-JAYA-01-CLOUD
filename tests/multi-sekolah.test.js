import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACADEMIC_YEAR, DEFAULT_SCHOOL_NAME, SCHOOL_PLACEHOLDER } from '../src/data/constants.js';
import { APP_NAME, COPYRIGHT, DEVELOPER_CREDIT_LEAD, DEVELOPER_NAME, DEVELOPER_PHOTO, DEVELOPER_ROLE, FOOTER_CREDIT } from '../src/data/app-identity.js';
import { SCHOOL_STATUSES, getAdminProfile, getSchoolMaster, isSchoolIdentityReady, saveAdminProfile, saveSchoolIdentitySetup, saveSchoolMaster } from '../src/services/master.js';
import { buildBackup, backupFilename, validateBackupPayload, restoreBackup } from '../src/services/backup.js';
import { getDocumentIdentity, getLeger } from '../src/services/documents.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping, storageKey } from '../src/services/storage.js';
import { SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ensureDefaultSubjects } from '../src/services/seed.js';

/* Aplikasi ini dipakai banyak sekolah. Identitas sekolah bersifat dinamis dan dikelola Admin,
   sedangkan identitas pembuat aplikasi bersifat permanen dan tidak pernah berasal dari
   database maupun berkas backup. Suite ini menjaga kedua janji itu sekaligus. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();return values;}
const admin={role:'admin'};
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
const SEKOLAH='SDN Contoh Nusantara 02';
const IDENTITAS={name:SEKOLAH,npsn:'12345678',status:'Negeri',registrationNumber:'101010101010',phone:'0211234567',
  address:'Jalan Contoh Nomor 1',village:'Desa Contoh',district:'Kecamatan Contoh',city:'Kabupaten Contoh',
  province:'Provinsi Contoh',postalCode:'17510',website:'contoh.sch.id',email:'admin@contoh.sch.id',
  principalName:'Kepala Sekolah Contoh',principalNip:'198001012006041001'};

/* ------------------------------------------------- 1-3. Instalasi baru bersih dari sekolah lama */

test('1. Instalasi baru tidak membawa identitas sekolah mana pun',()=>{
  useMemoryStorage();
  const school=getSchoolMaster();
  assert.equal(school.name,'','nama sekolah kosong sampai Admin mengisinya');
  assert.equal(DEFAULT_SCHOOL_NAME,'','tidak ada nama sekolah bawaan di kode');
  for(const field of ['npsn','registrationNumber','status','address','village','district','city','province','postalCode','phone','website','email','schoolLogo'])
    assert.equal(school[field],'',`${field} kosong pada instalasi baru`);
  const isi=JSON.stringify(loadDb());
  for(const jejak of ['Satria Jaya','Satriajaya','20218098','101022205007','Kp. Gebang','Tambun Utara','sdnsatriajaya01'])
    assert.equal(isi.includes(jejak),false,`database baru bersih dari ${jejak}`);
});

test('2. Instalasi baru memiliki nol siswa dan startup tidak menyemai siapa pun',()=>{
  useMemoryStorage();
  ensureDefaultSubjects();
  assert.equal(Object.keys(loadDb().students).length,0,'nol siswa pada instalasi baru');
  assert.equal(listStudents(guru(),{classId:'5B'}).length,0);
  /* Startup aplikasi tidak lagi memanggil penyemaian siswa. */
  assert.equal(read('src/app.js').includes('seedInitialStudents'),false,'startup tidak menyemai siswa');
  assert.equal(read('src/services/seed.js').includes('students'),false,'layanan seed tidak lagi menyentuh koleksi siswa');
});

test('3. Kode produk tidak lagi membundel roster siswa nyata',()=>{
  assert.equal(existsSync(new URL('src/data/seed-5b.js',root)),false,'berkas roster sudah tidak ada');
  const jejak=['Satria jaya','Satriajaya','20218098','101022205007','Kp. Gebang','Kec. Tambun Utara','sdnsatriajaya01'];
  const berkas=[];
  (function telusuri(dir){
    for(const nama of readdirSync(new URL(dir,root))){
      const relatif=`${dir}/${nama}`;
      if(statSync(new URL(relatif,root)).isDirectory())telusuri(relatif);
      else if(/\.(js|css|html)$/.test(nama))berkas.push(relatif);
    }
  })('src');
  for(const path of [...berkas,'sw.js','index.html','manifest.webmanifest']){
    const isi=read(path);
    for(const teks of jejak)
      assert.equal(isi.includes(teks),false,`${path} bersih dari ${teks}`);
  }
});

/* ------------------------------------------------------- 4-8. Identitas sekolah benar-benar dinamis */

test('4. Admin dapat menyimpan nama sekolah berbeda',()=>{
  useMemoryStorage();
  const saved=saveSchoolMaster(admin,IDENTITAS);
  assert.equal(saved.name,SEKOLAH);
  assert.equal(getSchoolMaster().name,SEKOLAH);
  /* Nama sekolah wajib diisi dan tidak pernah ditimpa oleh nilai bawaan. */
  assert.throws(()=>saveSchoolMaster(admin,{...IDENTITAS,name:'   '}),/Nama sekolah wajib diisi/);
  assert.throws(()=>saveSchoolMaster({role:'teacher'},IDENTITAS),/Hanya Admin/);
  assert.equal(read('src/services/master.js').includes('name:SCHOOL'),false,'nama sekolah tidak lagi dipaksa konstanta');
  /* Form Data Sekolah benar-benar mengirim nama sekolah. */
  const halaman=read('src/pages/references.js');
  assert.match(halaman,/<label>Nama Sekolah \*<\/label><input class="input" name="name"/,'nama sekolah dapat diedit');
  assert.equal(/name="name"[^>]*readonly/.test(halaman),false,'tidak ada readonly pada nama sekolah');
});

test('5. Identitas sekolah bertahan setelah reload',()=>{
  const values=useMemoryStorage();
  saveSchoolMaster(admin,IDENTITAS);
  const mentah=values.get(storageKey());
  /* Muat ulang dari storage yang sama, persis seperti membuka ulang aplikasi. */
  useMemoryStorage().set(storageKey(),mentah);
  invalidateDbCache();
  assert.equal(getSchoolMaster().name,SEKOLAH,'nama sekolah bertahan setelah reload');
  assert.equal(getSchoolMaster().npsn,'12345678');
  assert.equal(isSchoolIdentityReady(),true);
});

test('6. Halaman Masuk membaca nama dan logo sekolah dari master',()=>{
  const halaman=read('src/pages/login.js');
  assert.match(halaman,/const school=getSchoolMaster\(\)/,'login membaca identitas sekolah');
  assert.match(halaman,/const schoolLabel=schoolName\|\|SCHOOL_PLACEHOLDER/,'label netral saat belum setup');
  assert.match(halaman,/const crest=schoolLogo\|\|'\.\/assets\/app-icon\.svg'/,'lambang netral saat logo belum diunggah');
  for(const jejak of ['SDN SATRIA JAYA 01','SDN Satria Jaya 01','./assets/logo-sekolah.png'])
    assert.equal(halaman.includes(jejak),false,`login bersih dari ${jejak}`);
  assert.equal(SCHOOL_PLACEHOLDER,'Nama Sekolah','fallback netral, bukan nama sekolah lama');
});

test('7. Sidebar dan aktivasi membaca nama sekolah dari master',()=>{
  const layout=read('src/ui/layout.js');
  assert.match(layout,/const school=getSchoolMaster\(\)/);
  assert.match(layout,/brand-sub">\$\{escapeHtml\(String\(school\.name\|\|''\)\.trim\(\)\|\|SCHOOL_PLACEHOLDER\)\}/);
  const aktivasi=read('src/pages/activation.js');
  assert.match(aktivasi,/getSchoolMaster\(\)/,'halaman aktivasi ikut dinamis');
  assert.equal(aktivasi.includes('SDN Satria Jaya 01'),false);
});

test('8. Rapor, cover, leger, dan transkrip memakai identitas sekolah yang tersimpan',()=>{
  useMemoryStorage();
  saveSchoolMaster(admin,IDENTITAS);
  const session=guru();
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:index<2,order:index+1})));
  const identity=getDocumentIdentity(session);
  assert.equal(identity.school.name,SEKOLAH);
  assert.equal(identity.school.city,'Kabupaten Contoh');
  assert.equal(getLeger(session).school.name,SEKOLAH);
  /* Kop transkrip mengikuti daerah sekolah, bukan daerah yang ditanam di kode. */
  const transkrip=read('src/pages/transcript.js');
  assert.match(transkrip,/regionHeading\(school\)/);
  assert.equal(transkrip.includes('PEMERINTAH KABUPATEN BEKASI'),false);
  /* Kota tanda tangan juga tidak lagi literal. */
  assert.equal(read('src/services/print-settings.js').includes("'Bekasi'"),false);
});

/* ------------------------------------------------------------ 9-10. Logo dan field sekolah baru */

test('9. Logo sekolah diunggah Admin dan dipakai halaman Masuk',()=>{
  useMemoryStorage();
  const png='data:image/png;base64,iVBORw0KGgo=';
  assert.equal(getSchoolMaster().schoolLogo,'','belum ada logo pada instalasi baru');
  const saved=saveSchoolMaster(admin,{...IDENTITAS,schoolLogo:png});
  assert.equal(saved.schoolLogo,png);
  /* Logo bertahan saat form identitas lain disimpan tanpa menyertakan logo. */
  saveSchoolMaster(admin,IDENTITAS);
  assert.equal(getSchoolMaster().schoolLogo,png,'logo tidak hilang saat field lain disimpan');
  assert.throws(()=>saveSchoolMaster(admin,{...IDENTITAS,schoolLogo:'https://contoh.test/logo.png'}),/harus berupa file gambar lokal/);
  assert.match(read('src/pages/references.js'),/logoField\('schoolLogo','Logo Sekolah'/,'ada kolom unggah Logo Sekolah');
});

test('10. Empat field identitas baru tersimpan dan tervalidasi',()=>{
  useMemoryStorage();
  const saved=saveSchoolMaster(admin,IDENTITAS);
  assert.equal(saved.status,'Negeri');
  assert.equal(saved.postalCode,'17510');
  assert.equal(saved.phone,'0211234567');
  assert.equal(saved.schoolLogo,'');
  assert.deepEqual([...SCHOOL_STATUSES],['Negeri','Swasta']);
  assert.throws(()=>saveSchoolMaster(admin,{...IDENTITAS,status:'Yayasan'}),/Negeri atau Swasta/);
  assert.throws(()=>saveSchoolMaster(admin,{...IDENTITAS,postalCode:'123'}),/Kode Pos harus 5 angka/);
  assert.equal(saveSchoolMaster(admin,{...IDENTITAS,postalCode:''}).postalCode,'','kode pos boleh dikosongkan');
});

/* --------------------------------------------------- 11-13. Identitas pembuat aplikasi permanen */

test('11. Identitas pembuat aplikasi tetap tampil pada lokasi yang ditentukan',()=>{
  assert.equal(DEVELOPER_NAME,'FAHMI DJAWAS, S.Pd.');
  assert.equal(DEVELOPER_CREDIT_LEAD,'Dirancang & Dikembangkan oleh');
  assert.equal(DEVELOPER_ROLE,'Developer & UI/UX Designer e-Rapor');
  assert.equal(COPYRIGHT,'© 2026 — Semua Hak Dilindungi');
  assert.equal(FOOTER_CREDIT,'Dashboard didesain oleh FAHMI DJAWAS. © 2026 Semua hak dilindungi');
  assert.equal(DEVELOPER_PHOTO,'./assets/fahmi-djawas.jpg');
  assert.equal(existsSync(new URL('assets/fahmi-djawas.jpg',root)),true,'foto pembuat tetap ada di aplikasi');
  const login=read('src/pages/login.js');
  for(const konstanta of ['DEVELOPER_CREDIT_LEAD','DEVELOPER_NAME','DEVELOPER_ROLE','COPYRIGHT'])
    assert.ok(login.includes(konstanta),`halaman Masuk memakai ${konstanta}`);
  assert.match(read('src/ui/layout.js'),/\$\{escapeHtml\(FOOTER_CREDIT\)\}/,'footer memakai kredit permanen');
  assert.match(read('src/pages/school-setup.js'),/DEVELOPER_NAME/,'Setup Awal ikut menampilkan pembuat aplikasi');
});

test('12. Identitas pembuat aplikasi tidak pernah berasal dari database',()=>{
  const identitas=read('src/data/app-identity.js');
  for(const larangan of ['loadDb(','localStorage','import ','require('])
    assert.equal(identitas.includes(larangan),false,`sumber identitas pembuat tidak memakai ${larangan}`);
  useMemoryStorage();
  saveSchoolMaster(admin,IDENTITAS);
  saveAdminProfile(admin,{name:'Admin Sekolah Contoh',nip:'',phone:'',email:'',photo:''});
  const isi=JSON.stringify(loadDb());
  for(const jejak of ['FAHMI DJAWAS','Fahmi Djawas','fahmi-djawas'])
    assert.equal(isi.includes(jejak),false,`database sekolah bersih dari ${jejak}`);
  /* Tidak ada form Admin yang dapat mengubah identitas pembuat aplikasi. */
  for(const halaman of ['src/pages/references.js','src/pages/profile.js','src/pages/settings.js','src/pages/school-setup.js']){
    const isiHalaman=read(halaman);
    assert.equal(/name="developer|data-developer|DEVELOPER_NAME"\s*value=/.test(isiHalaman),false,`${halaman} tidak menyediakan isian identitas pembuat`);
  }
});

test('13. Profil Admin bawaan bukan identitas pembuat aplikasi',()=>{
  useMemoryStorage();
  const profile=getAdminProfile();
  assert.equal(profile.name,'Administrator');
  assert.equal(profile.photo,'');
  /* Foto pembuat aplikasi tidak lagi menjadi nilai yang sah untuk foto profil sekolah. */
  assert.throws(()=>saveAdminProfile(admin,{name:'Admin',photo:'./assets/fahmi-djawas.jpg'}),/gambar lokal/);
  assert.equal(read('src/services/master.js').includes("'./assets/fahmi-djawas.jpg'"),false,'allowlist foto pembuat sudah dibuang');
});

/* --------------------------------------------------------------- 14-16. Kompatibilitas backup */

function siapkanBackup(){
  useMemoryStorage();
  saveSchoolMaster(admin,IDENTITAS);
  const session=guru();
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:index<2,order:index+1})));
  createStudent(session,{classId:'5B',nis:'UJI-1',nisn:'9000000001',name:'Siswa Uji',gender:'L',religion:'Islam',birthPlace:'Kota Uji',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Jalan Contoh',photo:''});
  return {session,payload:buildBackup(session)};
}

test('14. Backup format lama tetap dapat direstore',()=>{
  const {session,payload}=siapkanBackup();
  /* Berkas dari rilis sebelumnya ditandai nama produk lama. */
  const lama={...payload,app:'e-Rapor SDN Satria Jaya 01'};
  assert.doesNotThrow(()=>validateBackupPayload(lama));
  const hasil=restoreBackup(lama,session);
  assert.ok(hasil,'restore berkas lama berhasil');
  assert.equal(listStudents(session,{classId:'5B'}).length,1,'data di dalam backup lama tetap masuk');
});

test('15. Backup format baru memakai penanda produk generic dan tetap dapat direstore',()=>{
  const {session,payload}=siapkanBackup();
  assert.equal(payload.app,APP_NAME);
  assert.equal(APP_NAME,'e-Rapor','penanda produk tidak lagi menyebut satu sekolah');
  assert.doesNotThrow(()=>validateBackupPayload(payload));
  assert.ok(restoreBackup(payload,session));
  /* Nama berkas mengikuti sekolah pengguna, bukan sekolah tertentu di kode. */
  const nama=backupFilename(session);
  assert.match(nama,/^ERAPOR-SDN-CONTOH-NUSANTARA-02-KELAS-5B-GANJIL-/,`nama berkas mengikuti sekolah: ${nama}`);
  assert.equal(nama.includes('SATRIA'),false);
});

test('16. Backup yang tidak sah tetap ditolak',()=>{
  const {payload}=siapkanBackup();
  assert.throws(()=>validateBackupPayload({...payload,app:'Aplikasi Lain'}),/bukan backup e-Rapor/);
  assert.throws(()=>validateBackupPayload({...payload,schemaVersion:99}),/Versi backup tidak kompatibel/);
  assert.throws(()=>validateBackupPayload({...payload,exportedAt:'bukan-tanggal'}),/Waktu ekspor/);
  assert.throws(()=>validateBackupPayload({...payload,scope:{...payload.scope,role:'kepala'}}),/Peran pada scope/);
  assert.throws(()=>validateBackupPayload({...payload,data:'bukan-object'}),/./);
  assert.throws(()=>validateBackupPayload(null),/./);
});

/* ------------------------------------------------------------- 17-18. Instalasi lama tetap utuh */

test('17. Instalasi lama tetap membuka identitas sekolah dan seluruh datanya',()=>{
  const values=useMemoryStorage();
  /* Database milik pengguna lama: identitas sekolah lamanya tersimpan di dalam database,
     bukan berasal dari kode, sehingga harus tetap terbaca apa adanya. */
  const lama=JSON.parse(JSON.stringify(loadDb()));
  lama.masterData.school={...lama.masterData.school,name:'SDN Satria Jaya 01',npsn:'20218098',city:'Kab. Bekasi',principalName:'Kepala Lama',principalNip:'1234'};
  lama.students['2026/2027|Ganjil 2026/2027|5B|lama-1']={id:'lama-1',classId:'5B',nis:'999',nisn:'888',name:'Siswa Lama',gender:'L',religion:'Islam',birthPlace:'Kota',birthDate:'2015-01-01',parentName:'Ortu',phone:'08',address:'Alamat',photo:'',academicYear:'2026/2027',semester:'Ganjil 2026/2027'};
  lama.attendance['2026/2027|Ganjil 2026/2027|5B|2026-08-10']={date:'2026-08-10',classId:'5B',semester:'Ganjil 2026/2027',academicYear:'2026/2027',statuses:{'lama-1':'Sakit'}};
  lama.assessmentScores['2026/2027|Ganjil 2026/2027|5B|mtk|formative|lama-1']={studentId:'lama-1',score:77};
  values.set(storageKey(),JSON.stringify(lama));
  invalidateDbCache();

  const school=getSchoolMaster();
  assert.equal(school.name,'SDN Satria Jaya 01','identitas sekolah pengguna lama tidak ditimpa nilai kosong');
  assert.equal(school.npsn,'20218098');
  assert.equal(school.principalName,'Kepala Lama');
  /* Field baru muncul sebagai nilai kosong tanpa merusak apa pun. */
  assert.equal(school.status,'');
  assert.equal(school.schoolLogo,'');
  const db=loadDb();
  assert.equal(Object.keys(db.students).length,1,'siswa lama tidak dihapus');
  assert.equal(Object.keys(db.attendance).length,1,'absensi lama tidak dihapus');
  assert.equal(db.assessmentScores['2026/2027|Ganjil 2026/2027|5B|mtk|formative|lama-1'].score,77,'nilai lama utuh');
});

test('18. Kunci storage lama sengaja dipertahankan agar data pengguna tidak putus',()=>{
  const storage=read('src/services/storage.js');
  assert.match(storage,/const DB_KEY = 'erapor_satria_jaya_01_v1'/,'kunci storage tidak diubah');
  assert.match(read('electron/main.cjs'),/const STORAGE_KEY='erapor_satria_jaya_01_v1'/,'kunci Windows tetap sama');
  /* Tidak ada jalur yang menghapus seluruh database pengguna. */
  for(const berkas of ['src/services/storage.js','src/services/migrations.js','src/services/seed.js','src/services/master.js','src/app.js'])
    assert.equal(read(berkas).includes('localStorage.clear()'),false,`${berkas} tidak pernah mengosongkan storage`);
});

/* --------------------------------------------------------------------- 19-20. Setup Awal */

test('19. Setup Awal hanya muncul selama identitas sekolah belum diisi',()=>{
  useMemoryStorage();
  assert.equal(isSchoolIdentityReady(),false,'instalasi baru belum siap dipakai');
  const app=read('src/app.js');
  assert.match(app,/if\(!startupError&&!isSchoolIdentityReady\(\)\)\{/,'gerbang setup dipasang di router');
  assert.match(app,/renderSchoolSetup\(\{onComplete:\(\)=>navigate\('license'\)\}\)/,'setup selesai lanjut ke aktivasi lisensi');
  saveSchoolIdentitySetup(IDENTITAS);
  assert.equal(isSchoolIdentityReady(),true,'gerbang tertutup setelah identitas tersimpan');
  assert.equal(getSchoolMaster().name,SEKOLAH);
  /* Jalur setup tertutup sendiri dan tidak dapat dipakai ulang tanpa session Admin. */
  assert.throws(()=>saveSchoolIdentitySetup({...IDENTITAS,name:'Sekolah Lain'}),/sudah disetup/);
  assert.equal(getSchoolMaster().name,SEKOLAH,'identitas tidak berubah oleh percobaan ulang');
});

test('20. Setelah setup, alur kembali ke aktivasi dan login yang sudah ada',()=>{
  const app=read('src/app.js'),setup=read('src/pages/school-setup.js');
  /* Setup tidak membuat sistem autentikasi baru. */
  for(const larangan of ['authenticate','saveSession','activateOwnerAdmin','userAccounts','password'])
    assert.equal(setup.includes(larangan),false,`Setup Awal tidak menyentuh ${larangan}`);
  assert.match(app,/if\(route==='login'\)\{/,'route login tetap');
  assert.match(app,/renderOwnerActivation\(/,'aktivasi pemilik tetap dipakai apa adanya');
  assert.match(read('src/pages/login.js'),/authenticate\(\{role,username:/,'kontrak login tidak berubah');
  /* Setup hanya menulis identitas sekolah, tidak lebih. */
  assert.match(setup,/saveSchoolIdentitySetup\(/);
  assert.equal(setup.includes('updateDb'),false,'setup tidak menulis langsung ke database');
});
