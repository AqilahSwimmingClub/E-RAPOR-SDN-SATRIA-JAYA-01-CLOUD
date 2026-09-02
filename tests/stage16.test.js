import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ensureDefaultSubjects } from '../src/services/seed.js';
import { commitStudentImport, formatBirthPlaceDate, listStudents, parseBirthPlaceDate, previewStudentWorkbookImport, STUDENT_CSV_HEADERS, studentRow, studentTemplateWorkbook, studentWorkbookBytes } from '../src/services/students.js';
import { createWorkbookBytes, readWorkbookRows } from '../src/services/excel.js';
import { getLeger, legerWorkbookRows } from '../src/services/documents.js';
import { loadDb, saveSubjectMapping } from '../src/services/storage.js';
import { moveSubjectToGroup } from '../src/services/mapping.js';
import { listActiveSubjects } from '../src/services/subjects.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { getAssessmentSheet, getAssessmentSettings, saveAllAssessmentSettings } from '../src/services/assessment.js';
import { createStudent } from '../src/services/students.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { generateReportDescription } from '../src/services/descriptions.js';
import { ACTIVITY_PREDICATES, cocurricularDescriptionsForClass, getHomeroomNote, pramukaDescriptionsForClass, pramukaPresetForClass, saveHomeroomNote, saveHomeroomNoteBulk } from '../src/services/completeness.js';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};}
const guru=(classId='5B')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Ganjil ${ACADEMIC_YEAR}`});
function tambahSiswa(session,suffix){return createStudent(session,{classId:session.classId,nis:`NIS-${suffix}`,nisn:`NISN-${suffix}`,name:`Siswa ${suffix}`,gender:'L',birthPlace:'Bekasi',birthDate:'2015-01-02',parentName:'Orang Tua',phone:'0812',address:'Satria Jaya',photo:''});}

/* ---------------------------------------- Tahap 16: format Data Siswa dan data awal 5B */

test('Format kolom Data Siswa mengikuti berkas Kelas 5B untuk semua rombel',()=>{
  assert.deepEqual(STUDENT_CSV_HEADERS,['NIS','NISN','Nama','JK','Agama','Tempat/Tanggal Lahir','Orang Tua','Telepon','Alamat'],'kolom Agama ikut format baku');
  const rows=readWorkbookRows(studentTemplateWorkbook());
  assert.deepEqual(rows[0],STUDENT_CSV_HEADERS,'template unduhan memakai format baku yang sama');
});

test('Tempat dan tanggal lahir digabung satu kolom dan dapat dibaca kembali',()=>{
  assert.equal(formatBirthPlaceDate({birthPlace:'Bekasi',birthDate:'2015-09-04'}),'Bekasi, 4 September 2015');
  assert.deepEqual(parseBirthPlaceDate('Bekasi, 4 September 2015'),{birthPlace:'Bekasi',birthDate:'2015-09-04'});
  assert.deepEqual(parseBirthPlaceDate('Bekasi, 2015-09-04'),{birthPlace:'Bekasi',birthDate:'2015-09-04'});
  assert.deepEqual(parseBirthPlaceDate('Bekasi'),{birthPlace:'Bekasi',birthDate:''});
});

test('Import Excel menerima format baku termasuk baris judul di atas header',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const bytes=createWorkbookBytes('Data Siswa',[
    ['Data Siswa Kelas 5B'],
    STUDENT_CSV_HEADERS,
    ['222301035','3152513003','Adwa Habibi Rizky','L','Islam','Bekasi, 4 September 2015','Sumito','','Kp. Gebang'],
  ]);
  const preview=previewStudentWorkbookImport(session,bytes,{classId:'5B'});
  assert.equal(preview.canCommit,true,preview.rows[0]?.errors?.join(', '));
  assert.equal(commitStudentImport(session,preview).length,1);
  const [siswa]=listStudents(session,{classId:'5B'});
  assert.equal(siswa.name,'Adwa Habibi Rizky');
  assert.equal(siswa.birthPlace,'Bekasi');
  assert.equal(siswa.birthDate,'2015-09-04');
  assert.equal(siswa.parentName,'Sumito');
  assert.equal(siswa.religion,'Islam','agama ikut terbaca dari berkas');
});

test('Ekspor Data Siswa memakai format kolom yang sama dengan template',()=>{
  useMemoryStorage();
  const session=guru('5B');
  tambahSiswa(session,'A');
  const rows=readWorkbookRows(studentWorkbookBytes(session,{classId:'5B'}));
  assert.deepEqual(rows[0],STUDENT_CSV_HEADERS);
  assert.equal(rows[1].length,STUDENT_CSV_HEADERS.length);
  assert.deepEqual(studentRow(listStudents(session,{classId:'5B'})[0]).length,STUDENT_CSV_HEADERS.length);
});

test('Instalasi baru tidak pernah menyemai data siswa siapa pun',()=>{
  useMemoryStorage();
  /* Aplikasi dipakai banyak sekolah, jadi tidak ada roster yang ikut didistribusikan.
     Pengaman startup hanya menyentuh mapel, tidak pernah menyentuh siswa. */
  ensureDefaultSubjects();
  const session={role:'teacher',classId:'5B',academicYear:'2026/2027',semester:'Ganjil 2026/2027'};
  assert.equal(listStudents(session,{classId:'5B'}).length,0,'rombel kosong sampai Admin mengisi sendiri');
  assert.equal(Object.keys(loadDb().students).length,0,'tidak ada satu pun siswa pada instalasi baru');
  assert.equal(existsSync(new URL('../src/data/seed-5b.js',root)),false,'roster siswa tidak lagi ada di kode produk');
});

/* ---------------------------------------------------------------- Leger dinamis */

function siapkanLeger(session,aktif){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:aktif.includes(item.id),order:index+1})));
}

test('Leger kelas rendah dan kelas tinggi mengikuti Mapping masing-masing',()=>{
  useMemoryStorage();
  const rendah=guru('2A'),tinggi=guru('5A');
  const mapelRendah=['agama','pancasila','bindo','mtk'];
  const mapelTinggi=['agama','pancasila','bindo','mtk','ipas','pjok','sunda'];
  siapkanLeger(rendah,mapelRendah);
  siapkanLeger(tinggi,mapelTinggi);
  tambahSiswa(rendah,'R1');tambahSiswa(tinggi,'T1');
  const legerRendah=getLeger(rendah),legerTinggi=getLeger(tinggi);
  assert.deepEqual(legerRendah.subjects.map(item=>item.id),SUBJECTS_DEFAULT.filter(item=>mapelRendah.includes(item.id)).map(item=>item.id));
  assert.deepEqual(legerTinggi.subjects.map(item=>item.id).sort(),[...mapelTinggi].sort());
  assert.notEqual(legerRendah.subjects.length,legerTinggi.subjects.length,'susunan mapel kedua rombel berbeda');
  const header=legerWorkbookRows(rendah)[4];
  assert.deepEqual(header.slice(4,4+mapelRendah.length),legerRendah.subjects.map(item=>item.name),'Excel mengikuti mapel aktif');
  assert.deepEqual(header.slice(-6),['TOTAL','RATA-RATA','RANK','SAKIT','IZIN','ALPA']);
});

test('Leger mengikuti perubahan Mapping: nonaktif, tambah, dan pindah kelompok',()=>{
  useMemoryStorage();
  const session=guru('5A');
  siapkanLeger(session,['agama','mtk','bindo']);
  tambahSiswa(session,'X');
  const urutMapping=ids=>SUBJECTS_DEFAULT.filter(item=>ids.includes(item.id)).map(item=>item.id);
  assert.deepEqual(getLeger(session).subjects.map(item=>item.id),urutMapping(['agama','mtk','bindo']),'urutan Leger mengikuti Mapping');

  siapkanLeger(session,['agama','mtk']);
  assert.deepEqual(getLeger(session).subjects.map(item=>item.id),urutMapping(['agama','mtk']),'mapel nonaktif hilang dari Leger');

  siapkanLeger(session,['agama','mtk','seni_rupa']);
  assert.ok(getLeger(session).subjects.some(item=>item.id==='seni_rupa'),'Seni Rupa otomatis muncul saat diaktifkan');

  const aktif=['agama','mtk','seni_rupa'];
  const mappingPenuh=SUBJECTS_DEFAULT.map((item,index)=>({...item,active:aktif.includes(item.id),order:index+1}));
  saveSubjectMapping(session,moveSubjectToGroup(mappingPenuh,'seni_rupa','B'));
  const leger=getLeger(session);
  assert.equal(leger.subjects.find(item=>item.id==='seni_rupa').group,'B','Seni Rupa ikut pindah ke Kelompok B');
  assert.equal(leger.subjects.at(-1).id,'seni_rupa','urutan Leger mengikuti Kelompok A lalu B');
});

test('Seni Rupa tersedia sebagai mapel dan bebas dipindah Kelompok A atau B',()=>{
  const seni=SUBJECTS_DEFAULT.find(item=>item.id==='seni_rupa');
  assert.ok(seni,'Seni Rupa ada pada master mata pelajaran');
  assert.equal(seni.name,'Seni Rupa');
  assert.equal(moveSubjectToGroup(SUBJECTS_DEFAULT,'seni_rupa','B').find(item=>item.id==='seni_rupa').group,'B');
  assert.equal(moveSubjectToGroup(moveSubjectToGroup(SUBJECTS_DEFAULT,'seni_rupa','B'),'seni_rupa','A').find(item=>item.id==='seni_rupa').group,'A');
});

/* ------------------------------------------------------- Penilaian, bobot, catatan */

test('Isi Semua Nilai untuk satu siswa tidak mengubah nilai siswa lain',()=>{
  useMemoryStorage();
  const session=guru('5B');
  siapkanLeger(session,['mtk']);
  const target=tambahSiswa(session,'T'),lain=tambahSiswa(session,'L');
  fillAllAssessmentScores(session,'mtk',90,{studentId:target.id});
  const sheet=getAssessmentSheet(session,'mtk','formative');
  assert.equal(sheet.rows.find(row=>row.studentId===target.id).score,90);
  assert.equal(sheet.rows.find(row=>row.studentId===lain.id).score,null,'siswa lain tetap kosong');
  fillAllAssessmentScores(session,'mtk',70);
  const semua=getAssessmentSheet(session,'mtk','formative');
  assert.equal(semua.rows.every(row=>row.score===70),true,'tanpa studentId tetap berlaku satu rombel');
});

test('Bobot dan KKTP seluruh mapel dapat disimpan sekaligus dan tetap independen',()=>{
  useMemoryStorage();
  const session=guru('5B');
  siapkanLeger(session,['agama','mtk','bindo']);
  const kktpTarget={agama:70,mtk:71,bindo:72};
  const entri=listActiveSubjects(session).map(subject=>({subjectId:subject.id,formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:kktpTarget[subject.id]}));
  const hasil=saveAllAssessmentSettings(session,entri);
  assert.equal(hasil.length,3);
  Object.entries(kktpTarget).forEach(([subjectId,kktp])=>assert.equal(getAssessmentSettings(session,subjectId).kktp,kktp,`KKTP ${subjectId} independen`));
  assert.throws(()=>saveAllAssessmentSettings(session,[{subjectId:'mtk',formative:50,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:70}]),/Total bobot wajib 100%/);
  assert.equal(getAssessmentSettings(session,'mtk').kktp,71,'penyimpanan gagal tidak mengubah data lama');
});

test('Deskripsi rapor berhenti pada deskripsi TP tanpa kalimat penutup',()=>{
  useMemoryStorage();
  const session=guru('5B');
  siapkanLeger(session,['mtk']);
  const siswa=tambahSiswa(session,'D');
  const tp=createLearningObjective(session,'mtk',{code:'TP-1',description:'memahami operasi hitung campuran.'});
  const sama=generateReportDescription(session,'mtk',siswa.id,{bestObjectiveId:tp.id,improvementObjectiveId:tp.id});
  assert.equal(sama.text,`Ananda ${siswa.name} menunjukkan capaian pada memahami operasi hitung campuran.`);
  assert.equal(/perlu terus mengembangkan kemampuan tersebut/.test(sama.text),false);
  assert.equal(read('src/services/descriptions.js').includes('perlu terus mengembangkan kemampuan tersebut'),false);
});

test('Catatan wali kelas massal tidak menimpa catatan individual tanpa diminta',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const pertama=tambahSiswa(session,'A'),kedua=tambahSiswa(session,'B');
  saveHomeroomNote(session,pertama.id,'Catatan khusus siswa A.');
  const hasil=saveHomeroomNoteBulk(session,'Catatan umum kelas.');
  assert.equal(hasil.saved,1);
  assert.equal(hasil.skipped,1);
  assert.equal(getHomeroomNote(session,pertama.id).text,'Catatan khusus siswa A.','catatan individual dipertahankan');
  assert.equal(getHomeroomNote(session,kedua.id).text,'Catatan umum kelas.');
  const timpa=saveHomeroomNoteBulk(session,'Catatan umum kelas.',{overwrite:true});
  assert.equal(timpa.saved,2);
  assert.equal(getHomeroomNote(session,pertama.id).text,'Catatan umum kelas.','timpa hanya saat diminta');
  saveHomeroomNote(session,pertama.id,'Diedit lagi setelah massal.');
  assert.equal(getHomeroomNote(session,pertama.id).text,'Diedit lagi setelah massal.','tetap bisa diedit individual');
});

test('Ekstrakurikuler dan kokurikuler memakai preset kelas serta dua predikat',()=>{
  assert.deepEqual(ACTIVITY_PREDICATES,['Cukup','Baik','Sangat Baik']);
  assert.equal(pramukaPresetForClass('2A'),'Pramuka Siaga');
  assert.equal(pramukaPresetForClass('5B'),'Pramuka Penggalang');
  assert.equal(pramukaDescriptionsForClass('2A').length,5);
  assert.equal(pramukaDescriptionsForClass('5B').length,5);
  assert.notDeepEqual(pramukaDescriptionsForClass('2A'),pramukaDescriptionsForClass('5B'));
  assert.equal(cocurricularDescriptionsForClass('3A').length,5);
  assert.equal(cocurricularDescriptionsForClass('6A').length,5);
  assert.notDeepEqual(cocurricularDescriptionsForClass('3A'),cocurricularDescriptionsForClass('6A'));
});

/* ------------------------------------------------------------------ Startup intro */

test('Opening lama dihapus dan aplikasi langsung menampilkan Login',()=>{
  const html=read('index.html'),css=read('src/styles/app.css');
  for(const jejak of ['assets/intro-logo.mp4','data-intro-screen','ui/intro.js','intro-active'])
    assert.equal(html.includes(jejak),false,`index.html tidak lagi memuat ${jejak}`);
  assert.doesNotMatch(css,/--intro-bg|\.intro-screen|intro-active/,'gaya intro dibuang seluruhnya');
  assert.match(html,/id="app"/,'wadah aplikasi tetap ada');
  assert.match(html,/src\/app\.js/,'app.js langsung merender Login');
  const capacitor=JSON.parse(read('capacitor.config.json'));
  assert.equal(capacitor.backgroundColor,'#ffffff','latar WebView tetap putih agar cetak PDF tidak berpinggiran hitam');
  const styles=read('android/app/src/main/res/values/styles.xml');
  assert.match(styles,/windowSplashScreenAnimatedIcon">@drawable\/splash_icon_transparent/,'tidak ada logo statis sebelum animasi');
  assert.match(styles,/windowSplashScreenBackground">#000000/);
});
