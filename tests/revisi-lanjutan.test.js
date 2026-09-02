import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, RELIGION_SUBJECTS, SUBJECTS_DEFAULT, isReligionSubject } from '../src/data/constants.js';
import { COCURRICULAR_ACTIVITY_PRESETS } from '../src/data/cocurricular.js';
import { ACTIVITY_PREDICATES, cocurricularDescriptionsForClass, listCocurricularActivities, pramukaDescriptionsForClass, pramukaPresetForClass, saveGraduationStatus, savePromotionStatus, getGraduationStatus, getPromotionStatus } from '../src/services/completeness.js';
import { assertReportPrintable, getReportCompleteness, getReportDocument } from '../src/services/documents.js';
import { calculateReportSheet, getStoredReportRows, saveManualReportScore, saveManualReportScoresBulk } from '../src/services/report.js';
import { saveAssessmentScores } from '../src/services/assessment.js';
import { createStudent, listStudents, updateStudent } from '../src/services/students.js';
import { listActiveSubjects, listSubjectsForStudent } from '../src/services/subjects.js';
import { saveSubjectMapping } from '../src/services/storage.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { generateReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { saveAttendance } from '../src/services/attendance.js';
import { saveHomeroomNote } from '../src/services/completeness.js';
import { cocurricularTable, extracurricularTable } from '../src/pages/print.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function aktifkan(session,ids){saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));}
function siswa(session,suffix,extra={}){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',religion:'Islam',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:'',...extra});}

/* -------------------------------------------------- 1. Optimasi simpan nilai rapor */

test('Simpan seluruh nilai satu rombel penuh dalam satu commit tanpa nilai tertukar',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const mapel=['agama','pancasila','bindo','mtk','ipas'];
  aktifkan(session,mapel);
  const daftar=Array.from({length:12},(_,index)=>siswa(session,`S${index}`));
  const entri=daftar.flatMap((student,si)=>mapel.map((subjectId,mi)=>({subjectId,studentId:student.id,value:60+si+mi})));
  const hasil=saveManualReportScoresBulk(session,entri);
  assert.equal(hasil.saved,daftar.length*mapel.length,'seluruh sel tersimpan');

  const rows=getStoredReportRows(session);
  entri.forEach(({subjectId,studentId,value})=>{
    const row=rows.find(item=>item.student.id===studentId&&item.subject.id===subjectId);
    assert.equal(row.score.finalScore,value,`nilai ${subjectId} milik ${studentId} tidak tertukar`);
  });
});

test('Batch simpan tidak mencampur scope semester, tahun pelajaran, dan rombel',()=>{
  useMemoryStorage();
  const ganjil=guru('5B');
  const genap={...ganjil,semester:`Genap ${ACADEMIC_YEAR}`};
  const lain=guru('6A');
  [ganjil,genap,lain].forEach(session=>aktifkan(session,['mtk']));
  const a=siswa(ganjil,'A'),b=siswa(genap,'B'),c=siswa(lain,'C');
  saveManualReportScoresBulk(ganjil,[{subjectId:'mtk',studentId:a.id,value:80}]);
  saveManualReportScoresBulk(genap,[{subjectId:'mtk',studentId:b.id,value:90}]);
  saveManualReportScoresBulk(lain,[{subjectId:'mtk',studentId:c.id,value:70}]);
  assert.equal(getStoredReportRows(ganjil).find(row=>row.student.id===a.id).score.finalScore,80);
  assert.equal(getStoredReportRows(genap).find(row=>row.student.id===b.id).score.finalScore,90);
  assert.equal(getStoredReportRows(lain).find(row=>row.student.id===c.id).score.finalScore,70);
  assert.deepEqual([...new Set(getStoredReportRows(ganjil).map(row=>row.student.id))],[a.id],'scope Ganjil hanya memuat siswanya sendiri');
});

test('Batch dan simpan satuan menghasilkan nilai akhir yang sama',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const satu=siswa(session,'A'),dua=siswa(session,'B');
  saveManualReportScore(session,'mtk',satu.id,88);
  saveManualReportScoresBulk(session,[{subjectId:'mtk',studentId:dua.id,value:88}]);
  const rows=getStoredReportRows(session);
  const a=rows.find(row=>row.student.id===satu.id).score;
  const b=rows.find(row=>row.student.id===dua.id).score;
  assert.equal(a.finalScore,b.finalScore,'rumus nilai akhir tidak berubah');
  assert.equal(a.masteryStatus,b.masteryStatus);
  assert.equal(b.isManualOverride,true);
});

