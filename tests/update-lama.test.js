import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { APP_SCHEMA_VERSION, APP_VERSION, VERSION_CODE } from '../src/data/version.js';
import { runAppMigrations } from '../src/services/migrations.js';
import { ensureDefaultSubjects, seedInitialStudents, seedStatus, SEED_FLAG_KEY } from '../src/services/seed.js';
import { STUDENTS_5B, SEED_ACADEMIC_YEAR, SEED_CLASS_ID, SEED_SEMESTER } from '../src/data/seed-5b.js';
import { getSubjectMapping, loadDb, storageKey } from '../src/services/storage.js';
import { listStudents } from '../src/services/students.js';
import { listActiveSubjects } from '../src/services/subjects.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}

const TAHUN=SEED_ACADEMIC_YEAR,SEM=SEED_SEMESTER,KELAS=SEED_CLASS_ID;
const SCOPE=`${TAHUN}|${SEM}|${KELAS}`;
const sesi={role:'teacher',classId:KELAS,academicYear:TAHUN,semester:SEM};

/* Database pengguna lama: mapping custom, nilai, absensi, TP, bobot, catatan, dan siswa buatan guru. */
function databaseLama({appSchemaVersion=3,appVersion='1.1.0',students={}}={}){
  const mapelLama=SUBJECTS_DEFAULT.filter(item=>item.id!=='seni_rupa').map((item,index)=>({...item,order:index+1}));
  return {
    schemaVersion:1,appSchemaVersion,appVersion,
    createdAt:'2026-07-01T00:00:00.000Z',updatedAt:'2026-07-01T00:00:00.000Z',
    settings:{},
    masterData:{
      school:{name:'SDN Satria Jaya 01',principalName:'Misan, S.Pd',principalNip:'196604171992031008'},
      admin:{name:'Fahmi Djawas, S.Pd.',nip:'',phone:'',email:'',photo:''},
      classes:[],teachers:{},
      references:{
        academicYears:[{id:TAHUN,label:TAHUN,active:true}],
        semesters:[{id:SEM,label:SEM,name:'Ganjil',academicYear:TAHUN,active:true}],
        subjects:mapelLama.map(item=>({...item})),
      },
    },
    userAccounts:{'teacher:5B':{username:'Guru5B',role:'teacher'}},
    security:{ownerActivated:true},
    subjectMappings:{[SCOPE]:mapelLama.map(item=>({...item,active:['agama','mtk','bindo'].includes(item.id),group:item.id==='bindo'?'B':item.group}))},
    assessmentSettings:{[`${SCOPE}|mtk`]:{formative:40,daily:15,practice:15,scopeSummative:15,semesterSummative:15,kktp:68}},
    students:{[`${SCOPE}|lama-1`]:{id:'lama-1',classId:KELAS,nis:'999001',nisn:'8888800001',name:'Siswa Lama Guru',gender:'L',birthPlace:'Bekasi',birthDate:'2015-05-05',parentName:'Ortu Lama',phone:'0812',address:'Alamat lama',academicYear:TAHUN,semester:SEM},...students},
    attendance:{[`${SCOPE}|2026-08-10`]:{date:'2026-08-10',classId:KELAS,semester:SEM,academicYear:TAHUN,statuses:{'lama-1':'Sakit'}}},
    learningObjectives:{[`${SCOPE}|mtk|tp-lama`]:{id:'tp-lama',code:'TP-1',description:'memahami pecahan.',order:1,active:true}},
    assessmentScores:{[`${SCOPE}|mtk|formative|lama-1`]:{studentId:'lama-1',score:77}},
    reportScores:{[`${SCOPE}|mtk|lama-1`]:{finalScore:77}},
    reportDescriptions:{},
    extracurricularScores:{[`${SCOPE}|lama-1|ex1`]:{id:'ex1',studentId:'lama-1',name:'Pramuka Penggalang',predicate:'Cukup',description:'Deskripsi lama.',order:1}},
    cocurricularActivities:{},cocurricularScores:{},attitudeProfiles:{},printSettings:{},
    homeroomNotes:{[`${SCOPE}|lama-1`]:{studentId:'lama-1',text:'Catatan individual lama.'}},
    promotionStatus:{},graduationStatus:{},transcriptScores:{},
    backupHistory:[],migrationHistory:[],
  };
}

