import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR } from '../src/data/constants.js';
import {
  isReportPublished, listPublishedReports, publicationKey, publishReport, unpublishReport
} from '../src/services/publications.js';
import { getPrintSettings, savePrintSettings } from '../src/services/print-settings.js';
import { createStudent } from '../src/services/students.js';
import { loadDb } from '../src/services/storage.js';

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};globalThis.sessionStorage=globalThis.localStorage;}
const ganjil=`Ganjil ${ACADEMIC_YEAR}`,genap=`Genap ${ACADEMIC_YEAR}`;
const teacher5b={role:'teacher',classId:'5B',academicYear:ACADEMIC_YEAR,semester:ganjil};
const teacher5c={...teacher5b,classId:'5C'};
function siswa(session,index=1){return createStudent(session,{classId:session.classId,nis:`NIS-${session.classId}-${index}`,nisn:`88${[...session.classId].map(character=>character.charCodeAt(0)).join('')}${String(index).padStart(4,'0')}`,name:`Siswa Publikasi ${index}`,gender:'L',religion:'Islam',photo:''});}

test('Publikasi tercakup per rombel, periode, siswa, dan jenis dokumen',()=>{
  useMemoryStorage();
  const student=siswa(teacher5b);
  const publication=publishReport(teacher5b,student.id,'report');
  assert.equal(publication.studentId,student.id);
  assert.equal(publication.documentType,'report');
  assert.equal(publication.classId,'5B');
  assert.equal(isReportPublished(teacher5b,student.id,'report'),true);
  assert.equal(isReportPublished(teacher5b,student.id,'supplement'),false);
  assert.equal(isReportPublished({...teacher5b,semester:genap},student.id,'report'),false);
  assert.equal(unpublishReport(teacher5b,student.id,'report'),true);
  assert.equal(isReportPublished(teacher5b,student.id,'report'),false);
  assert.equal(unpublishReport(teacher5b,student.id,'report'),false);
});

test('Jenis dokumen dan sesi publikasi divalidasi',()=>{
  useMemoryStorage();
  const student=siswa(teacher5b);
  assert.throws(()=>publicationKey(teacher5b,student.id,'lainnya'),/Jenis dokumen/);
  assert.throws(()=>publicationKey({role:'admin'},student.id,'report'),/Guru/);
  assert.throws(()=>publishReport(teacher5b,'siswa-tidak-ada','report'),/tidak ditemukan/);
  for(const jenis of ['supplement','report','transcript'])assert.ok(publicationKey(teacher5b,student.id,jenis).endsWith(`|${jenis}`));
});

test('Daftar publikasi hanya memuat scope aktif',()=>{
  useMemoryStorage();
  const pertama=siswa(teacher5b,1),kedua=siswa(teacher5b,2),lain=siswa(teacher5c,1);
  publishReport(teacher5b,pertama.id,'report');
  publishReport(teacher5b,kedua.id,'transcript');
  publishReport(teacher5c,lain.id,'report');
  const daftar=listPublishedReports(teacher5b);
  assert.equal(daftar.length,2);
  assert.deepEqual([...new Set(daftar.map(item=>item.classId))],['5B']);
  assert.equal(listPublishedReports({...teacher5b,semester:genap}).length,0);
  assert.equal(Object.keys(loadDb().publishedReports).length,3);
});

test('Pengaturan cetak memvalidasi A4, margin, dan halaman pertama',()=>{
  useMemoryStorage();
  const saved=savePrintSettings(teacher5b,{
    principalName:'Kepala Sekolah',principalNip:'123',teacherName:'Wali Kelas',
    paperSize:'A4',marginLeftMm:20,marginRightMm:20,marginTopMm:20,
    marginBottomMm:10,signatureMode:'without-signature',
    principalPosition:'parallel',showTeacherName:true,firstPage:1
  });
  assert.equal(saved.paperSize,'A4');
  assert.equal(saved.marginBottomMm,10);
  assert.equal(saved.firstPage,1);
  assert.equal(saved.signatureMode,'without-signature');
  assert.equal(saved.principalPosition,'parallel');
  assert.equal(saved.showTeacherName,true);
  assert.equal(getPrintSettings(teacher5b).marginLeftMm,20);
});

test('Nilai cetak di luar batas dibulatkan ke rentang yang aman',()=>{
  useMemoryStorage();
  const saved=savePrintSettings(teacher5b,{
    principalName:'Kepala Sekolah',principalNip:'123',teacherName:'Wali Kelas',
    paperSize:'Kwarto',marginLeftMm:-5,marginRightMm:999,marginTopMm:'abc',
    marginBottomMm:50,signatureMode:'tidak-dikenal',principalPosition:'salah',
    showTeacherName:'ya',firstPage:0
  });
  assert.equal(saved.paperSize,'A4','ukuran tidak dikenal kembali ke A4');
  assert.equal(savePrintSettings(teacher5b,{principalName:'K',principalNip:'1',teacherName:'W',paperSize:'F4'}).paperSize,'F4','F4 termasuk ukuran yang didukung');
  assert.equal(saved.marginLeftMm,0);
  assert.equal(saved.marginRightMm,50);
  assert.equal(saved.marginTopMm,20,'nilai bukan angka memakai bawaan');
  assert.equal(saved.marginBottomMm,50);
  assert.equal(saved.signatureMode,'with-signature');
  assert.equal(saved.principalPosition,'parallel');
  assert.equal(saved.firstPage,1);
  const tinggi=savePrintSettings(teacher5b,{principalName:'K',principalNip:'1',teacherName:'W',firstPage:150});
  assert.equal(tinggi.firstPage,99);
});

test('Pengaturan cetak bawaan tetap lengkap sebelum pernah disimpan',()=>{
  useMemoryStorage();
  const bawaan=getPrintSettings(teacher5b);
  assert.equal(bawaan.paperSize,'A4');
  assert.equal(bawaan.marginTopMm,20);assert.equal(bawaan.marginBottomMm,20);
  assert.equal(bawaan.marginLeftMm,20);assert.equal(bawaan.marginRightMm,20);
  assert.equal(bawaan.signatureMode,'with-signature');
  assert.equal(bawaan.principalPosition,'parallel');
  assert.equal(bawaan.showTeacherName,true);
  assert.equal(bawaan.firstPage,1);
});

test('Backup Guru memuat publikasi scope aktif saja',async()=>{
  useMemoryStorage();
  const { buildBackup }=await import('../src/services/backup.js');
  const milik=siswa(teacher5b,1),lain=siswa(teacher5c,1);
  publishReport(teacher5b,milik.id,'report');
  publishReport(teacher5c,lain.id,'report');
  const backup=buildBackup(teacher5b);
  const kunci=Object.keys(backup.data.publishedReports||{});
  assert.equal(kunci.length,1);
  assert.equal(Object.values(backup.data.publishedReports)[0].studentId,milik.id);
  assert.equal(kunci.some(key=>key.includes('|5C|')),false,'tidak memuat rombel lain');
});
