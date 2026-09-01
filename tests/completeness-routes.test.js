import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const SECTIONS=[['extra-input','extracurricular'],['cocurricular-input','cocurricular'],['intracurricular-input','intracurricular'],['homeroom-note','note'],['promotion-input','promotion']];

test('Route anak Input Kelengkapan membuka bagian yang sesuai',()=>{
  const app=read('src/app.js');
  for(const [route,section] of SECTIONS){
    assert.match(app,new RegExp(`case '${route}': return renderCompleteness\\(session,'${section}'\\)`),`${route} membuka bagian ${section}`);
  }
});

test('Update Data Siswa dan Kehadiran tetap halaman tersendiri',()=>{
  const app=read('src/app.js');
  assert.match(app,/case 'student-update': return renderStudents\(session\)/);
  assert.match(app,/case 'attendance': return renderAttendance\(session\)/);
  /* Halaman kelengkapan tidak lagi membawa salinan form Data Siswa: satu fitur satu halaman. */
  assert.doesNotMatch(read('src/pages/completeness.js'),/data-edit-student/);
});

test('Halaman kelengkapan menerima initialSection dan membatasi bagian yang sah',()=>{
  const page=read('src/pages/completeness.js');
  assert.match(page,/export function renderCompleteness\(session,initialSection='extracurricular'\)/);
  for(const [,section] of SECTIONS)assert.match(page,new RegExp(`'${section}'`),`bagian ${section} dikenali`);
  assert.match(page,/drawIntracurricular/);
  /* Bilah tab internal dibuang supaya sidebar menjadi satu-satunya sumber navigasi. */
  assert.doesNotMatch(page,/completeness-tabs/);
  assert.doesNotMatch(page,/data-tab=/);
});

test('Bagian Intrakurikuler memakai layanan Intrakurikuler, bukan Kokurikuler',()=>{
  const page=read('src/pages/completeness.js');
  assert.match(page,/saveStudentIntracurricular/);
  assert.match(page,/getStudentIntracurricular/);
  assert.match(page,/saveIntracurricularBulk\(session,input\(\),\{overwrite:false\}\)/);
  assert.match(page,/listAssignedIntracurricularActivities\(session\)/);
  assert.match(page,/data-intra-save/);assert.match(page,/data-intra-bulk/);
});

test('Setiap route anak kelengkapan punya tepat satu entri menu Guru',()=>{
  const menu=flattenNavigation('teacher').map(item=>item.route);
  for(const [route] of SECTIONS){
    assert.equal(menu.filter(item=>item===route).length,1,`${route} muncul sekali pada menu Guru`);
  }
});
