import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
/* Ekstrakurikuler, Kokurikuler, dan Intrakurikuler kini punya halaman input sederhana
   masing-masing. Halaman kelengkapan hanya menyisakan catatan wali kelas dan kenaikan kelas. */
const COMPLETENESS_SECTIONS=[['homeroom-note','note'],['promotion-input','promotion']];
const ACTIVITY_ROUTES=[['extra-input','renderExtracurricularInput'],['cocurricular-input','renderCocurricularInput'],['intracurricular-input','renderIntracurricularInput']];
const MENU_ROUTES=['extra-input','cocurricular-input','intracurricular-input','attitudes','homeroom-note','promotion-input'];

test('Route anak Input Kelengkapan membuka bagian yang sesuai',()=>{
  const app=read('src/app.js');
  for(const [route,section] of COMPLETENESS_SECTIONS){
    assert.match(app,new RegExp(`case '${route}': return renderCompleteness\\(session,'${section}'\\)`),`${route} membuka bagian ${section}`);
  }
  for(const [route,renderer] of ACTIVITY_ROUTES)
    assert.match(app,new RegExp(`case '${route}': return ${renderer}\\(session\\)`),`${route} memakai halaman input tersendiri`);
  assert.match(app,/case 'attitudes': return renderAttitudes\(session\)/,'Penilaian Sikap tetap memakai renderer khusus');
});

test('Update Data Siswa dan Kehadiran tetap halaman tersendiri',()=>{
  const app=read('src/app.js');
  assert.match(app,/case 'student-update': return renderStudents\(session\)/);
  assert.match(app,/case 'attendance': return renderAttendance\(session\)/);
  assert.doesNotMatch(read('src/pages/completeness.js'),/data-edit-student/);
});

test('Halaman kelengkapan menerima initialSection dan membatasi bagian yang sah',()=>{
  const page=read('src/pages/completeness.js');
  assert.match(page,/export function renderCompleteness\(session,initialSection='note'\)/);
  for(const [,section] of COMPLETENESS_SECTIONS)assert.match(page,new RegExp(`'${section}'`),`bagian ${section} dikenali`);
  assert.doesNotMatch(page,/completeness-tabs/);
  assert.doesNotMatch(page,/data-tab=/);
});

test('Setiap halaman input kegiatan memakai pola dan layanan yang sama',()=>{
  for(const [label,path,layanan] of [
    /* Layanan halamannya berganti mengikuti pola Intrakurikuler yang berlaku sekarang:
       previewAll* menyusun draf tanpa menyimpan, saveAll* menyimpannya. Fungsi per siswa
       tetap ada di layanan dan tetap diuji di suite kegiatan; halaman tidak memakainya lagi. */
    ['Ekstrakurikuler','src/pages/extracurricular-input.js',['previewAllExtracurricular','saveAllExtracurricular','listExtracurriculars']],
    ['Kokurikuler','src/pages/cocurricular-input.js',['previewAllCocurricular','saveAllCocurricular','getStudentCocurricular']],
  ]){
    const page=read(path);
    for(const fungsi of layanan)assert.match(page,new RegExp(fungsi),`${label} memakai ${fungsi}`);
    assert.match(page,/data-generate-description/,`${label} punya Generate Deskripsi Otomatis`);
  }
});

test('Input Nilai Intrakurikuler memakai layanan Intrakurikuler pada renderer stabil',()=>{
  const page=read('src/pages/intracurricular-input.js');
  assert.match(page,/saveStudentIntracurricular/);
  assert.match(page,/getStudentIntracurricular/);
  assert.match(page,/saveIntracurricularBulk/);
  assert.match(page,/listAssignedIntracurricularActivities\(session\)/);
});

test('Setiap route anak kelengkapan punya tepat satu entri menu Guru',()=>{
  const menu=flattenNavigation('teacher').map(item=>item.route);
  for(const route of MENU_ROUTES){
    assert.equal(menu.filter(item=>item===route).length,1,`${route} muncul sekali pada menu Guru`);
  }
});