/* Urutan startup persis seperti src/app.js. */
function jalankanUpdate(){
  const hasil={};
  hasil.migrasi=runAppMigrations();
  hasil.mapel=ensureDefaultSubjects();
  hasil.seed=seedInitialStudents();
  return hasil;
}

function pasangDatabaseLama(options){useMemoryStorage();localStorage.setItem(storageKey(),JSON.stringify(databaseLama(options)));}

function dataLamaUtuh(){
  const db=loadDb();
  assert.equal(db.students[`${SCOPE}|lama-1`].name,'Siswa Lama Guru','siswa buatan guru utuh');
  assert.equal(db.attendance[`${SCOPE}|2026-08-10`].statuses['lama-1'],'Sakit','absensi utuh');
  assert.equal(db.assessmentScores[`${SCOPE}|mtk|formative|lama-1`].score,77,'nilai utuh');
  assert.equal(db.reportScores[`${SCOPE}|mtk|lama-1`].finalScore,77,'nilai rapor utuh');
  assert.equal(db.learningObjectives[`${SCOPE}|mtk|tp-lama`].description,'memahami pecahan.','TP utuh');
  assert.equal(db.assessmentSettings[`${SCOPE}|mtk`].kktp,68,'bobot dan KKTP utuh');
  assert.equal(db.homeroomNotes[`${SCOPE}|lama-1`].text,'Catatan individual lama.','catatan wali kelas utuh');
  assert.equal(db.extracurricularScores[`${SCOPE}|lama-1|ex1`].predicate,'Cukup','predikat lama tetap terbaca');
  assert.equal(db.userAccounts['teacher:5B'].username,'Guru5B','akun guru utuh');
}

for(const schemaLama of [1,2,3]){
  test(`Update dari instalasi lama schema ${schemaLama}: data utuh dan revisi 1.1.0 aktif`,()=>{
    pasangDatabaseLama({appSchemaVersion:schemaLama,appVersion:schemaLama===3?'1.1.0':'1.0.0'});
    const hasil=jalankanUpdate();

    assert.equal(hasil.migrasi.migrated,true,'migration berjalan pada pengguna yang sudah punya data');
    assert.equal(loadDb().appSchemaVersion,APP_SCHEMA_VERSION,'penanda schema diperbarui setelah sukses');
    assert.equal(loadDb().appVersion,APP_VERSION);

    dataLamaUtuh();

    const mapping=getSubjectMapping(sesi);
    assert.ok(mapping.some(item=>item.id==='seni_rupa'),'Seni Rupa masuk ke Mapping lama');
    assert.ok(loadDb().masterData.references.subjects.some(item=>item.id==='seni_rupa'),'Seni Rupa masuk ke master');
    assert.deepEqual(mapping.filter(item=>item.active).map(item=>item.id).sort(),['agama','bindo','mtk'].sort(),'status aktif pilihan guru tidak berubah');
    assert.equal(mapping.find(item=>item.id==='seni_rupa').active,false,'mapel baru masuk nonaktif agar Leger dan kelengkapan rapor berjalan tidak berubah');
    assert.equal(mapping.find(item=>item.id==='bindo').group,'B','pemindahan kelompok oleh guru dipertahankan');

    assert.equal(hasil.seed.seeded,STUDENTS_5B.length,'seed 5B masuk pada instalasi lama');
    const siswa=listStudents(sesi,{classId:KELAS});
    assert.equal(siswa.length,STUDENTS_5B.length+1,'siswa lama tetap ada bersama 33 siswa seed');
    assert.equal(new Set(siswa.map(item=>item.nisn)).size,siswa.length,'tidak ada NISN duplikat');
  });
}

