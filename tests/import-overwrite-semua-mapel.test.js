import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { readWorkbookRows } from '../src/services/excel.js';
import { ASSESSMENT_TYPES, SCOPE_SUMMATIVE_TYPE, getAssessmentSettings, getAssessmentSheet,
  saveAssessmentScores, saveAssessmentSettings } from '../src/services/assessment.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { ASSESSMENT_HEADERS, assessmentTemplateWorkbook, commitAssessmentImport,
  previewAssessmentImport } from '../src/services/assessment-import.js';
import { calculateReportScore, getReportScore, saveAutomaticReportScores } from '../src/services/report.js';
import { cpEvidenceSiswa } from '../src/services/cp-evidence.js';

/* IMPORT NILAI HARUS MENIMPA NILAI LAMA - UNTUK SELURUH MATA PELAJARAN.

   Gejalanya terlihat pada mapel Agama, tetapi sebabnya sama sekali tidak khusus Agama.
   "Isi Semua Nilai" membawa Butir CP yang sedang dipilih, sehingga ia menulis DUA hal: nilai
   komponen DAN satu bukti Butir CP. Import menyimpan tanpa menyebut butir, jadi nilai
   komponennya ikut berubah - tetapi buktinya tetap memegang angka lama. Halaman Penilaian
   membaca bukti lebih dulu, sehingga guru tetap melihat angka lama sesudah import sementara
   Nilai Akhir sudah memakai angka baru.

   Reproduksi sebelum perbaikan menunjukkan 11 dari 12 mapel gagal; satu-satunya yang lolos
   adalah mapel yang kebetulan belum punya Butir CP sama sekali. Karena itu berkas ini menguji
   SELURUH mapel yang dikonfigurasi aplikasi, bukan sekadar beberapa contoh. */

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();return values;}

