import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ACADEMIC_YEAR, CLASSES } from '../src/data/constants.js';
import { getReportDocument } from '../src/services/documents.js';
import { getSchoolMaster, getTeacherProfile, listMasterClasses, listTeacherProfiles, saveSchoolMaster, saveTeacherProfile } from '../src/services/master.js';
import { createRecoverySnapshot, listRecoverySnapshots, previewRecoverySnapshot, restoreRecoverySnapshot } from '../src/services/snapshots.js';
import { createStudent } from '../src/services/students.js';

function memoryStorage(){const values=new Map();return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const admin={role:'admin',classId:null,semester:`Genap ${ACADEMIC_YEAR}`,academicYear:ACADEMIC_YEAR,accountId:'admin'};
const teacher={role:'teacher',classId:'5B',semester:`Genap ${ACADEMIC_YEAR}`,academicYear:ACADEMIC_YEAR,accountId:'teacher:5B'};

test('Master sekolah menyediakan 24 rombel dan profil Guru sesuai rombel',()=>{
  globalThis.localStorage=memoryStorage();globalThis.sessionStorage=memoryStorage();
  assert.deepEqual(listMasterClasses(),CLASSES);assert.equal(listTeacherProfiles().length,24);
  saveSchoolMaster(admin,{name:'SDN Contoh Nusantara 02',principalName:'Kepala Sekolah Uji',principalNip:'198001012006041001'});
  saveTeacherProfile(admin,'5B',{name:'Wali Kelas Lima B',nip:'198502022010012001',phone:'08123456789',email:'wali5b@example.test',photo:''});
  assert.equal(getSchoolMaster().name,'SDN Contoh Nusantara 02','nama sekolah mengikuti input Admin');assert.equal(getTeacherProfile('5B').classId,'5B');
  assert.throws(()=>saveTeacherProfile({...teacher,classId:'5A'},'5B',{name:'Tidak Diizinkan'}),/tidak berwenang/);
});

test('Nama dan NIP master otomatis masuk model dokumen rapor',()=>{
  globalThis.localStorage=memoryStorage();globalThis.sessionStorage=memoryStorage();
  saveSchoolMaster(admin,{name:'SDN Contoh Nusantara 02',principalName:'Kepala Sekolah Uji',principalNip:'198001012006041001'});
  saveTeacherProfile(admin,'5B',{name:'Wali Kelas Lima B',nip:'198502022010012001',phone:'',email:'',photo:''});
  const student=createStudent(teacher,{nis:'501',nisn:'0050000001',name:'Siswa Dokumen Master',gender:'L',birthPlace:'Bekasi',birthDate:'2015-01-01',fatherName:'Ayah',motherName:'Ibu',phone:'',address:'Satria Jaya',photo:''});
  const document=getReportDocument(teacher,student.id);
  assert.equal(document.master.school.principalName,'Kepala Sekolah Uji');assert.equal(document.master.school.principalNip,'198001012006041001');
  assert.equal(document.master.teacher.name,'Wali Kelas Lima B');assert.equal(document.master.teacher.nip,'198502022010012001');
});

test('Safety snapshot dapat dipreview dan memulihkan data lokal',()=>{
  globalThis.localStorage=memoryStorage();globalThis.sessionStorage=memoryStorage();
  saveSchoolMaster(admin,{name:'SDN Contoh Nusantara 02',principalName:'Nama Sebelum',principalNip:'111'});
  const snapshot=createRecoverySnapshot(admin,'Snapshot pengujian');
  assert.equal(listRecoverySnapshots(admin).length,1);assert.equal(previewRecoverySnapshot(admin,snapshot.id).reason,'Snapshot pengujian');
  saveSchoolMaster(admin,{name:'SDN Contoh Nusantara 02',principalName:'Nama Sesudah',principalNip:'222'});assert.equal(getSchoolMaster().principalName,'Nama Sesudah');
  restoreRecoverySnapshot(admin,snapshot.id);assert.equal(getSchoolMaster().principalName,'Nama Sebelum');assert.equal(listRecoverySnapshots(admin).length,2);
});

test('PWA memiliki manifest, ikon, offline shell, dan cache version final',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.ok(manifest.start_url.startsWith('./'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
  for(const icon of manifest.icons)assert.equal(existsSync(new URL(`../${icon.src.replace('./','')}`,import.meta.url)),true);
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');assert.match(sw,/const CACHE=`erapor-satria-\$\{APP_CACHE_VERSION\}`/,'nama cache mengikuti versi aplikasi');assert.match(sw,/OFFLINE_SHELL/);assert.match(sw,/caches\.match\(OFFLINE_SHELL\)/);
});