test('UI simpan nilai memakai satu commit dan memberi status selesai',()=>{
  const page=read('src/pages/reports.js');
  assert.match(page,/saveManualReportScoresBulk\(session,values\.map/,'tidak lagi menyimpan per sel');
  assert.match(page,/nilai berhasil disimpan sekaligus/,'status selesai ditampilkan');
  assert.match(page,/requestAnimationFrame/,'UI sempat menggambar sebelum proses berat');
  assert.match(read('src/services/report.js'),/export function saveManualReportScoresBulk/);
});

/* ------------------------------------------------------------- 2 & 3. Kegiatan */

test('Lima kegiatan kokurikuler dengan 5 deskripsi kelas rendah dan 5 kelas tinggi',()=>{
  const kegiatan=listCocurricularActivities();
  assert.equal(kegiatan.length,5);
  assert.deepEqual(kegiatan,['Kunjungan Edukasi (Field Trip)','Proyek Peduli Lingkungan','Bakti Sosial','Pengenalan Budaya','Pelatihan Literasi']);
  const semua=[];
  COCURRICULAR_ACTIVITY_PRESETS.forEach(preset=>{
    const rendah=cocurricularDescriptionsForClass('2A',preset.name);
    const tinggi=cocurricularDescriptionsForClass('5B',preset.name);
    assert.equal(rendah.length,5,`${preset.name} punya 5 deskripsi kelas rendah`);
    assert.equal(tinggi.length,5,`${preset.name} punya 5 deskripsi kelas tinggi`);
    assert.notDeepEqual(rendah,tinggi,`${preset.name} membedakan kelas rendah dan tinggi`);
    semua.push(...rendah,...tinggi);
  });
  assert.equal(semua.length,50,'5 kegiatan x 5 deskripsi x 2 tingkat');
  assert.equal(new Set(semua).size,50,'tidak ada deskripsi generik yang dipakai ulang');
});

test('Ekstrakurikuler Pramuka mengikuti tingkat kelas secara otomatis',()=>{
  ['1A','2B','3C'].forEach(kelas=>assert.equal(pramukaPresetForClass(kelas),'Pramuka Siaga',`${kelas} memakai Siaga`));
  ['4A','5B','6D'].forEach(kelas=>assert.equal(pramukaPresetForClass(kelas),'Pramuka Penggalang',`${kelas} memakai Penggalang`));
  assert.equal(pramukaDescriptionsForClass('2A').length,5);
  assert.equal(pramukaDescriptionsForClass('5B').length,5);
  assert.deepEqual(ACTIVITY_PREDICATES,['Cukup','Baik','Sangat Baik']);
});

/* ------------------------------------------- 4. Kenaikan kelas / kelulusan */

test('Status kenaikan dan kelulusan tersedia tanpa menunggu semester Genap',()=>{
  useMemoryStorage();
  const lima=guru('5B');
  aktifkan(lima,['mtk']);
  const anak=siswa(lima,'A');
  assert.equal(getPromotionStatus(lima,anak.id),null,'tidak ada kenaikan otomatis tanpa tindakan guru');
  savePromotionStatus(lima,anak.id,'PROMOTED');
  assert.equal(getPromotionStatus(lima,anak.id).status,'PROMOTED');
  assert.equal(getReportDocument(lima,anak.id).finalStatusLabel,'Naik ke Kelas 6B');

  const enam=guru('6A');
  aktifkan(enam,['mtk']);
  const kelas6=siswa(enam,'B');
  assert.equal(getGraduationStatus(enam,kelas6.id),null,'tidak ada kelulusan otomatis');
  saveGraduationStatus(enam,kelas6.id,'GRADUATED');
  assert.equal(getReportDocument(enam,kelas6.id).finalStatusLabel,'Lulus');
});

test('Keterangan "tidak diperlukan pada semester Ganjil" sudah dihapus',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk']);
  const anak=siswa(session,'A');
  assert.equal(getReportDocument(session,anak.id).finalStatusLabel,'','kosong bila guru belum menentukan');
  assert.equal(read('src/services/documents.js').includes('Tidak diperlukan pada semester Ganjil'),false);
  assert.match(read('src/pages/print.js'),/if\(!doc\.finalStatusLabel\)return ''/,'bagian ini tidak dicetak bila kosong');
});

/* --------------------------------------------------------- 5. Cetak massal */