test('Menjalankan update dua kali tidak menduplikasi dan hasilnya sama',()=>{
  pasangDatabaseLama();
  jalankanUpdate();
  const setelahSekali=loadDb();
  const jumlahSekali=listStudents(sesi,{classId:KELAS}).length;

  const kedua=jalankanUpdate();
  const setelahDua=loadDb();

  assert.equal(kedua.migrasi.migrated,false,'schema sudah terbaru, migration tidak diulang');
  assert.equal(kedua.mapel.repairedMappings,0,'mapel bawaan tidak disisipkan dua kali');
  assert.equal(kedua.seed.seeded,0,'seed tidak menambah data pada jalan kedua');
  assert.equal(listStudents(sesi,{classId:KELAS}).length,jumlahSekali,'jumlah siswa tetap');
  assert.deepEqual(Object.keys(setelahDua.students).sort(),Object.keys(setelahSekali.students).sort(),'kunci siswa identik');
  assert.deepEqual(getSubjectMapping(sesi).map(item=>item.id),Object.freeze([...getSubjectMapping(sesi).map(item=>item.id)]),'mapping stabil');
  dataLamaUtuh();
});

test('Seed melengkapi instalasi lama yang penandanya ada tetapi datanya belum masuk',()=>{
  pasangDatabaseLama();
  const db=loadDb();
  db.settings[SEED_FLAG_KEY]={completedAt:'2026-08-01T00:00:00.000Z'};
  localStorage.setItem(storageKey(),JSON.stringify(db));
  const hasil=seedInitialStudents();
  assert.equal(hasil.seeded,STUDENTS_5B.length,'penanda usang tidak menghalangi data awal masuk');
  assert.equal(seedStatus().count,STUDENTS_5B.length+1);
  assert.equal(seedInitialStudents().seeded,0,'jalan berikutnya tetap tidak menduplikasi');
});

test('Seed tidak menimpa dan tidak menggandakan siswa 5B buatan guru',()=>{
  const contoh=STUDENTS_5B[0];
  pasangDatabaseLama({students:{[`${SCOPE}|buatan-guru`]:{id:'buatan-guru',classId:KELAS,nis:contoh.nis,nisn:contoh.nisn,name:'Nama Diedit Guru',gender:'L',birthPlace:'Bekasi',birthDate:'2015-01-01',parentName:'Ortu',phone:'',address:'',academicYear:TAHUN,semester:SEM}}});
  const hasil=jalankanUpdate();
  assert.equal(hasil.seed.seeded,STUDENTS_5B.length-1,'baris yang NISN-nya sudah dipakai dilewati');
  const siswa=listStudents(sesi,{classId:KELAS});
  assert.equal(siswa.filter(item=>item.nisn===contoh.nisn).length,1,'tidak ada duplikat NISN');
  assert.equal(siswa.find(item=>item.nisn===contoh.nisn).name,'Nama Diedit Guru','perubahan guru tidak tertimpa');
});

test('Siswa seed yang dihapus guru tidak muncul kembali saat startup berikutnya',()=>{
  pasangDatabaseLama();
  jalankanUpdate();
  const db=loadDb();
  const kunci=Object.keys(db.students).find(key=>key.includes('seed-5b-'));
  delete db.students[kunci];
  localStorage.setItem(storageKey(),JSON.stringify(db));
  const sebelum=listStudents(sesi,{classId:KELAS}).length;
  assert.equal(seedInitialStudents().seeded,0,'baris yang sudah pernah masuk tidak diulang');
  assert.equal(listStudents(sesi,{classId:KELAS}).length,sebelum,'penghapusan oleh guru dihormati');
});

test('Pengaman mapel memperbaiki Mapping lama walau penanda schema sudah terbaru',()=>{
  pasangDatabaseLama({appSchemaVersion:APP_SCHEMA_VERSION});
  assert.equal(runAppMigrations().migrated,false,'schema sudah terbaru sehingga migration dilewati');
  assert.equal(getSubjectMapping(sesi).some(item=>item.id==='seni_rupa'),false,'kondisi awal memang belum ada Seni Rupa');
  const hasil=ensureDefaultSubjects();
  assert.equal(hasil.repairedMappings,1);
  assert.deepEqual(hasil.addedSubjects,['seni_rupa']);
  assert.ok(getSubjectMapping(sesi).some(item=>item.id==='seni_rupa'),'Seni Rupa tetap masuk lewat pengaman startup');
  assert.equal(ensureDefaultSubjects().repairedMappings,0,'pengaman idempotent');
  dataLamaUtuh();
});

