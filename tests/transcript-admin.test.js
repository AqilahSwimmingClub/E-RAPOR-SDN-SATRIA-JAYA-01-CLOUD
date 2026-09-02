import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import {
  getDiplomaNumber, getTranscriptSettings, previewDiplomaNumberImport,
  saveDiplomaNumbers, saveTranscriptSettings
} from '../src/services/transcript-admin.js';
import { createStudent } from '../src/services/students.js';
import { saveTranscriptScores } from '../src/services/transcript.js';
import { loadDb } from '../src/services/storage.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};globalThis.sessionStorage=globalThis.localStorage;}
const genap=`Genap ${ACADEMIC_YEAR}`;
const admin={role:'admin',classId:null,accountId:'admin',academicYear:ACADEMIC_YEAR,semester:genap};
const guru6a={role:'teacher',classId:'6A',academicYear:ACADEMIC_YEAR,semester:genap};
function siswa(session,index,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${session.classId}-${index}`,nisn:`99${index}${String(index).padStart(6,'0')}`,name:`Siswa Transkrip ${index}`,gender:index%2?'L':'P',religion:'Islam',photo:'',...extra});}

test('Admin menyimpan setting transkrip dan nomor ijazah tanpa mengubah nilai transkrip',()=>{
  useMemoryStorage();
  const student=siswa(guru6a,1);
  saveTranscriptScores(guru6a,student.id,{agama:85},{partial:true});
  const sebelum=JSON.parse(JSON.stringify(loadDb().transcriptScores));
  saveTranscriptSettings(admin,{title:'Transkrip Nilai',identityGapMm:7,headerHeightMm:8,rowHeightMm:6,headerPercent:100});
  saveDiplomaNumbers(admin,[{studentId:student.id,number:'DN-01/2027'}]);
  assert.equal(getTranscriptSettings(admin).identityGapMm,7);
  assert.equal(getTranscriptSettings(admin).title,'Transkrip Nilai');
  assert.equal(getDiplomaNumber(admin,student.id).number,'DN-01/2027');
  assert.deepEqual(loadDb().transcriptScores,sebelum);
});

test('Guru tidak dapat mengubah administrasi transkrip',()=>{
  useMemoryStorage();
  assert.throws(()=>saveTranscriptSettings(guru6a,{title:'X'}),/Hanya Admin/);
  assert.throws(()=>saveDiplomaNumbers(guru6a,[{studentId:'x',number:'DN-01'}]),/Hanya Admin/);
  assert.throws(()=>previewDiplomaNumberImport(guru6a,[]),/Hanya Admin/);
});

test('Setting transkrip dibatasi rentang yang aman dan punya nilai bawaan',()=>{
  useMemoryStorage();
  const bawaan=getTranscriptSettings(admin);
  assert.equal(bawaan.title,'Transkrip Nilai');
  assert.equal(bawaan.identityGapMm,7);assert.equal(bawaan.headerHeightMm,8);
  assert.equal(bawaan.rowHeightMm,6);assert.equal(bawaan.headerPercent,100);
  const disimpan=saveTranscriptSettings(admin,{title:'',identityGapMm:999,headerHeightMm:0,rowHeightMm:99,headerPercent:10});
  assert.equal(disimpan.title,'Transkrip Nilai');
  assert.equal(disimpan.identityGapMm,30);assert.equal(disimpan.headerHeightMm,4);
  assert.equal(disimpan.rowHeightMm,20);assert.equal(disimpan.headerPercent,50);
});

test('Nomor ijazah tidak boleh kembar dalam satu tahun pelajaran',()=>{
  useMemoryStorage();
  const pertama=siswa(guru6a,1),kedua=siswa(guru6a,2);
  saveDiplomaNumbers(admin,[{studentId:pertama.id,number:'DN-01/2027'}]);
  assert.throws(()=>saveDiplomaNumbers(admin,[{studentId:kedua.id,number:'DN-01/2027'}]),/sudah dipakai/);
  assert.throws(()=>saveDiplomaNumbers(admin,[{studentId:pertama.id,number:'DN-02/2027'},{studentId:kedua.id,number:'DN-02/2027'}]),/sudah dipakai/);
  /* Memperbarui nomor siswa yang sama dengan nomornya sendiri tetap boleh. */
  assert.equal(saveDiplomaNumbers(admin,[{studentId:pertama.id,number:'DN-01/2027'}])[0].number,'DN-01/2027');
  assert.equal(getDiplomaNumber(admin,kedua.id),null);
});

test('Import nomor ijazah mencocokkan NISN lebih dulu lalu id siswa',()=>{
  useMemoryStorage();
  const pertama=siswa(guru6a,1),kedua=siswa(guru6a,2);
  const preview=previewDiplomaNumberImport(admin,[
    {nisn:pertama.nisn,number:'DN-11/2027'},
    {studentId:kedua.id,number:'DN-12/2027'},
    {nisn:'tidak-ada',number:'DN-13/2027'},
    {nisn:pertama.nisn,number:''}
  ]);
  assert.equal(preview.rows.length,4);
  assert.equal(preview.validCount,2);
  assert.equal(preview.invalidCount,2);
  assert.equal(preview.rows[0].studentId,pertama.id);
  assert.equal(preview.rows[1].studentId,kedua.id);
  assert.match(preview.rows[2].errors.join(' '),/tidak ditemukan/);
  assert.match(preview.rows[3].errors.join(' '),/Nomor ijazah/);
  assert.equal(preview.canCommit,true);
  /* Preview tidak menulis apa pun sebelum dikonfirmasi. */
  assert.equal(getDiplomaNumber(admin,pertama.id),null);
  saveDiplomaNumbers(admin,preview.rows.filter(row=>row.valid).map(row=>({studentId:row.studentId,number:row.number})));
  assert.equal(getDiplomaNumber(admin,pertama.id).number,'DN-11/2027');
});

test('Nomor ijazah tersimpan per tahun pelajaran',()=>{
  useMemoryStorage();
  const student=siswa(guru6a,1);
  saveDiplomaNumbers(admin,[{studentId:student.id,number:'DN-01/2027'}]);
  assert.equal(getDiplomaNumber({...admin,academicYear:'2030/2031'},student.id),null);
  assert.equal(getDiplomaNumber(admin,student.id).academicYear,ACADEMIC_YEAR);
});

test('Route transkrip Admin dan Guru terpisah dan memakai halaman yang sesuai',async()=>{
  const { readFileSync }=await import('node:fs');
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const kontrak=[
    ["transcript-number-import","renderTranscriptAdmin(session,'numbers')"],
    ["transcript-settings","renderTranscriptAdmin(session,'settings')"],
    ["transcript-mapping","renderSubjectMapping(session)"],
    ["transcript-import","renderTranscript(session,'import')"],
    ["transcript-print","renderTranscript(session,'preview')"]
  ];
  for(const [route,panggilan] of kontrak){
    assert.match(app,new RegExp(`case '${route}': return ${panggilan.replace(/[()'.]/g,'\\$&')};`),`${route} memanggil ${panggilan}`);
  }
  /* Input transkrip Admin memilih rombel lebih dulu, Guru langsung ke rombelnya sendiri. */
  assert.match(app,/case 'transcript-input': return session\.role==='admin'\?renderTranscriptAdmin\(session,'input'\):renderTranscript\(session,'input'\);/);
  const halaman=readFileSync(new URL('../src/pages/transcript.js',import.meta.url),'utf8');
  assert.match(halaman,/export function renderTranscript\(session,mode='input'\)/);
  assert.doesNotMatch(halaman,/data-tab=/);
});