test('Cetak massal tersedia untuk rapor, cover, dan perlengkapan',()=>{
  const page=read('src/pages/print.js');
  assert.match(page,/Cetak Semua Rapor/);
  assert.match(page,/Cetak Semua Cover/);
  assert.match(page,/Cetak Semua Perlengkapan Rapor/);
  assert.match(page,/function bulkSheets/,'seluruh siswa rombel dirender sekaligus');
  assert.match(page,/data-bulk-toggle/,'pilihan cetak satu siswa tetap tersedia');
  assert.match(page,/Leger Kelas · seluruh siswa rombel/,'Leger memang satu dokumen seluruh kelas');
  assert.match(read('src/styles/app.css'),/\.report-a4\+\.report-a4,\.report-cover-a4\+\.report-cover-a4\{break-before:page\}/,'tiap siswa mulai halaman baru');
});

/* ------------------------------------- 6. Kelengkapan rapor dapat diklik */

test('Indikator kelengkapan yang belum lengkap menjadi tombol menuju halaman sumbernya',()=>{
  const page=read('src/pages/print.js');
  assert.match(page,/data-goto="\$\{escapeHtml\(key\)\}"/,'indikator merah berupa tombol');
  assert.match(page,/COMPLETENESS_ROUTES=\{identity:'students',religion:'students',scores:'report-input',descriptions:'report-input',attendance:'attendance',homeroomNote:'completeness-input'\}/);
  assert.match(page,/erapor-focus-student/,'siswa yang bersangkutan ikut dibawa');
  assert.match(page,/bindCompletenessNavigation\(\)/);
});

/* ------------------------------- 7 & 8. Layout cetak dan bagian opsional */

test('Layout cetak rapor lega dan tidak memaksa seluruh tabel mapel satu halaman',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/\.report-a4\{padding:14mm 13mm\}/,'margin lebih lega');
  assert.match(css,/\.report-a4 \.document-table th,\.report-a4 \.document-table td\{padding:5px 7px/,'spacing tabel mengikuti acuan format final');
  assert.match(css,/\.report-a4 \.report-learning-table thead\{display:table-header-group\}/,'header tabel diulang di halaman berikutnya');
  assert.match(css,/\.report-a4 \.document-table tr,\.report-a4 \.subject-group-row\{break-inside:avoid\}/,'baris mapel tidak terpotong');
  assert.equal(/\.report-a4[^{]*\{[^}]*transform:scale/.test(css),false,'isi tidak dikecilkan agar muat satu halaman');
});

/* Lebar area cetak A4 potret hanya 718px, sehingga @media(max-width:767px) tanpa tipe media
   ikut aktif saat mencetak dan sempat meruntuhkan blok tanda tangan rapor menjadi satu kolom. */
