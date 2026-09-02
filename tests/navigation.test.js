import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenNavigation, navigationForRole } from '../src/data/navigation.js';

test('teacher Input Kelengkapan children use the approved order',()=>{
  const group=navigationForRole('teacher').find(item=>item.id==='completeness');
  assert.deepEqual(group.children.map(item=>item.label),[
    'Update Data Siswa','Serah Terima Siswa','Input Nilai Ekskul','Input Nilai Kokurikuler',
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

test('teacher menu keeps one Mapping entry and no deprecated Dimensi Penilaian entry',()=>{
  const items=flattenNavigation('teacher');
  const labels=items.map(item=>item.label);
  /* Mapping Mata Pelajaran memang disediakan untuk akun Guru. Yang dijaga adalah entrinya
     tunggal dan memakai route kanonik yang sama dengan milik Admin, bukan route duplikat. */
  assert.equal(labels.filter(label=>label==='Mapping Mata Pelajaran').length,1);
  assert.equal(items.filter(item=>item.route==='reference-mapping').length,1);
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
