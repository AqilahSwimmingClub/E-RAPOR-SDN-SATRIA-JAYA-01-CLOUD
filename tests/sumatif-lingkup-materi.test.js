import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ASSESSMENT_TYPES, SCOPE_SUMMATIVE_PARTS, SCOPE_SUMMATIVE_TYPE, getAssessmentSheet, saveAssessmentScores, saveAssessmentSettings, scopeSummativeAverage } from '../src/services/assessment.js';
import { ASSESSMENT_HEADERS, assessmentTemplateWorkbook, commitAssessmentImport, previewAssessmentImport } from '../src/services/assessment-import.js';
import { createWorkbookBytes, readWorkbookRows } from '../src/services/excel.js';
import { getLeger, getReportDocument } from '../src/services/documents.js';
import { getStoredReportRows, saveAutomaticReportScores, visibleStoredReportRows } from '../src/services/report.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, storageKey } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
let simpanan=new Map();
function pasang(){globalThis.localStorage={getItem:key=>simpanan.has(key)?simpanan.get(key):null,setItem:(key,value)=>simpanan.set(key,String(value)),removeItem:key=>simpanan.delete(key),clear:()=>simpanan.clear()};invalidateDbCache();}
function useMemoryStorage(){simpanan=new Map();pasang();}
function bukaUlang(){const isi=simpanan.get(storageKey());simpanan=new Map([[storageKey(),isi]]);pasang();}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`)=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Kp. Gebang',photo:'',...extra});}
const KOL={formative:3,daily:4,practice:5,lm1:6,lm2:7,lm3:8,lm4:9,lm5:10,semesterSummative:11,id:12};
const templateRows=(session,subjectId)=>readWorkbookRows(assessmentTemplateWorkbook(session,subjectId));
const importRows=(session,subjectId,rows)=>previewAssessmentImport(session,subjectId,createWorkbookBytes('Nilai',rows));
const barisLingkup=(session,subjectId,studentId)=>getAssessmentSheet(session,subjectId,SCOPE_SUMMATIVE_TYPE).rows.find(row=>row.studentId===studentId);

/* --------------------------------------------------------- Nilai per bab dan rata-ratanya */

test('1. Sumatif Lingkup Materi memakai lima kolom LM sesuai Daftar Nilai',()=>{
  assert.deepEqual(SCOPE_SUMMATIVE_PARTS.map(part=>part.label),['LM1','LM2','LM3','LM4','LM5']);
  assert.equal(SCOPE_SUMMATIVE_TYPE,'scopeSummative');
  assert.equal(ASSESSMENT_TYPES.length,5,'tetap lima komponen penilaian');
});

test('2. Rata-rata lingkup materi dihitung dari lingkup yang terisi saja',()=>{
  assert.equal(scopeSummativeAverage({lm1:80,lm2:90,lm3:85}),85,'(80+90+85)/3');
  assert.equal(scopeSummativeAverage({lm1:80,lm2:90,lm3:85,lm4:90,lm5:80}),85);
  assert.equal(scopeSummativeAverage({lm2:70}),70,'satu bab terisi menghasilkan nilai bab itu');
  assert.equal(scopeSummativeAverage({}),null,'belum ada bab yang dinilai');
  assert.equal(scopeSummativeAverage({lm1:75,lm2:80}),77.5,'dibulatkan dua angka di belakang koma');
});

test('3. Nilai tiap bab tersimpan dan rata-ratanya menjadi nilai komponen',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentScores(session,'mtk',SCOPE_SUMMATIVE_TYPE,{[anak.id]:{parts:{lm1:80,lm2:90,lm3:85}}});
  const baris=barisLingkup(session,'mtk',anak.id);
  assert.deepEqual(baris.parts,{lm1:80,lm2:90,lm3:85},'rincian tiap bab tersimpan');
  assert.equal(baris.score,85,'nilai komponen memakai rata-rata bab terisi');
  assert.equal(baris.saved,true);
  /* Bab yang belum dinilai tidak dianggap nol. */
  assert.equal(Object.hasOwn(baris.parts,'lm4'),false);
});

test('4. Menambah bab berikutnya memperbarui rata-rata tanpa menghapus bab sebelumnya',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentScores(session,'mtk',SCOPE_SUMMATIVE_TYPE,{[anak.id]:{parts:{lm1:80}}});
  assert.equal(barisLingkup(session,'mtk',anak.id).score,80);
  saveAssessmentScores(session,'mtk',SCOPE_SUMMATIVE_TYPE,{[anak.id]:{parts:{lm1:80,lm2:90}}});
  const baris=barisLingkup(session,'mtk',anak.id);
  assert.deepEqual(baris.parts,{lm1:80,lm2:90});
  assert.equal(baris.score,85);
});

test('5. Nilai lingkup materi bertahan setelah aplikasi ditutup dan dibuka kembali',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentScores(session,'mtk',SCOPE_SUMMATIVE_TYPE,{[anak.id]:{parts:{lm1:70,lm2:80,lm3:90,lm4:100,lm5:60}}});
  bukaUlang();
  const baris=barisLingkup(session,'mtk',anak.id);
  assert.deepEqual(baris.parts,{lm1:70,lm2:80,lm3:90,lm4:100,lm5:60});
  assert.equal(baris.score,80);
});

/* ------------------------------------------------- Digabung dengan empat komponen lainnya */

test('6. Rata-rata lingkup materi digabung dengan empat komponen lain menjadi nilai rapor',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentSettings(session,'mtk',{formative:40,daily:20,practice:15,scopeSummative:15,semesterSummative:10,kktp:70});
  saveAssessmentScores(session,'mtk','formative',{[anak.id]:70});
  saveAssessmentScores(session,'mtk',SCOPE_SUMMATIVE_TYPE,{[anak.id]:{parts:{lm1:80,lm2:90,lm3:85}}});
  saveAutomaticReportScores(session,'mtk');

  const baris=visibleStoredReportRows(getStoredReportRows(session)).find(row=>row.subject.id==='mtk'&&row.student.id===anak.id);
  /* Bobot ternormalisasi atas komponen terisi: (70x40 + 85x15) / (40+15) = 74,09 */
  assert.equal(Number(baris.score.rawScore.toFixed(2)),74.09);
  assert.equal(baris.score.finalScore,74);
  assert.equal(baris.score.completionStatus,'PARTIAL','komponen lain yang kosong tidak dianggap nol');
  assert.equal(getReportDocument(session,anak.id).subjects.find(item=>item.subject.id==='mtk').score,74,'nilai rapor memakai hasil yang sama');
  assert.equal(getLeger(session).students.find(row=>row.student.id===anak.id).scores.find(item=>item.subject.id==='mtk').score,74,'Leger membaca nilai yang sama');
});

test('7. Berlaku untuk seluruh mata pelajaran pada Semester 1 dan Semester 2',()=>{
  useMemoryStorage();
  const ganjil=guru('5B',`Ganjil ${ACADEMIC_YEAR}`);
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  const mapel=SUBJECTS_DEFAULT.map(item=>item.id);
  aktifkan(ganjil,mapel);aktifkan(genap,mapel);
  const anakGanjil=siswa(ganjil,'G');
  const anakGenap=siswa(genap,'P');
  for(const id of mapel){
    saveAssessmentScores(ganjil,id,SCOPE_SUMMATIVE_TYPE,{[anakGanjil.id]:{parts:{lm1:80,lm2:90}}});
    saveAssessmentScores(genap,id,SCOPE_SUMMATIVE_TYPE,{[anakGenap.id]:{parts:{lm1:70,lm2:80,lm3:90}}});
  }
  for(const id of mapel){
    assert.equal(barisLingkup(ganjil,id,anakGanjil.id).score,85,`${id} Semester 1`);
    assert.equal(barisLingkup(genap,id,anakGenap.id).score,80,`${id} Semester 2`);
  }
  /* Kunci penyimpanan memuat semester sehingga kedua semester tidak pernah tercampur. */
  const kunci=Object.keys(loadDb().assessmentScores);
  assert.ok(kunci.some(item=>item.includes(`Ganjil ${ACADEMIC_YEAR}`))&&kunci.some(item=>item.includes(`Genap ${ACADEMIC_YEAR}`)));
  assert.equal(barisLingkup(ganjil,'mtk',anakGenap.id),undefined,'siswa semester lain tidak ikut tercampur');
});

/* ------------------------------------------------------------- Template dan import Excel */

test('8. Template Nilai memuat kolom LM1 sampai LM5 beserta isinya',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentScores(session,'mtk',SCOPE_SUMMATIVE_TYPE,{[anak.id]:{parts:{lm1:80,lm3:90}}});
  const rows=templateRows(session,'mtk');
  assert.deepEqual(rows[1],ASSESSMENT_HEADERS);
  assert.deepEqual(rows[1].slice(6,11),['Sumatif LM1','Sumatif LM2','Sumatif LM3','Sumatif LM4','Sumatif LM5']);
  const baris=rows.find(row=>row[KOL.id]===anak.id);
  assert.equal(baris[KOL.lm1],80,'nilai bab yang sudah ada ikut terisi');
  assert.equal(baris[KOL.lm2],'','bab yang belum dinilai tetap kosong');
  assert.equal(baris[KOL.lm3],90);
});

test('9. Import Excel per bab menyimpan rincian dan rata-ratanya',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  const rows=templateRows(session,'mtk');
  const baris=rows.find(row=>row[KOL.id]===anak.id);
  baris[KOL.lm1]=80;baris[KOL.lm2]=90;baris[KOL.lm3]=85;
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.invalidCount,0,preview.rows.flatMap(row=>row.errors).join(' | '));
  assert.equal(preview.rows[0].scores.scopeSummative,85,'preview menampilkan rata-rata bab');
  commitAssessmentImport(session,preview);
  const tersimpan=barisLingkup(session,'mtk',anak.id);
  assert.deepEqual(tersimpan.parts,{lm1:80,lm2:90,lm3:85});
  assert.equal(tersimpan.score,85);
});

test('10. Round-trip template lingkup materi tidak mengubah nilai',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  saveAssessmentScores(session,'mtk',SCOPE_SUMMATIVE_TYPE,{[anak.id]:{parts:{lm1:75,lm2:85,lm5:95}}});
  const rows=templateRows(session,'mtk');
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.newScoreCount,0);
  assert.equal(preview.updatedScoreCount,0);
  commitAssessmentImport(session,preview);
  const tersimpan=barisLingkup(session,'mtk',anak.id);
  assert.deepEqual(tersimpan.parts,{lm1:75,lm2:85,lm5:95});
  assert.equal(tersimpan.score,85);
});

test('11. Nilai bab di luar 0-100 atau bukan angka ditolak dengan alasan jelas',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkan(session,['mtk']);
  siswa(session,'A');
  const rows=templateRows(session,'mtk');
  rows[2][KOL.lm1]='abc';rows[2][KOL.lm2]=150;
  const preview=importRows(session,'mtk',rows);
  assert.equal(preview.canCommit,false);
  assert.match(preview.rows[0].errors.join(' '),/Sumatif LM1.*bukan angka/);
  assert.match(preview.rows[0].errors.join(' '),/Sumatif LM2.*di luar rentang/);
});

/* ------------------------------------------------------------------------ Tampilan input */

test('12. Halaman Penilaian menampilkan kolom tiap bab beserta rata-ratanya',()=>{
  const halaman=read('src/pages/assessment.js');
  assert.match(halaman,/const modeLingkup=\(\)=>assessmentType===SCOPE_SUMMATIVE_TYPE/);
  assert.match(halaman,/SCOPE_SUMMATIVE_PARTS\.map\(part=>`<th>\$\{escapeHtml\(part\.label\)\}<\/th>`\)/,'satu kolom untuk tiap Lingkup Materi');
  assert.match(halaman,/data-average-cell/,'kolom rata-rata ditampilkan');
  assert.match(halaman,/saveAssessmentScores\(session,subjectId,assessmentType,values\)/,'disimpan lewat layanan penilaian yang sama');
  assert.match(read('src/styles/app.css'),/\.lm-table th,\.lm-table td\{text-align:center\}/);
});
