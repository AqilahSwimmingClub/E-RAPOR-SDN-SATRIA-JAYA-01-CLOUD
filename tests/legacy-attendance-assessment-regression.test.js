import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';
import { canonicalRoute, canAccessRoute } from '../src/core/router.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('menu guru kembali menyediakan Absensi dan Penilaian lama',()=>{
  const menu=flattenNavigation('teacher');
  const attendance=menu.find(item=>item.route==='attendance');
  const assessment=menu.find(item=>item.route==='assessment');
  assert.equal(attendance?.label,'Absensi');
  assert.equal(assessment?.label,'Penilaian');
});

test('route assessment lama tidak dialihkan ke Input Nilai Rapor',()=>{
  assert.equal(canonicalRoute('assessment','teacher'),'assessment');
  assert.equal(canAccessRoute('assessment','teacher'),true);
});

test('renderer lama tetap dipakai agar data assessmentScores yang sudah tersimpan terbaca',()=>{
  const app=read('src/app.js');
  assert.match(app,/case 'assessment': return renderAssessment\(session\);/);
  assert.match(app,/case 'attendance': return renderAttendance\(session\);/);
});

test('storage key lama tidak berubah sehingga data HP lama tidak dipindah atau dihapus',()=>{
  const storage=read('src/services/storage.js');
  assert.match(storage,/const DB_KEY = 'erapor_satria_jaya_01_v1';/);
  assert.doesNotMatch(storage,/localStorage\.clear\(|removeItem\(DB_KEY\)/);
});
