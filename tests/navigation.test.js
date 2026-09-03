import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenNavigation, navigationForRole } from '../src/data/navigation.js';

/* Menu Guru disusun mengikuti pekerjaan rombel: data kelas, pembelajaran, kegiatan,
   kehadiran, lalu rapor. Kelompoknya tetap, isinya yang dijaga di sini. */
test('teacher KEGIATAN group holds the three activity inputs',()=>{
  const group=navigationForRole('teacher').find(item=>item.id==='teacher-activities');
  assert.deepEqual(group.children.map(item=>[item.route,item.label]),[
    ['intracurricular-input','Intrakurikuler'],
    ['cocurricular-input','Kokurikuler'],
    ['extra-input','Ekstrakurikuler']
  ]);
});

test('teacher PEMBELAJARAN group holds TP, KKTP, and assessment tools',()=>{
  const group=navigationForRole('teacher').find(item=>item.id==='teacher-learning');
  assert.deepEqual(group.children.map(item=>[item.route,item.label]),[
    ['objectives','Tujuan Pembelajaran'],['weights','KKTP'],
    ['assessment','Penilaian'],['attitudes','Penilaian Sikap']
  ]);
  const kehadiran=navigationForRole('teacher').find(item=>item.id==='teacher-attendance');
  assert.deepEqual(kehadiran.children.map(item=>[item.route,item.label]),[
    ['attendance','Absensi Siswa']
  ]);
});

test('each role has one canonical menu entry per route',()=>{
  for(const role of ['admin','teacher']){
    const routes=flattenNavigation(role).map(item=>item.route);
    assert.equal(new Set(routes).size,routes.length);
  }
});

test('teacher menu leaves master configuration to Admin',()=>{
  const items=flattenNavigation('teacher');
  const labels=items.map(item=>item.label);
  /* Mapping Mata Pelajaran adalah konfigurasi master milik Admin; Guru memakai hasilnya,
     bukan mengaturnya sendiri. */
  assert.equal(items.some(item=>item.route==='reference-mapping'),false);
  assert.equal(flattenNavigation('admin').filter(item=>item.route==='reference-mapping').length,1);
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
