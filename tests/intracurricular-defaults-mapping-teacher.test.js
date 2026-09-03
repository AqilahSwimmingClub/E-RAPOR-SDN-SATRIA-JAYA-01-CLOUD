import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultIntracurricularActivities, generateIntracurricularDescription } from '../src/data/intracurricular-defaults.js';
import { navigationForRole } from '../src/data/navigation.js';
import { canAccessRoute } from '../src/core/router.js';

const root=new URL('../',import.meta.url);const read=path=>readFileSync(new URL(path,root),'utf8');

test('setiap kelas SD 1-6 mempunyai kegiatan intrakurikuler bawaan',()=>{
  for(const grade of [1,2,3,4,5,6]){
    const list=defaultIntracurricularActivities(`${grade}A`);
    assert.ok(list.length>=6,`kelas ${grade} memiliki sedikitnya 6 kegiatan`);
    assert.ok(list.every(item=>item.name&&item.description&&item.phase),`kelas ${grade} memiliki metadata lengkap`);
  }
});

test('generator deskripsi menghasilkan kalimat berdasarkan kegiatan dan predikat',()=>{
  const activity=defaultIntracurricularActivities('5B')[0];
  const good=generateIntracurricularDescription({studentName:'Aqilah',activity,predicate:'Sangat Baik'});
  const enough=generateIntracurricularDescription({studentName:'Aqilah',activity,predicate:'Cukup'});
  assert.match(good,/Aqilah/);
  assert.match(good,new RegExp(activity.name.split(' ')[0],'i'));
  assert.notEqual(good,enough);
});

test('halaman input intrakurikuler memakai kegiatan bawaan dan tombol generate deskripsi',()=>{
  const page=read('src/pages/intracurricular-input.js');
  assert.match(page,/defaultIntracurricularActivities/);
  assert.match(page,/generateIntracurricularDescription/);
  assert.match(page,/data-generate-description/);
});

test('Mapping Mata Pelajaran menjadi konfigurasi master milik Admin',()=>{
  /* Guru memakai hasil mapping lewat layanan mata pelajaran, bukan mengaturnya sendiri. */
  const adminItems=navigationForRole('admin').flatMap(group=>group.children);
  assert.ok(adminItems.some(item=>item.route==='reference-mapping'&&item.label==='Mapping Mata Pelajaran'));
  assert.equal(canAccessRoute('reference-mapping','admin'),true);
  const teacherItems=navigationForRole('teacher').flatMap(group=>group.children);
  assert.equal(teacherItems.some(item=>item.route==='reference-mapping'),false);
});

test('mapping guru tetap tersimpan pada scope rombel guru sendiri',()=>{
  const storage=read('src/services/storage.js');
  assert.match(storage,/session\.role === 'admin' \? 'ALL' : session\.classId/);
  assert.match(storage,/db\.subjectMappings\[mappingKey\(session\)\]/);
});
