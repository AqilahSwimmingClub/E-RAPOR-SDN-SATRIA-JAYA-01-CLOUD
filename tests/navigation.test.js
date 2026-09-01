import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenNavigation, navigationForRole } from '../src/data/navigation.js';

test('teacher Input Kelengkapan children use the approved order',()=>{
  const group=navigationForRole('teacher').find(item=>item.id==='completeness');
  assert.deepEqual(group.children.map(item=>item.label),[
    'Update Data Siswa','Input Nilai Ekskul','Input Nilai Kokurikuler',
    'Input Nilai Intrakurikuler','Penilaian Sikap','Input Catatan Wali Kelas','Input Kenaikan Kelas'
  ]);
});

test('teacher penilaian group contains attendance assessment and weight tools only',()=>{
  const group=navigationForRole('teacher').find(item=>item.id==='legacy-assessment');
  assert.deepEqual(group.children.map(item=>[item.route,item.label]),[
    ['attendance','Absensi'],['assessment','Penilaian'],['weights','Bobot Penilaian']
  ]);
});

test('each role has one canonical menu entry per route',()=>{
  for(const role of ['admin','teacher']){
    const routes=flattenNavigation(role).map(item=>item.route);
    assert.equal(new Set(routes).size,routes.length);
  }
});

test('teacher menu has no separate Mapping or deprecated Dimensi Penilaian entry',()=>{
  const labels=flattenNavigation('teacher').map(item=>item.label);
  assert.equal(labels.includes('Mapping Mata Pelajaran'),false);
  assert.equal(labels.includes('Dimensi Penilaian'),false);
});

test('navigation helpers return mutable clones without changing the canonical model',()=>{
  const first=navigationForRole('teacher');
  first[0].label='Diubah';
  first[0].children[0].label='Diubah';
  const second=navigationForRole('teacher');
  assert.equal(second[0].label,'UTAMA');
  assert.equal(second[0].children[0].label,'Dashboard');
});
