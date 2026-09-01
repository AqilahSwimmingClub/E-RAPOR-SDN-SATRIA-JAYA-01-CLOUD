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

test('Input Nilai Intrakurikuler mengimpor master kegiatan yang dipakai renderer',()=>{
  const source=read('src/pages/completeness.js');
  assert.match(source,/import\s*\{[^}]*listAssignedIntracurricularActivities[^}]*\}\s*from\s*['"]\.\.\/services\/intracurricular\.js['"]/s);
  assert.match(source,/const kegiatan=listAssignedIntracurricularActivities\(session\)/);
});

test('setiap halaman selain Dashboard memiliki tombol Kembali global',()=>{
  const source=read('src/ui/layout.js');
  assert.match(source,/route!=='dashboard'/);
  assert.match(source,/data-back/);
  assert.match(source,/window\.history\.back\(\)/);
  assert.match(source,/onNavigate\('dashboard'\)/);
});
