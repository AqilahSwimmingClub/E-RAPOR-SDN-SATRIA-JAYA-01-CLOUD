import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('student page exposes manual origin and teacher class restrictions',async()=>{
  const source=await readFile(new URL('../src/pages/students.js',import.meta.url),'utf8');
  assert.match(source,/Input Manual Guru/);
  assert.match(source,/Input Manual Admin/);
  assert.match(source,/session\.classId/);
  assert.match(source,/student-origin/);
});

test('student-update route renders the student management page',async()=>{
  const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(source,/case 'student-update'/);
  assert.match(source,/renderStudents\(session\)/);
});

test('Dapodik students use non-destructive deactivation copy',async()=>{
  const source=await readFile(new URL('../src/pages/students.js',import.meta.url),'utf8');
  assert.match(source,/Nonaktifkan/);
  assert.match(source,/deactivateStudent/);
});
