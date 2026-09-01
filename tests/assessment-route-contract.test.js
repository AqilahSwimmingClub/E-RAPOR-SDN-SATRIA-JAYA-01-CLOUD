import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

/* Setiap route kanonik memanggil mesin yang sudah ada dengan mode eksplisit, bukan halaman baru. */
const KONTRAK=[
  ['report-input',"renderReportInput(session,'input')"],
  ['report-import',"renderReportInput(session,'import')"],
  ['saved-scores',"renderSavedScores(session,'scores')"],
  ['saved-descriptions',"renderSavedScores(session,'descriptions')"],
  ['teacher-status',"renderAssessmentCheck(session,'status')"],
  ['teacher-achievement',"renderAssessmentCheck(session,'achievement')"],
  ['teacher-score-graph',"renderAssessmentCheck(session,'graph')"],
  ['class-status',"renderClassCheck(session,'status')"],
  ['class-statistics',"renderClassCheck(session,'statistics')"],
  ['student-progress',"renderProgress(session,'progress')"],
  ['student-progress-graph',"renderProgress(session,'graph')"],
  ['admin-progress',"renderProgress(session,'progress')"],
  ['admin-progress-graph',"renderProgress(session,'graph')"],
  ['assessment-status',"renderAdminStatus(session,'status')"],
  ['assessment-statistics',"renderAdminStatus(session,'statistics')"]
];

test('Route penilaian kanonik memakai mesin yang sudah ada dengan mode eksplisit',()=>{
  const app=read('src/app.js');
  for(const [route,panggilan] of KONTRAK){
    const pola=new RegExp(`case '${route}': return ${panggilan.replace(/[()'.]/g,'\\$&')};`);
    assert.match(app,pola,`${route} memanggil ${panggilan}`);
  }
});

test('Setiap renderer membatasi mode yang sah dan punya mode bawaan',()=>{
  const berkas=[
    ['src/pages/reports.js',[['renderReportInput',"'input'"],['renderSavedScores',"'scores'"],['renderAssessmentCheck',"'status'"]]],
    ['src/pages/class-overview.js',[['renderClassCheck',"'status'"]]],
    ['src/pages/progress.js',[['renderProgress',"'progress'"]]],
    ['src/pages/admin-status.js',[['renderAdminStatus',"'status'"]]]
  ];
  for(const [path,fungsi] of berkas){
    const source=read(path);
    for(const [nama,bawaan] of fungsi){
      assert.match(source,new RegExp(`export function ${nama}\\(session,mode=${bawaan.replace(/'/g,"'")}\\)`),`${nama} punya mode bawaan ${bawaan}`);
    }
    /* Mode yang tidak dikenal tidak boleh membuat halaman kosong tanpa isi. */
    assert.match(source,/MODES|MODE_/,`${path} menyimpan daftar mode yang sah`);
  }
});

test('Tidak ada bilah tab internal yang menduplikasi entri sidebar',()=>{
  const menuGuru=new Set(flattenNavigation('teacher').map(item=>item.route));
  const menuAdmin=new Set(flattenNavigation('admin').map(item=>item.route));
  for(const path of ['src/pages/class-overview.js','src/pages/progress.js']){
    assert.doesNotMatch(read(path),/data-tab=/,`${path} tidak lagi memakai tab internal`);
  }
  /* Import Nilai Rapor punya entri sidebar sendiri, jadi tidak boleh jadi tab di halaman input. */
  assert.ok(menuGuru.has('report-import')&&menuGuru.has('report-input'));
  assert.doesNotMatch(read('src/pages/reports.js'),/data-tab="import"/);
  assert.ok(menuAdmin.has('assessment-statistics'));
});

test('Route kanonik penilaian tetap unik pada kedua menu',()=>{
  for(const role of ['admin','teacher']){
    const routes=flattenNavigation(role).map(item=>item.route);
    assert.equal(new Set(routes).size,routes.length,`menu ${role} tidak punya route ganda`);
  }
});