test('Migration gagal mengembalikan database lama persis dan aplikasi tetap dapat dibuka',()=>{
  pasangDatabaseLama();
  const sebelum=localStorage.getItem(storageKey());
  assert.throws(()=>runAppMigrations({migrations:{3:()=>{throw new Error('uji gagal');}}}),/Migration gagal/);
  assert.equal(localStorage.getItem(storageKey()),sebelum,'database lama dipulihkan persis');
  assert.equal(runAppMigrations().migrated,true,'migration dapat dijalankan ulang dengan aman');
  assert.equal(loadDb().appSchemaVersion,APP_SCHEMA_VERSION);
  dataLamaUtuh();
});

test('Seni Rupa siap dipakai seluruh modul setelah update instalasi lama',async()=>{
  pasangDatabaseLama();
  jalankanUpdate();
  const db=loadDb();
  const mapping=db.subjectMappings[SCOPE];
  const seni=mapping.find(item=>item.id==='seni_rupa');
  assert.ok(seni,'ada pada Mapping dan siap diaktifkan guru');
  assert.equal(seni.active,false,'belum aktif supaya rombel berjalan tidak terganggu');
  assert.equal(listActiveSubjects(sesi).some(item=>item.id==='seni_rupa'),false);
  /* Setelah guru mengaktifkannya lewat Mapping, Seni Rupa langsung dipakai seluruh modul. */
  const { saveSubjectMapping }=await import('../src/services/storage.js');
  saveSubjectMapping(sesi,mapping.map(item=>item.id==='seni_rupa'?{...item,active:true}:item));
  assert.equal(listActiveSubjects(sesi).some(item=>item.id==='seni_rupa'),true,'ikut pada daftar mapel aktif yang dipakai Penilaian, TP, Bobot, Rapor, Transkrip, dan Leger');
  const { getLeger }=await import('../src/services/documents.js');
  assert.ok(getLeger(sesi).subjects.some(item=>item.id==='seni_rupa'),'Leger otomatis mengikuti');
});

/* ------------------------------------------------ Akar masalah: cache service worker */

test('Cache service worker terikat versi aplikasi sehingga rilis baru tidak memakai kode lama',()=>{
  const sw=read('sw.js');
  const versi=`${APP_VERSION}-${VERSION_CODE}`;
  assert.match(sw,new RegExp(`APP_CACHE_VERSION='${versi.replace('.','\\.')}'`),'nama cache wajib naik setiap rilis');
  assert.match(sw,/const CACHE=`erapor-satria-\$\{APP_CACHE_VERSION\}`/);
  assert.match(sw,/function isAppCode/,'kode aplikasi dibedakan dari aset berat');
  assert.match(sw,/isAppCode\(event\.request\.url\)\?networkFirst\(event\.request\):cacheFirst\(event\.request\)/,'JavaScript dan CSS diambil network-first');
  assert.equal(/caches\.match\(event\.request\)\.then\(cached=>cached\|\|fetch/.test(sw),false,'tidak boleh cache-first untuk seluruh aset');
  for(const berkas of ['./src/services/seed.js','./src/data/seed-5b.js'])
    assert.ok(sw.includes(berkas),`${berkas} ikut di-precache`);
});

test('Aplikasi mengaktifkan service worker baru dan memuat ulang sekali setelah update',()=>{
  const app=read('src/app.js');
  assert.match(app,/controllerchange/,'mendeteksi worker baru mengambil alih');
  assert.match(app,/location\.reload\(\)/,'memuat ulang sekali agar kode terbaru dipakai');
  assert.match(app,/postMessage\(\{type:'SKIP_WAITING'\}\)/,'worker baru tidak menunggu');
  assert.match(app,/registration\.update\(\)/);
  assert.ok(app.indexOf('runAppMigrations()')<app.indexOf('ensureDefaultSubjects()'),'migration dijalankan sebelum pengaman');
  assert.ok(app.indexOf('ensureDefaultSubjects()')<app.indexOf('seedInitialStudents()'));
});