test('Aturan ringkas layar tidak meruntuhkan tata letak cetak rapor',()=>{
  const css=read('src/styles/app.css');
  const printBlocks=[...css.matchAll(/@media print\{/g)].map(match=>{
    let depth=1,index=match.index+match[0].length;
    while(index<css.length&&depth>0){if(css[index]==='{')depth+=1;else if(css[index]==='}')depth-=1;index+=1;}
    return css.slice(match.index,index);
  }).join('\n');
  assert.match(printBlocks,/\.report-a4 \.report-signatures\{grid-template-columns:repeat\(3,1fr\)/,'tanda tangan rapor tetap tiga kolom di atas kertas');
  assert.match(printBlocks,/\.report-a4 \.report-head-table td\{font-size:10\.5px\}/,'identitas rapor tidak mengecil ke ukuran layar sempit');
  assert.match(css,/\.report-signatures\{grid-template-columns:1fr/,'tampilan layar sempit tetap satu kolom dan hanya ditimpa saat mencetak');
});

test('Kokurikuler dan ekstrakurikuler kosong tidak menahan cetak rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['mtk','agama']);
  const anak=siswa(session,'A',{religion:'Islam'});
  saveManualReportScoresBulk(session,[{subjectId:'mtk',studentId:anak.id,value:85},{subjectId:'agama',studentId:anak.id,value:88}]);
  for(const mapel of ['mtk','agama']){
    const tp=createLearningObjective(session,mapel,{code:`TP-${mapel}`,description:'memahami pecahan.'});
    saveReportDescription(session,mapel,anak.id,generateReportDescription(session,mapel,anak.id,{bestObjectiveId:tp.id,improvementObjectiveId:tp.id}));
  }
  saveAttendance(session,'2026-08-10',{[anak.id]:'Hadir'});
  saveHomeroomNote(session,anak.id,'Pertahankan semangat belajar.');

  const ringkasan=getReportCompleteness(session).students[0];
  assert.equal(Object.hasOwn(ringkasan.categories,'extracurricular'),false,'ekstrakurikuler tidak lagi wajib');
  assert.equal(ringkasan.status,'COMPLETE','rapor lengkap walau kegiatan kosong');
  assert.doesNotThrow(()=>assertReportPrintable(session,anak.id),'cetak tidak diblokir');

  const dokumen=getReportDocument(session,anak.id);
  assert.equal(dokumen.extracurricular.length,0);
  assert.equal(dokumen.cocurricular,null);
  assert.equal(extracurricularTable(dokumen),'','bagian ekstrakurikuler kosong tidak dicetak');
  assert.equal(cocurricularTable(dokumen),'','bagian kokurikuler kosong tidak dicetak');
});

/* ------------------------------------------------- 9. Agama sesuai siswa */

test('Mapel agama mengikuti agama masing-masing siswa',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const islam=siswa(session,'ISL',{religion:'Islam'});
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  const tanpa=siswa(session,'NON',{religion:''});

  const mapelIslam=listSubjectsForStudent(session,islam).map(item=>item.id);
  const mapelKristen=listSubjectsForStudent(session,kristen).map(item=>item.id);
  assert.ok(mapelIslam.includes('agama')&&!mapelIslam.includes('agama_kristen'),'siswa Islam hanya Agama Islam');
  assert.ok(mapelKristen.includes('agama_kristen')&&!mapelKristen.includes('agama'),'siswa Kristen hanya Agama Kristen');
  /* Agama kosong tidak ditebak: tidak ada mapel agama yang dipilihkan untuk siswa itu. */
  const mapelTanpa=listSubjectsForStudent(session,tanpa).map(item=>item.id);
  assert.equal(mapelTanpa.includes('agama')||mapelTanpa.includes('agama_kristen'),false,'agama kosong tidak menampilkan PAI maupun PAK');
  assert.equal(listSubjectsForStudent(session,tanpa).length,listActiveSubjects(session).length-2,'kedua mapel agama dikeluarkan');
  assert.deepEqual(RELIGION_SUBJECTS,{agama:'Islam',agama_kristen:'Kristen'});
  assert.equal(isReligionSubject('mtk'),false);
  assert.ok(SUBJECTS_DEFAULT.some(item=>item.id==='agama_kristen'),'master mapel agama tidak dihapus');
});

test('Siswa Kristen tidak dianggap belum lengkap karena Agama Islam kosong',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkan(session,['agama','agama_kristen','mtk']);
  const kristen=siswa(session,'KRS',{religion:'Kristen'});
  [['agama_kristen',88],['mtk',90]].forEach(([subjectId,value])=>{
    saveManualReportScoresBulk(session,[{subjectId,studentId:kristen.id,value}]);
    const tp=createLearningObjective(session,subjectId,{code:`TP-${subjectId}`,description:`memahami ${subjectId}.`});
    saveReportDescription(session,subjectId,kristen.id,generateReportDescription(session,subjectId,kristen.id,{bestObjectiveId:tp.id,improvementObjectiveId:tp.id}));
  });
  saveAttendance(session,'2026-08-10',{[kristen.id]:'Hadir'});
  saveHomeroomNote(session,kristen.id,'Catatan.');
  const ringkasan=getReportCompleteness(session).students.find(row=>row.student.id===kristen.id);
  assert.equal(ringkasan.categories.scores,true,'nilai lengkap tanpa Agama Islam');
  assert.equal(ringkasan.status,'COMPLETE');
  const dokumen=getReportDocument(session,kristen.id);
  assert.equal(dokumen.subjects.some(row=>row.subject.id==='agama'),false,'Agama Islam tidak tampil pada rapor siswa Kristen');
  assert.equal(dokumen.subjects.some(row=>row.subject.id==='agama_kristen'),true);
});

test('Agama siswa tersimpan dan dapat diubah tanpa mengubah NIS/NISN',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const anak=siswa(session,'A',{religion:'Islam'});
  assert.equal(listStudents(session,{classId:'5B'})[0].religion,'Islam');
  const diubah=updateStudent(session,anak.id,{religion:'Kristen'});
  assert.equal(diubah.religion,'Kristen');
  assert.equal(diubah.nis,anak.nis,'NIS tidak berubah');
  assert.equal(diubah.nisn,anak.nisn,'NISN tidak berubah');
});