const guru=(classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`)=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
/* Dua agama berbeda supaya mapel agama Islam dan non-Islam sama-sama punya pemilik sah. */
const SISWA=Object.freeze([
  {nis:'501',nisn:'0051',name:'Ayu Islam',religion:'Islam'},
  {nis:'502',nisn:'0052',name:'Beni Kristen',religion:'Kristen'},
  {nis:'503',nisn:'0053',name:'Cinta Islam',religion:'Islam'},
]);
function siapkan({classId='5A',semester=`Ganjil ${ACADEMIC_YEAR}`}={}){
  const scope=guru(classId,semester);
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  const awalan=classId.replace(/\W/g,'');
  for(const item of SISWA)createStudent(scope,{classId,nis:`${awalan}-${item.nis}`,nisn:`${awalan}-${item.nisn}`,
    name:item.name,gender:'P',birthPlace:'Bekasi',birthDate:'2014-01-05',parentName:'Wali',religion:item.religion});
  return {scope,siswa:listStudents(scope,{classId})};
}
function awal(){useMemoryStorage();return siapkan();}

const kolom=label=>ASSESSMENT_HEADERS.indexOf(label);
const KOMPONEN=Object.freeze([
  ['Formatif','formative'],['Penilaian Harian','daily'],['Penilaian Praktik','practice'],
  ['Sumatif LM1',SCOPE_SUMMATIVE_TYPE],['Sumatif Akhir Semester','semesterSummative'],
]);
/* Siswa yang memang berhak atas satu mapel - mapel agama hanya milik siswa seagama. */
function pemilik(scope,subjectId){
  return getAssessmentSheet(scope,subjectId,'formative').rows.map(row=>row.studentId);
}
const butirPertama=(scope,subjectId)=>listCpButir(scope,subjectId,{activeOnly:true})[0]?.id||null;
/* Membaca seperti yang dilihat guru: sheet pada Butir CP yang sedang terpilih. */
function terlihatGuru(scope,subjectId,type,studentId){
  const butir=butirPertama(scope,subjectId);
  const sheet=getAssessmentSheet(scope,subjectId,type,butir?{cpButirId:butir}:{});
  return sheet.rows.find(row=>row.studentId===studentId)?.score??null;
}
function tabelImport(scope,subjectId,peta){
  const daftar=listStudents(scope,{classId:scope.classId});
  const rows=daftar.filter(student=>peta[student.id]).map(student=>{
    const row=new Array(ASSESSMENT_HEADERS.length).fill('');
    row[kolom('NIS')]=student.nis;row[kolom('NISN')]=student.nisn;row[kolom('Nama')]=student.name;
    row[ASSESSMENT_HEADERS.length-1]=student.id;
    for(const [label,value] of Object.entries(peta[student.id]))row[kolom(label)]=value;
    return row;});
  return [[...ASSESSMENT_HEADERS],...rows];
}
function importkan(scope,subjectId,peta){
  const preview=previewAssessmentImport(scope,subjectId,tabelImport(scope,subjectId,peta));
  assert.equal(preview.invalidCount,0,`${subjectId}: ${JSON.stringify(preview.rows.flatMap(row=>row.errors))}`);
  return commitAssessmentImport(scope,preview);
}
const MAPEL=SUBJECTS_DEFAULT.map(item=>item.id);

/* ==================================================== MATRIX: SELURUH MAPEL x SUMBER NILAI */

/* Dimensi kedua §15: asal nilai lama. Masing-masing disiapkan lewat jalur aslinya sendiri. */
const SUMBER=Object.freeze([
  ['A. kosong',()=>{}],
  ['B. manual',(scope,subjectId,ids)=>{
    const butir=butirPertama(scope,subjectId);
    for(const [,type] of KOMPONEN)
      saveAssessmentScores(scope,subjectId,type,Object.fromEntries(ids.map(id=>[id,80])),butir?{cpButirId:butir}:{});
  }],
  ['C. Isi Semua Nilai',(scope,subjectId)=>{
    fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
  }],
  ['D. import sebelumnya',(scope,subjectId,ids)=>{
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:80,'Penilaian Harian':80,
      'Penilaian Praktik':80,'Sumatif LM1':80,'Sumatif Akhir Semester':80}])));
  }],
]);

for(const [namaSumber,siapkanSumber] of SUMBER){
  test(`MATRIX ${namaSumber} -> Import menimpa pada SELURUH mapel dan SELURUH komponen`,()=>{
    const {scope}=awal();
    const gagal=[];
    for(const subjectId of MAPEL){
      const ids=pemilik(scope,subjectId);
      assert.ok(ids.length,`${subjectId} wajib punya siswa yang berhak`);
      siapkanSumber(scope,subjectId,ids);
      /* Nilai import berbeda per komponen supaya tertukarnya kolom langsung ketahuan. */
      const baru={Formatif:85,'Penilaian Harian':86,'Penilaian Praktik':87,
        'Sumatif LM1':88,'Sumatif Akhir Semester':89};
      importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,baru])));
      const harap={formative:85,daily:86,practice:87,[SCOPE_SUMMATIVE_TYPE]:88,semesterSummative:89};
      for(const [,type] of KOMPONEN)for(const id of ids){
        const nyata=terlihatGuru(scope,subjectId,type,id);
        if(nyata!==harap[type])gagal.push(`${subjectId}/${type}/${id}: ${nyata} bukan ${harap[type]}`);
      }
    }
    assert.deepEqual(gagal,[],`kombinasi yang masih salah:\n${gagal.join('\n')}`);
  });
}

/* ============================================================ TEST 1-5: SELURUH MAPEL */

test('TEST 1. Semua mapel: nilai kosong -> Import mengisi',()=>{
  const {scope}=awal();
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    for(const id of ids)assert.equal(terlihatGuru(scope,subjectId,'formative',id),null,`${subjectId} mula-mula kosong`);
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:85}])));
    for(const id of ids)assert.equal(terlihatGuru(scope,subjectId,'formative',id),85,`${subjectId} terisi import`);
  }
});

test('TEST 2. Semua mapel: nilai manual -> Import menimpa',()=>{
  const {scope}=awal();
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    const butir=butirPertama(scope,subjectId);
    saveAssessmentScores(scope,subjectId,'formative',Object.fromEntries(ids.map(id=>[id,70])),butir?{cpButirId:butir}:{});
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:85}])));
    for(const id of ids)assert.equal(terlihatGuru(scope,subjectId,'formative',id),85,`${subjectId} manual tertimpa`);
  }
});

test('TEST 3. Semua mapel: Isi Semua Nilai -> Import menimpa',()=>{
  const {scope}=awal();
  const gagal=[];
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
    for(const id of ids)
      if(terlihatGuru(scope,subjectId,'formative',id)!==80)gagal.push(`${subjectId}: Isi Semua tidak terbaca 80`);
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:87}])));
    for(const id of ids){
      const nyata=terlihatGuru(scope,subjectId,'formative',id);
      if(nyata!==87)gagal.push(`${subjectId}/${id}: masih ${nyata}, bukan 87`);
    }
  }
  assert.deepEqual(gagal,[],gagal.join('\n'));
});

test('TEST 4. Semua mapel: import lama -> import baru menimpa',()=>{
  const {scope}=awal();
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:70}])));
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:92}])));
    for(const id of ids)assert.equal(terlihatGuru(scope,subjectId,'formative',id),92,`${subjectId} import kedua menang`);
  }
});

test('TEST 5. Semua mapel: kelima komponen tertimpa dengan angkanya masing-masing',()=>{
  const {scope}=awal();
  const gagal=[];
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:85,'Penilaian Harian':86,
      'Penilaian Praktik':87,'Sumatif LM1':88,'Sumatif Akhir Semester':89}])));
    const harap={formative:85,daily:86,practice:87,[SCOPE_SUMMATIVE_TYPE]:88,semesterSummative:89};
    for(const [,type] of KOMPONEN)for(const id of ids){
      const nyata=terlihatGuru(scope,subjectId,type,id);
      if(nyata!==harap[type])gagal.push(`${subjectId}/${type}: ${nyata} bukan ${harap[type]}`);
    }
  }
  assert.deepEqual(gagal,[],gagal.join('\n'));
});

/* ==================================================== TEST 6-9: MAPEL AGAMA SECARA KHUSUS */

const AGAMA_ISLAM='agama';
const AGAMA_LAIN=SUBJECTS_DEFAULT.find(item=>/agama_/.test(item.id))?.id;

test('TEST 6. PAI: Isi Semua Nilai -> Import menimpa',()=>{
  const {scope}=awal();
  const ids=pemilik(scope,AGAMA_ISLAM);
  assert.ok(ids.length,'PAI dimiliki siswa Islam');
  fillAllAssessmentScores(scope,AGAMA_ISLAM,80,{cpButirId:butirPertama(scope,AGAMA_ISLAM)});
  importkan(scope,AGAMA_ISLAM,Object.fromEntries(ids.map(id=>[id,{Formatif:87}])));
  for(const id of ids)assert.equal(terlihatGuru(scope,AGAMA_ISLAM,'formative',id),87);
});

test('TEST 7. Agama non-Islam: Isi Semua Nilai -> Import menimpa',()=>{
  const {scope}=awal();
  assert.ok(AGAMA_LAIN,'source memang punya mapel agama non-Islam');
  const ids=pemilik(scope,AGAMA_LAIN);
  assert.ok(ids.length,'mapel agama non-Islam dimiliki siswa seagama');
  fillAllAssessmentScores(scope,AGAMA_LAIN,80,{cpButirId:butirPertama(scope,AGAMA_LAIN)});
  importkan(scope,AGAMA_LAIN,Object.fromEntries(ids.map(id=>[id,{Formatif:87}])));
  for(const id of ids)assert.equal(terlihatGuru(scope,AGAMA_LAIN,'formative',id),87);
});

test('TEST 8. Import PAI tidak mengubah mapel agama non-Islam',()=>{
  const {scope}=awal();
  const idsLain=pemilik(scope,AGAMA_LAIN);
  fillAllAssessmentScores(scope,AGAMA_LAIN,80,{cpButirId:butirPertama(scope,AGAMA_LAIN)});
  const idsPai=pemilik(scope,AGAMA_ISLAM);
  importkan(scope,AGAMA_ISLAM,Object.fromEntries(idsPai.map(id=>[id,{Formatif:87}])));
  for(const id of idsLain)assert.equal(terlihatGuru(scope,AGAMA_LAIN,'formative',id),80,'agama non-Islam tetap 80');
  /* Menu Penilaian memang memuat SELURUH siswa rombel pada setiap mapel aktif, termasuk kedua
     mapel agama - penyaringan menurut agama siswa baru terjadi di Rapor (visibleStoredReportRows
     pada report.js). Karena itu isolasi yang benar-benar menahan import bukanlah pemisahan
     siswa, melainkan pemisahan MAPEL: satu siswa yang sama harus memegang dua angka berbeda
     pada dua mapel agama yang berbeda. Itulah yang dikunci di sini. */
  const bersama=idsPai.filter(id=>idsLain.includes(id));
  assert.ok(bersama.length,'satu siswa yang sama muncul pada kedua mapel agama');
  for(const id of bersama){
    assert.equal(terlihatGuru(scope,AGAMA_ISLAM,'formative',id),87,'angka import hanya pada mapel yang diimport');
    assert.equal(terlihatGuru(scope,AGAMA_LAIN,'formative',id),80,'mapel agama lain milik siswa yang sama tidak ikut berubah');
  }
});

test('TEST 9. Import agama non-Islam tidak mengubah PAI',()=>{
  const {scope}=awal();
  const idsPai=pemilik(scope,AGAMA_ISLAM);
  fillAllAssessmentScores(scope,AGAMA_ISLAM,80,{cpButirId:butirPertama(scope,AGAMA_ISLAM)});
  const idsLain=pemilik(scope,AGAMA_LAIN);
  importkan(scope,AGAMA_LAIN,Object.fromEntries(idsLain.map(id=>[id,{Formatif:87}])));
  for(const id of idsPai)assert.equal(terlihatGuru(scope,AGAMA_ISLAM,'formative',id),80,'PAI tetap 80');
});

/* ======================================================== TEST 10-14: ISOLASI SCOPE */

test('TEST 10. Siswa A tidak mengubah siswa B, nilai berbeda per siswa',()=>{
  const {scope,siswa}=awal();
  const subjectId='mtk';
  fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
  const butir=butirPertama(scope,subjectId);
  saveAssessmentScores(scope,subjectId,'formative',{[siswa[2].id]:75},{cpButirId:butir});
  /* §17: satu rombel, beberapa siswa, angka import berbeda-beda. */
  importkan(scope,subjectId,{[siswa[0].id]:{Formatif:85},[siswa[1].id]:{Formatif:90},[siswa[2].id]:{Formatif:88}});
  assert.equal(terlihatGuru(scope,subjectId,'formative',siswa[0].id),85);
  assert.equal(terlihatGuru(scope,subjectId,'formative',siswa[1].id),90);
  assert.equal(terlihatGuru(scope,subjectId,'formative',siswa[2].id),88);
});

test('TEST 11. Mapel A tidak mengubah mapel B',()=>{
  const {scope}=awal();
  for(const subjectId of MAPEL)fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
  const ids=pemilik(scope,'mtk');
  importkan(scope,'mtk',Object.fromEntries(ids.map(id=>[id,{Formatif:95}])));
  for(const subjectId of MAPEL.filter(item=>item!=='mtk'))
    for(const id of pemilik(scope,subjectId))
      assert.equal(terlihatGuru(scope,subjectId,'formative',id),80,`${subjectId} tidak ikut berubah`);
});

test('TEST 12. Rombel A tidak mengubah rombel B',()=>{
  useMemoryStorage();
  const a=siapkan({classId:'5A'});const b=siapkan({classId:'5B'});
  fillAllAssessmentScores(b.scope,'mtk',80,{cpButirId:butirPertama(b.scope,'mtk')});
  const ids=pemilik(a.scope,'mtk');
  importkan(a.scope,'mtk',Object.fromEntries(ids.map(id=>[id,{Formatif:95}])));
  for(const id of pemilik(b.scope,'mtk'))
    assert.equal(terlihatGuru(b.scope,'mtk','formative',id),80,'rombel lain tetap 80');
});

test('TEST 13. Ganjil tidak mengubah Genap',()=>{
  useMemoryStorage();
  const ganjil=siapkan({semester:`Ganjil ${ACADEMIC_YEAR}`});
  const genap=guru('5A',`Genap ${ACADEMIC_YEAR}`);
  saveSubjectMapping(genap,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  fillAllAssessmentScores(genap,'mtk',80,{cpButirId:butirPertama(genap,'mtk')});
  const ids=pemilik(ganjil.scope,'mtk');
  importkan(ganjil.scope,'mtk',Object.fromEntries(ids.map(id=>[id,{Formatif:95}])));
  for(const id of pemilik(genap,'mtk'))
    assert.equal(terlihatGuru(genap,'mtk','formative',id),80,'semester lain tetap 80');
});

test('TEST 14. Tahun pelajaran lain tidak berubah',()=>{
  useMemoryStorage();
  const sekarang=siapkan();
  const lain={role:'teacher',classId:'5A',academicYear:'2019/2020',semester:'Ganjil 2019/2020'};
  saveSubjectMapping(lain,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
  fillAllAssessmentScores(lain,'mtk',80,{cpButirId:butirPertama(lain,'mtk')});
  const ids=pemilik(sekarang.scope,'mtk');
  importkan(sekarang.scope,'mtk',Object.fromEntries(ids.map(id=>[id,{Formatif:95}])));
  for(const id of pemilik(lain,'mtk'))
    assert.equal(terlihatGuru(lain,'mtk','formative',id),80,'tahun lain tetap 80');
});

/* ================================================ TEST 15-20: RAPOR, BOBOT, KKTP, RUMUS */

test('TEST 15. Import tidak langsung mengubah Nilai Rapor',()=>{
  const {scope}=awal();
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
    saveAutomaticReportScores(scope,subjectId);
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:95,'Penilaian Harian':95,
      'Penilaian Praktik':95,'Sumatif LM1':95,'Sumatif Akhir Semester':95}])));
    for(const id of ids)
      assert.equal(getReportScore(scope,subjectId,id).finalScore,80,`${subjectId}: rapor belum berubah`);
  }
});

test('TEST 16. Simpan Otomatis mengambil nilai terbaru untuk SELURUH mapel',()=>{
  const {scope}=awal();
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
    saveAutomaticReportScores(scope,subjectId);
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:95,'Penilaian Harian':95,
      'Penilaian Praktik':95,'Sumatif LM1':95,'Sumatif Akhir Semester':95}])));
    saveAutomaticReportScores(scope,subjectId);
    for(const id of ids)
      assert.equal(getReportScore(scope,subjectId,id).finalScore,95,`${subjectId}: rapor mengikuti import`);
  }
});

test('TEST 17-18. Bobot ON maupun OFF tetap dipatuhi sesudah import',()=>{
  const {scope}=awal();
  const subjectId='mtk';const ids=pemilik(scope,subjectId);
  importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:100,'Penilaian Harian':0}])));
  /* Formatif berat */
  saveAssessmentSettings(scope,subjectId,{formative:90,daily:10,practice:0,scopeSummative:0,semesterSummative:0,kktp:70});
  const beratFormatif=calculateReportScore(scope,subjectId,ids[0]).rawScore;
  /* Harian berat */
  saveAssessmentSettings(scope,subjectId,{formative:10,daily:90,practice:0,scopeSummative:0,semesterSummative:0,kktp:70});
  const beratHarian=calculateReportScore(scope,subjectId,ids[0]).rawScore;
  assert.equal(Math.round(beratFormatif),90);
  assert.equal(Math.round(beratHarian),10);
  assert.ok(beratFormatif>beratHarian,'bobot benar-benar menentukan hasil');
});

test('TEST 19. KKTP dan rubrik tidak berubah oleh import',()=>{
  const {scope}=awal();
  for(const subjectId of MAPEL){
    saveAssessmentSettings(scope,subjectId,{formative:100,daily:0,practice:0,scopeSummative:0,semesterSummative:0,kktp:75});
    const sebelum=getAssessmentSettings(scope,subjectId);
    importkan(scope,subjectId,Object.fromEntries(pemilik(scope,subjectId).map(id=>[id,{Formatif:80}])));
    const sesudah=getAssessmentSettings(scope,subjectId);
    assert.equal(sesudah.kktp,75,`${subjectId}: KKTP tetap`);
    assert.deepEqual(sesudah.rubric,sebelum.rubric,`${subjectId}: rubrik tetap`);
  }
});

test('TEST 20. Rumus Nilai Akhir identik - dihitung manual, bukan di-hardcode',()=>{
  const {scope}=awal();
  const subjectId='ipas';const ids=pemilik(scope,subjectId);
  saveAssessmentSettings(scope,subjectId,{formative:25,daily:25,practice:20,scopeSummative:15,semesterSummative:15,kktp:70});
  importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:80,'Penilaian Harian':60,
    'Penilaian Praktik':90,'Sumatif LM1':50,'Sumatif Akhir Semester':70}])));
  const harap=80*0.25+60*0.25+90*0.20+50*0.15+70*0.15;
  const hitung=calculateReportScore(scope,subjectId,ids[0]);
  assert.equal(Math.round(hitung.rawScore*100)/100,Math.round(harap*100)/100);
  assert.equal(hitung.finalScore,Math.round(harap));
});

/* ==================================================== TEST 21-23: BUTIR CP, RELOAD, ULANG */

test('TEST 21. Bukti Butir CP lain tidak dirusak import',()=>{
  const {scope,siswa}=awal();
  const subjectId='mtk';
  const butir=listCpButir(scope,subjectId,{activeOnly:true});
  assert.ok(butir.length>=2,'mapel uji punya lebih dari satu butir');
  /* Dua butir berbeda diukur terpisah. */
  saveAssessmentScores(scope,subjectId,'formative',{[siswa[0].id]:70},{cpButirId:butir[0].id});
  saveAssessmentScores(scope,subjectId,'formative',{[siswa[0].id]:95},{cpButirId:butir[1].id});
  importkan(scope,subjectId,{[siswa[0].id]:{Formatif:60}});
  /* Import mengganti bukti yang MENOPANG angka komponen saat itu - yaitu butir kedua -
     sedangkan bukti butir pertama tetap utuh sebagai pengukuran tersendiri. */
  const bukti=cpEvidenceSiswa(loadDb(),scope,subjectId,siswa[0].id);
  const butirPertamaBukti=bukti.find(item=>item.assessmentType==='formative'&&item.cpButirId===butir[0].id);
  assert.equal(butirPertamaBukti?.score,70,'bukti butir lain tidak tersentuh import');
});

test('TEST 22. Nilai hasil import bertahan sesudah reload database',()=>{
  const {scope}=awal();
  const subjectId='bindo';const ids=pemilik(scope,subjectId);
  fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
  importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:85,'Penilaian Harian':86}])));
  const tersimpan=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');
  invalidateDbCache();
  const values=new Map([['erapor_satria_jaya_01_v1',tersimpan]]);
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
  for(const id of ids){
    assert.equal(terlihatGuru(scope,subjectId,'formative',id),85,'bertahan sesudah reload');
    assert.equal(terlihatGuru(scope,subjectId,'daily',id),86);
  }
});

test('TEST 23. Import berulang tetap menimpa dan tidak menduplikasi catatan',()=>{
  const {scope}=awal();
  const subjectId='pjok';const ids=pemilik(scope,subjectId);
  fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
  const hitungCatatan=()=>Object.keys(loadDb().assessmentScores)
    .filter(key=>key.includes(subjectId)).length;
  const awalJumlah=hitungCatatan();
  /* Seluruh komponen diisi tiap putaran - sama seperti template nyata yang dibangkitkan berisi
     angka yang sekarang tersimpan. Sel yang dikosongkan guru memang berarti nilainya dihapus
     (lihat commitAssessmentImport), jadi mengimport satu kolom saja bukan pembanding yang adil
     untuk klaim "tidak menduplikasi". */
  for(const nilai of [85,90,95]){
    importkan(scope,subjectId,Object.fromEntries(ids.map(id=>[id,{Formatif:nilai,'Penilaian Harian':nilai,
      'Penilaian Praktik':nilai,'Sumatif LM1':nilai,'Sumatif Akhir Semester':nilai}])));
    for(const [,type] of KOMPONEN)for(const id of ids)
      assert.equal(terlihatGuru(scope,subjectId,type,id),nilai,`import ${nilai} menang pada ${type}`);
  }
  assert.equal(hitungCatatan(),awalJumlah,'jumlah catatan tidak bertambah - update, bukan duplikat');
});

/* ======================================================= §18 INTEGRASI TEMPLATE NYATA */

test('TEMPLATE NYATA. Unduh template -> sunting -> parser import -> Menu Penilaian',()=>{
  const {scope}=awal();
  const gagal=[];
  for(const subjectId of MAPEL){
    const ids=pemilik(scope,subjectId);
    fillAllAssessmentScores(scope,subjectId,80,{cpButirId:butirPertama(scope,subjectId)});
    /* Template dibangkitkan oleh aplikasi, ditulis menjadi berkas .xlsx sungguhan, lalu
       dibaca kembali - jalur yang sama persis dengan guru mengunduh dan mengunggah. */
    const bytes=assessmentTemplateWorkbook(scope,subjectId);
    const kembali=readWorkbookRows(bytes);
    const hi=kembali.findIndex(row=>row.some(cell=>String(cell??'').trim()==='NIS'));
    assert.ok(hi>=0,`${subjectId}: header template ditemukan`);
    const header=kembali[hi].map(cell=>String(cell??'').trim());
    const kFormatif=header.indexOf('Formatif');
    assert.ok(kFormatif>=0,`${subjectId}: kolom Formatif ada di template`);
    /* Guru menyunting angkanya di berkas. */
    const disunting=kembali.map((row,index)=>{
      if(index<=hi)return row;
      if(!row.some(cell=>String(cell??'').trim()))return row;
      const salin=[...row];salin[kFormatif]=91;return salin;});
    const preview=previewAssessmentImport(scope,subjectId,disunting);
    assert.equal(preview.invalidCount,0,`${subjectId}: ${JSON.stringify(preview.rows.flatMap(r=>r.errors))}`);
    commitAssessmentImport(scope,preview);
    for(const id of ids){
      const nyata=terlihatGuru(scope,subjectId,'formative',id);
      if(nyata!==91)gagal.push(`${subjectId}/${id}: ${nyata} bukan 91`);
    }
  }
  assert.deepEqual(gagal,[],gagal.join('\n'));
});
