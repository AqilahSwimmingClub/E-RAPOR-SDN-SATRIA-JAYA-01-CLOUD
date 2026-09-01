import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccessRoute, resolveRoute } from '../src/core/router.js';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const ROUTES=['reference-school','reference-teachers','reference-students','reference-classes','reference-subjects','reference-learning','reference-mapping','reference-branding','reference-report-date'];

test('Route anak Data Referensi milik Admin dan tertutup untuk Guru',()=>{
  const teacher={role:'teacher',classId:'5B'};
  for(const route of ROUTES){
    assert.equal(canAccessRoute(route,'admin'),true,`${route} terbuka untuk Admin`);
    assert.equal(canAccessRoute(route,'teacher'),false,`${route} tertutup untuk Guru`);
  }
  assert.equal(resolveRoute('reference-mapping',teacher),'dashboard');
  assert.equal(resolveRoute('reference-mapping',{role:'admin'}),'reference-mapping');
});

test('Setiap route referensi memanggil modul yang sudah ada secara eksplisit',()=>{
  const app=read('src/app.js');
  const kontrak=[
    ['reference-school',"renderReferences(session,'school')"],
    ['reference-teachers',"renderUsers(session,'teachers')"],
    ['reference-students',"renderStudents(session)"],
    ['reference-classes',"renderReferences(session,'classes')"],
    ['reference-subjects',"renderReferences(session,'subjects')"],
    ['reference-learning',"renderReferences(session,'learning')"],
    ['reference-mapping',"renderSubjectMapping(session)"],
    ['reference-branding',"renderReferences(session,'branding')"],
    ['reference-report-date',"renderReferences(session,'report-date')"]
  ];
  for(const [route,panggilan] of kontrak){
    assert.match(app,new RegExp(`case '${route}': return ${panggilan.replace(/[()'.]/g,'\\$&')};`),`${route} memanggil ${panggilan}`);
  }
});

test('Halaman referensi membatasi bagian yang sah dan tidak lagi memakai tab internal',()=>{
  const page=read('src/pages/references.js');
  assert.match(page,/export function renderReferences\(session,section='school'\)/);
  assert.match(page,/REFERENCE_SECTIONS/);
  for(const bagian of ['school','classes','subjects','learning','branding','report-date'])
    assert.match(page,new RegExp(`'${bagian}'`),`bagian ${bagian} dikenali`);
  assert.doesNotMatch(page,/data-tab=/);
  /* Data Guru memakai halaman Data Pengguna yang sudah ada, bukan store kedua. */
  assert.match(read('src/pages/users.js'),/export function renderUsers\(session,section='users'\)/);
});

test('Pengelolaan tahun pelajaran tetap dapat dijangkau Admin',()=>{
  const page=read('src/pages/references.js');
  assert.match(page,/createAcademicYear/,'Admin masih dapat menambah tahun pelajaran');
  assert.match(page,/drawPeriods\(\)/);
});

test('Menu Data Referensi Admin tidak punya entri ganda',()=>{
  const menu=flattenNavigation('admin').map(item=>item.route);
  for(const route of ROUTES)assert.equal(menu.filter(item=>item===route).length,1,`${route} muncul sekali`);
  assert.equal(flattenNavigation('teacher').some(item=>ROUTES.includes(item.route)),false,'menu Guru tidak memuat route referensi Admin');
});

test('Tanggal Rapor bawaan Admin dipakai rombel yang belum mengatur cetak sendiri',async()=>{
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  globalThis.sessionStorage=globalThis.localStorage;
  const { getSchoolMaster, saveSchoolMaster }=await import('../src/services/master.js');
  const { getPrintSettings }=await import('../src/services/print-settings.js');
  const { ACADEMIC_YEAR }=await import('../src/data/constants.js');
  const admin={role:'admin'};
  const guru={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`};
  assert.equal(getPrintSettings(guru).printDate,'');
  const sekolah=getSchoolMaster();
  saveSchoolMaster(admin,{...sekolah,reportDate:'2027-06-20',reportCity:'Bekasi'});
  const cetak=getPrintSettings(guru);
  assert.equal(cetak.printDate,'2027-06-20');
  assert.equal(cetak.city,'Bekasi');
  assert.match(cetak.printDateLabel,/Bekasi/);
  /* Identitas sekolah lain tidak boleh ikut terhapus saat menyimpan tanggal rapor. */
  assert.equal(getSchoolMaster().npsn,sekolah.npsn);
  assert.equal(getSchoolMaster().principalName,sekolah.principalName);
});
