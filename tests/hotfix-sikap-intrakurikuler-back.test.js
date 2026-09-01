import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenNavigation } from '../src/data/navigation.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('menu guru menampilkan Penilaian Sikap',()=>{
  const item=flattenNavigation('teacher').find(entry=>entry.route==='attitudes');
  assert.ok(item,'route attitudes tersedia untuk guru');
  assert.equal(item.label,'Penilaian Sikap');
});

test('Input Nilai Intrakurikuler memakai renderer stabil dan master kegiatan sesuai scope guru',()=>{
  const app=read('src/app.js');
  const page=read('src/pages/intracurricular-input.js');
  assert.match(app,/import \{ renderIntracurricularInput \} from '\.\/pages\/intracurricular-input\.js';/);
  assert.match(app,/case 'intracurricular-input': return renderIntracurricularInput\(session\);/);
  assert.match(page,/listAssignedIntracurricularActivities/);
  assert.match(page,/getStudentIntracurricular/);
  assert.match(page,/saveStudentIntracurricular/);
});

test('setiap halaman selain Dashboard memiliki tombol Kembali global',()=>{
  const source=read('src/ui/layout.js');
  assert.match(source,/route!=='dashboard'/);
  assert.match(source,/data-back/);
  assert.match(source,/window\.history\.back\(\)/);
  assert.match(source,/onNavigate\('dashboard'\)/);
});
