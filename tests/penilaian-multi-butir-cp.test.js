import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { setTeacherAssignment } from '../src/services/teacher-assignments.js';
import { loadDb, saveSubjectMapping, updateDb } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { listCpButir } from '../src/services/cp-butir.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';
import {
  getAssessmentSheet, saveAssessmentScores, saveAssessmentSettings,
} from '../src/services/assessment.js';
import { cpEvidenceKey, pindahkanEvidenceLama } from '../src/services/cp-evidence.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { calculateReportScore } from '../src/services/report.js';
import {
  buktiButirSiswa, capaianButirSiswa, ringkasanCapaianSiswa,
} from '../src/services/cp-attainment.js';
import {
  getStudentIntracurricularSelection, predikatOtomatisIntra,
  saveStudentIntracurricularSelection, setIntracurricularVisibility,
} from '../src/services/intracurricular.js';
import { getReportDocument } from '../src/services/documents.js';

/* BEBERAPA KEGIATAN PENILAIAN PADA KOMPONEN YANG SAMA.

   Dalam satu semester seorang guru melakukan Penilaian Harian lebih dari sekali, dan tiap kali
   yang diukur adalah kompetensi yang berbeda. Sampai sebelum perbaikan ini seluruh keterangan
   kompetensi menumpang pada satu catatan nilai per komponen, sehingga penilaian harian kedua
   menghapus bukti penilaian harian pertama - fakta penilaian yang sudah terjadi hilang.

   Berkas ini menguji dua hal sekaligus, dan keduanya harus benar bersamaan:

     BUKTI setiap Butir CP berdiri sendiri dan tidak pernah saling menimpa, dan

     NILAI AKHIR mata pelajaran tidak bergeser satu angka pun karenanya - Bobot tetap dihitung
     satu kali untuk satu komponen, berapa pun banyaknya bukti kompetensi di dalamnya. */

function useMemoryStorage(){
  const values=new Map();
  const buat=()=>({getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),clear:()=>values.clear()});
  globalThis.localStorage=buat();globalThis.sessionStorage=buat();
}

const SEMESTER=`Ganjil ${ACADEMIC_YEAR}`;
const admin=(semester=SEMESTER)=>({role:'admin',academicYear:ACADEMIC_YEAR,semester,userName:'Admin'});
const guru=(classId='5B',semester=SEMESTER)=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
const BOBOT={formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15};

function siapkan(classId='5B',semester=SEMESTER){
  const sesi=guru(classId,semester);
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  setTeacherAssignment(admin(semester),classId,
    {subjectIds:SUBJECTS_DEFAULT.map(item=>item.id),active:true});
  return sesi;
}
function tambahSiswa(sesi,index=1,nama=`Siswa ${index}`){
  return createStudent(sesi,{classId:sesi.classId,nis:`${sesi.classId}-${index}`,
    nisn:`77${String(index).padStart(8,'0')}`,religion:'Islam',name:nama,
    gender:index%2?'L':'P',photo:''});
}
/* Mapel dan butir selalu diambil dari data aplikasi, tidak pernah diketik, sehingga test ini
   tidak mengunci nama mata pelajaran maupun bunyi kompetensi tertentu. */
function mapelBerbutir(sesi,student,{minimal=3,jumlah=2}={}){
  const hasil=[];
  for(const item of listSubjectsForStudent(sesi,student)){
    let butir=[];
    try{butir=listCpButir(sesi,item.id,{activeOnly:true});}catch{continue;}
    if(butir.length>=minimal)hasil.push(item.id);
    if(hasil.length>=jumlah)break;
  }
  return hasil;
}
function aturKktp(sesi,subjectId,kktp){saveAssessmentSettings(sesi,subjectId,{...BOBOT,kktp});}
function nilaiButir(sesi,mapel,jenis,butirId,siswaId){
  return getAssessmentSheet(sesi,mapel,jenis,{cpButirId:butirId})
    .rows.find(row=>row.studentId===siswaId)?.score??null;
}
function simpan(sesi,mapel,jenis,butirId,siswaId,nilai){
  return saveAssessmentScores(sesi,mapel,jenis,{[siswaId]:nilai},{cpButirId:butirId});
}
/* Satu panggung baku: satu siswa, satu mapel dengan sekurangnya tiga Butir CP aktif. */
function panggung({classId='5B',semester=SEMESTER,kktp=75}={}){
  useMemoryStorage();
  const sesi=siapkan(classId,semester);
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true});
  aturKktp(sesi,mapel,kktp);
  return {sesi,siswa,mapel,A:butir[0],B:butir[1],C:butir[2]};
}
function jumlahBukti(){return Object.keys(loadDb().cpEvidenceScores||{}).length;}

/* ------------------------------------------- §23 BUKTI TIDAK SALING MENIMPA */

test('1. Penilaian Harian untuk Butir CP pertama tersimpan sebagai bukti butir itu',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),85);
  assert.deepEqual(buktiButirSiswa(sesi,mapel,siswa.id).get(A.id),
    [{assessmentType:'daily',assessmentLabel:'Penilaian Harian',score:85}]);
});

test('2. Penilaian Harian untuk Butir CP kedua tersimpan berdampingan',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),78);
});

test('3. Menilai Butir CP kedua TIDAK menghapus bukti Butir CP pertama',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),85,
    'inilah kehilangan yang diperbaiki: bukti butir pertama harus tetap 85');
});

test('4. Bukti Butir CP kedua tetap utuh setelah butir pertama dibaca ulang',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  nilaiButir(sesi,mapel,'daily',A.id,siswa.id);
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),78);
});

test('5. Butir CP ketiga pada komponen yang sama tidak menimpa dua butir sebelumnya',()=>{
  const {sesi,siswa,mapel,A,B,C}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',C.id,siswa.id,90);
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),85);
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),78);
  assert.equal(nilaiButir(sesi,mapel,'daily',C.id,siswa.id),90);
});

test('6. Kembali memilih Butir CP pertama menampilkan nilainya sendiri',()=>{
  const {sesi,siswa,mapel,A,B,C}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',C.id,siswa.id,90);
  const lembar=getAssessmentSheet(sesi,mapel,'daily',{cpButirId:A.id});
  assert.equal(lembar.cpButirId,A.id,'lembar menyebutkan butir yang sedang dibuka');
  assert.equal(lembar.rows.find(row=>row.studentId===siswa.id).score,85);
});

test('7. Kembali memilih Butir CP kedua menampilkan nilainya sendiri',()=>{
  const {sesi,siswa,mapel,A,B,C}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',C.id,siswa.id,90);
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),78);
});

test('8. Mengubah nilai satu Butir CP hanya mengubah butir itu',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',A.id,siswa.id,87);
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),87);
});

test('9. Butir CP kedua tetap 78 setelah butir pertama diubah',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',A.id,siswa.id,87);
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),78);
});

test('10. Isi Semua Nilai satu Butir CP tidak menimpa bukti Butir CP lain',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  fillAllAssessmentScores(sesi,mapel,80,{cpButirId:A.id});
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),80,'butir yang dipilih terisi');
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),78,'butir lain tidak tersentuh');
});

test('11. Bukti seorang siswa tidak menimpa bukti siswa lain',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const satu=tambahSiswa(sesi,1);const dua=tambahSiswa(sesi,2);
  const mapel=mapelBerbutir(sesi,satu)[0];
  const [A,B]=listCpButir(sesi,mapel,{activeOnly:true});
  aturKktp(sesi,mapel,75);
  saveAssessmentScores(sesi,mapel,'daily',{[satu.id]:85,[dua.id]:70},{cpButirId:A.id});
  saveAssessmentScores(sesi,mapel,'daily',{[satu.id]:78},{cpButirId:B.id});
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,dua.id),70,'siswa kedua tidak terpengaruh');
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,satu.id),85);
});

test('12. Bukti satu mata pelajaran tidak bocor ke mata pelajaran lain',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const [satu,dua]=mapelBerbutir(sesi,siswa,{jumlah:2});
  aturKktp(sesi,satu,75);aturKktp(sesi,dua,75);
  const butirSatu=listCpButir(sesi,satu,{activeOnly:true})[0];
  simpan(sesi,satu,'daily',butirSatu.id,siswa.id,85);
  const butirDua=listCpButir(sesi,dua,{activeOnly:true})[0];
  assert.equal(nilaiButir(sesi,dua,'daily',butirDua.id,siswa.id),null);
  assert.equal(buktiButirSiswa(sesi,dua,siswa.id).size,0);
});

test('13. Bukti satu semester tidak bocor ke semester lain',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  const genap={...sesi,semester:`Genap ${ACADEMIC_YEAR}`};
  saveSubjectMapping(genap,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  setTeacherAssignment(admin(genap.semester),genap.classId,
    {subjectIds:SUBJECTS_DEFAULT.map(item=>item.id),active:true});
  assert.equal(nilaiButir(genap,mapel,'daily',A.id,siswa.id),null);
});

test('14. Bukti satu rombel tidak bocor ke rombel lain',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  const lain=siapkan('5A');
  const siswaLain=tambahSiswa(lain,2);
  const butirLain=listCpButir(lain,mapel,{activeOnly:true})[0];
  assert.equal(nilaiButir(lain,mapel,'daily',butirLain.id,siswaLain.id),null);
  assert.equal(buktiButirSiswa(lain,mapel,siswaLain.id).size,0);
});

test('15. Menyimpan ulang kombinasi yang sama memperbarui, bukan menggandakan',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  const sesudahSatu=jumlahBukti();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',A.id,siswa.id,87);
  assert.equal(jumlahBukti(),sesudahSatu,'jumlah catatan bukti tidak bertambah');
  assert.deepEqual(buktiButirSiswa(sesi,mapel,siswa.id).get(A.id),
    [{assessmentType:'daily',assessmentLabel:'Penilaian Harian',score:87}]);
});

test('16. Butir CP berbeda menghasilkan catatan bukti tersendiri',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  const satu=jumlahBukti();
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  assert.equal(jumlahBukti(),satu+1,'butir kedua menambah satu catatan, bukan menimpa');
  const kunciA=cpEvidenceKey(sesi,mapel,siswa.id,'daily',A.id);
  const kunciB=cpEvidenceKey(sesi,mapel,siswa.id,'daily',B.id);
  assert.notEqual(kunciA,kunciB);
  assert.equal(loadDb().cpEvidenceScores[kunciA].score,85);
  assert.equal(loadDb().cpEvidenceScores[kunciB].score,78);
});

test('17. Seluruh bukti tetap ada setelah database dibaca ulang dari penyimpanan',()=>{
  const {sesi,siswa,mapel,A,B,C}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',C.id,siswa.id,90);
  /* Membaca ulang teks mentah localStorage: inilah yang terjadi setelah aplikasi dimuat ulang. */
  const mentah=JSON.parse(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'));
  const bukti=Object.values(mentah.cpEvidenceScores||{})
    .filter(record=>record.studentId===siswa.id&&record.assessmentType==='daily');
  assert.equal(bukti.length,3);
  assert.deepEqual(bukti.map(record=>record.score).sort((a,b)=>a-b),[78,85,90]);
});

test('18. Pemindahan bukti lama bersifat idempotent dan non-destruktif',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  /* Catatan bergaya 4087ede: keterangan kompetensi masih menumpang pada nilai komponen. */
  updateDb(db=>{
    db.assessmentScores[`${ACADEMIC_YEAR}|${SEMESTER}|5B|${mapel}|daily|${siswa.id}`]={
      studentId:siswa.id,classId:'5B',subjectId:mapel,semester:SEMESTER,academicYear:ACADEMIC_YEAR,
      assessmentType:'daily',score:85,cpButirId:A.id,
      createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-02T00:00:00.000Z'};
    return db;
  });
  let pertama=0,kedua=0,ketiga=0;
  updateDb(db=>{pertama=pindahkanEvidenceLama(db,sesi,mapel);return db;});
  updateDb(db=>{kedua=pindahkanEvidenceLama(db,sesi,mapel);return db;});
  updateDb(db=>{ketiga=pindahkanEvidenceLama(db,sesi,mapel);return db;});
  assert.equal(pertama,1,'sekali jalan memindahkan satu bukti');
  assert.equal(kedua,0,'jalan kedua tidak memindahkan apa pun lagi');
  assert.equal(ketiga,0,'dan seterusnya tetap nol');
  assert.equal(jumlahBukti(),1,'tidak ada salinan kedua');
  const db=loadDb();
  const asal=db.assessmentScores[`${ACADEMIC_YEAR}|${SEMESTER}|5B|${mapel}|daily|${siswa.id}`];
  assert.equal(asal.score,85,'catatan nilai aslinya tidak diubah');
  assert.equal(asal.cpButirId,A.id,'dan keterangan kompetensinya tidak dihapus');
});

test('19. Data 4087ede tetap kompatibel: buktinya tidak hilang oleh penilaian butir berikutnya',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  /* Keadaan persis seperti yang ditinggalkan 4087ede: hanya catatan nilai, belum ada koleksi
     bukti sama sekali. */
  updateDb(db=>{
    db.assessmentScores[`${ACADEMIC_YEAR}|${SEMESTER}|5B|${mapel}|daily|${siswa.id}`]={
      studentId:siswa.id,classId:'5B',subjectId:mapel,semester:SEMESTER,academicYear:ACADEMIC_YEAR,
      assessmentType:'daily',score:85,cpButirId:A.id,
      createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z'};
    db.cpEvidenceScores={};
    return db;
  });
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),85,'terbaca walau belum dipindahkan');
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),85,'dan tetap ada sesudahnya');
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),78);
});

test('20. Nilai legacy tanpa Butir CP tidak dihapus, tidak diubah, dan tidak menjadi bukti',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  const kunci=`${ACADEMIC_YEAR}|${SEMESTER}|5B|${mapel}|formative|${siswa.id}`;
  updateDb(db=>{
    db.assessmentScores[kunci]={studentId:siswa.id,classId:'5B',subjectId:mapel,semester:SEMESTER,
      academicYear:ACADEMIC_YEAR,assessmentType:'formative',score:82,
      createdAt:'2024-01-01T00:00:00.000Z',updatedAt:'2024-01-01T00:00:00.000Z'};
    return db;
  });
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  const record=loadDb().assessmentScores[kunci];
  assert.equal(record.score,82,'angkanya utuh');
  assert.equal(Object.hasOwn(record,'cpButirId'),false,'tidak ditebak kompetensinya');
  const bukti=buktiButirSiswa(sesi,mapel,siswa.id);
  assert.equal(bukti.get(A.id).length,1,'hanya bukti yang memang menyebut kompetensinya');
  assert.equal(bukti.get(A.id)[0].assessmentType,'daily');
  assert.equal(getAssessmentSheet(sesi,mapel,'formative').rows.find(row=>row.studentId===siswa.id).score,82,
    'dan tetap terbaca sebagai nilai komponen untuk Nilai Akhir');
});

/* ------------------------------------------- §24 CAPAIAN PER BUTIR CP */

test('21. Capaian satu butir hanya membaca bukti butir itu',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  const capaian=capaianButirSiswa(sesi,mapel,siswa.id);
  assert.equal(capaian.find(item=>item.cpButirId===A.id).capaian,85);
});

test('22. Capaian butir kedua hanya membaca bukti butir kedua',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  assert.equal(capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===B.id).capaian,78);
});

test('23. Satu butir dapat dibuktikan dua komponen sekaligus',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'formative',A.id,siswa.id,80);
  const bukti=buktiButirSiswa(sesi,mapel,siswa.id).get(A.id);
  assert.deepEqual(bukti.map(item=>item.assessmentType),['formative','daily'],
    'urutannya mengikuti urutan komponen aplikasi, bukan urutan penyimpanan');
  assert.deepEqual(bukti.map(item=>item.score),[80,85]);
});

test('24. Bukti butir lain tidak ikut menghitung capaian sebuah butir',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'formative',A.id,siswa.id,80);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'practice',B.id,siswa.id,86);
  const capaian=capaianButirSiswa(sesi,mapel,siswa.id);
  assert.equal(capaian.find(item=>item.cpButirId===A.id).capaian,83,'(80+85)/2');
  assert.equal(capaian.find(item=>item.cpButirId===B.id).capaian,82,'(78+86)/2');
});

test('25. Agregasi capaian deterministik: dibaca berkali-kali hasilnya sama persis',()=>{
  const {sesi,siswa,mapel,A,B,C}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'formative',A.id,siswa.id,80);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',C.id,siswa.id,90);
  const sekali=JSON.stringify(capaianButirSiswa(sesi,mapel,siswa.id));
  for(let ulang=0;ulang<5;ulang+=1)
    assert.equal(JSON.stringify(capaianButirSiswa(sesi,mapel,siswa.id)),sekali);
});

test('26. Butir aktif tanpa bukti tetap tidak dinilai dan tidak disimpulkan',()=>{
  const {sesi,siswa,mapel,A,C}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  const kosong=capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===C.id);
  assert.equal(kosong.capaian,null);
  assert.equal(kosong.dinilai,false);
  assert.equal(kosong.mencapai,null);
});

test('27. Kompetensi terkuat saat seri ditentukan urutan Butir CP, bukan urutan penyimpanan',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  /* Butir kedua disimpan lebih dulu, dengan capaian yang sama persis. */
  simpan(sesi,mapel,'daily',B.id,siswa.id,88);
  simpan(sesi,mapel,'daily',A.id,siswa.id,88);
  const ringkasan=ringkasanCapaianSiswa(sesi,mapel,siswa.id);
  assert.equal(ringkasan.terkuat.cpButirId,A.id);
  assert.equal(ringkasan.kekuatan.length,2,'serinya tetap dibawa lengkap');
});

test('28. KKTP Admin tetap sumber tunggal ketercapaian bukti',()=>{
  const {sesi,siswa,mapel,A}=panggung({kktp:80});
  simpan(sesi,mapel,'daily',A.id,siswa.id,78);
  assert.equal(capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===A.id).mencapai,false);
  aturKktp(sesi,mapel,75);
  assert.equal(capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===A.id).mencapai,true);
});

test('29. Tidak ada angka KKTP tersembunyi di dalam kode penyimpanan bukti',()=>{
  const sumber=[
    'src/services/cp-evidence.js','src/services/cp-attainment.js','src/services/assessment.js',
  ].map(berkas=>readFileSync(new URL(`../${berkas}`,import.meta.url),'utf8')).join('\n');
  /* Angka-angka yang beredar sebagai "KKTP Kurikulum Merdeka" tidak boleh menjadi ambang
     tersembunyi. DEFAULT_KKTP milik pengaturan penilaian sengaja dikecualikan: ia hanya nilai
     bawaan FORMULIR Bobot Penilaian, dan ketercapaian tidak pernah membacanya. */
  const tanpaDefault=sumber.replace(/const DEFAULT_KKTP=75;/,'');
  for(const angka of ['66','70','80'])
    assert.equal(new RegExp(`kktp\\s*[=:]\\s*${angka}\\b`,'i').test(tanpaDefault),false,
      `tidak ada KKTP ${angka} yang dipaku di dalam kode`);
});

test('30. Mengubah KKTP tidak menyentuh satu pun angka bukti',()=>{
  const {sesi,siswa,mapel,A,B}=panggung({kktp:75});
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  const sebelum=JSON.stringify(loadDb().cpEvidenceScores);
  aturKktp(sesi,mapel,80);
  assert.equal(JSON.stringify(loadDb().cpEvidenceScores),sebelum);
});

/* ------------------------------------------- §25 NILAI AKHIR TIDAK BERGESER */

test('31. Beberapa bukti pada komponen yang sama tidak membuat Bobot dihitung berkali-kali',()=>{
  const angka={formative:82,daily:76,practice:91,scopeSummative:68,semesterSummative:74};

  /* Satu bukti per komponen - keadaan sebelum perubahan penyimpanan. */
  const satu=panggung();
  for(const [jenis,nilai] of Object.entries(angka))
    simpan(satu.sesi,satu.mapel,jenis,satu.A.id,satu.siswa.id,nilai);
  const sebelum=calculateReportScore(satu.sesi,satu.mapel,satu.siswa.id);

  /* Komponen, angka komponen, dan Bobot yang sama persis - hanya saja setiap komponen kini
     juga menyimpan bukti untuk dua Butir CP tambahan. */
  const banyak=panggung();
  for(const [jenis,nilai] of Object.entries(angka)){
    simpan(banyak.sesi,banyak.mapel,jenis,banyak.B.id,banyak.siswa.id,55);
    simpan(banyak.sesi,banyak.mapel,jenis,banyak.C.id,banyak.siswa.id,99);
    simpan(banyak.sesi,banyak.mapel,jenis,banyak.A.id,banyak.siswa.id,nilai);
  }
  const sesudah=calculateReportScore(banyak.sesi,banyak.mapel,banyak.siswa.id);

  assert.equal(sesudah.componentCount,5,'komponennya tetap lima, tidak bertambah oleh bukti');
  assert.equal(sesudah.filledCount,5);
  assert.equal(sesudah.weightTotal,sebelum.weightTotal,'penyebut bobotnya sama persis');
  assert.equal(sesudah.rawScore,sebelum.rawScore);
  assert.equal(sesudah.finalScore,sebelum.finalScore);
  assert.deepEqual(sesudah.components.map(item=>[item.id,item.score,item.weight]),
    sebelum.components.map(item=>[item.id,item.score,item.weight]));
});

test('32. Nilai Akhir tanpa metadata kompetensi sama dengan Nilai Akhir dengan bukti CP',()=>{
  const angka={formative:82,daily:76,practice:91,scopeSummative:68,semesterSummative:74};

  const tanpa=panggung();
  for(const [jenis,nilai] of Object.entries(angka))
    saveAssessmentScores(tanpa.sesi,tanpa.mapel,jenis,{[tanpa.siswa.id]:nilai});
  const polos=calculateReportScore(tanpa.sesi,tanpa.mapel,tanpa.siswa.id);

  const dengan=panggung();
  for(const [jenis,nilai] of Object.entries(angka))
    simpan(dengan.sesi,dengan.mapel,jenis,dengan.A.id,dengan.siswa.id,nilai);
  const berbukti=calculateReportScore(dengan.sesi,dengan.mapel,dengan.siswa.id);

  assert.equal(berbukti.rawScore,polos.rawScore);
  assert.equal(berbukti.finalScore,polos.finalScore);
  assert.equal(berbukti.masteryStatus,polos.masteryStatus);
});

test('33. Nilai komponen mengikuti kegiatan penilaian terakhir pada komponen itu',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  /* Satu komponen tetap menyumbang SATU angka ke Nilai Akhir - itulah yang menjaga Bobot tidak
     berlipat. Angka itu adalah nilai yang terakhir disimpan pada komponen tersebut, persis
     seperti sebelum koleksi bukti ada. */
  assert.equal(getAssessmentSheet(sesi,mapel,'daily').rows.find(row=>row.studentId===siswa.id).score,78);
  const nilai=calculateReportScore(sesi,mapel,siswa.id);
  assert.equal(nilai.components.find(item=>item.id==='daily').score,78);
});

test('34. Mengosongkan bukti satu butir tidak menghapus nilai komponen yang masih berbukti',()=>{
  const {sesi,siswa,mapel,A,B}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',B.id,siswa.id,78);
  simpan(sesi,mapel,'daily',B.id,siswa.id,'');
  assert.equal(nilaiButir(sesi,mapel,'daily',B.id,siswa.id),null,'bukti butir kedua terhapus');
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),85,'bukti butir pertama utuh');
  assert.equal(getAssessmentSheet(sesi,mapel,'daily').rows.find(row=>row.studentId===siswa.id).score,85,
    'nilai komponen kembali ke bukti yang masih tersisa, bukan hilang');
});

test('35. Mengosongkan bukti terakhir menghapus nilai komponen seperti sebelumnya',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  simpan(sesi,mapel,'daily',A.id,siswa.id,'');
  assert.equal(getAssessmentSheet(sesi,mapel,'daily').rows.find(row=>row.studentId===siswa.id).saved,false);
  assert.equal(calculateReportScore(sesi,mapel,siswa.id).components.find(item=>item.id==='daily').score,null);
});

/* ------------------------------------------- §26 INTRAKURIKULER DAN RAPOR */

test('36. Predikat Intrakurikuler mengikuti capaian gabungan seluruh butir yang dinilai',()=>{
  const {sesi,siswa,mapel,A,B}=panggung({kktp:75});
  simpan(sesi,mapel,'daily',A.id,siswa.id,92);
  simpan(sesi,mapel,'daily',B.id,siswa.id,90);
  /* Inilah rantai §18: PENILAIAN -> BUKTI -> CAPAIAN -> KKTP -> RUBRIK -> INTRAKURIKULER.
     Predikatnya dibaca dari bukti, bukan ditebak guru. */
  const otomatis=predikatOtomatisIntra(sesi,siswa.id,mapel);
  assert.equal(otomatis.butirDinilai,2,'kedua butir ikut, bukti butir pertama tidak hilang');
  assert.equal(otomatis.capaian,91,'(92+90)/2');
  assert.equal(otomatis.predicate,'Sangat Baik');
});

test('37. Bukti butir kedua ikut menggeser predikat, buktinya tidak diabaikan',()=>{
  const {sesi,siswa,mapel,A,B}=panggung({kktp:75});
  simpan(sesi,mapel,'daily',A.id,siswa.id,92);
  const hanyaSatu=predikatOtomatisIntra(sesi,siswa.id,mapel);
  simpan(sesi,mapel,'daily',B.id,siswa.id,60);
  const berdua=predikatOtomatisIntra(sesi,siswa.id,mapel);
  assert.equal(hanyaSatu.predicate,'Sangat Baik');
  assert.equal(berdua.butirDinilai,2);
  assert.notEqual(berdua.predicate,'Sangat Baik',
    'satu butir jauh di bawah KKTP tidak boleh tersembunyi di balik predikat tertinggi');
});

test('38. Hanya Intrakurikuler yang ditandai tampil yang masuk ke Rapor',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  saveStudentIntracurricularSelection(sesi,siswa.id,
    {subjectId:mapel,butirIds:[A.id],jenis:'teori',predicate:'Baik'});
  assert.equal(getReportDocument(sesi,siswa.id).intracurricular.length,1);
  setIntracurricularVisibility(sesi,siswa.id,mapel,false);
  assert.equal(getReportDocument(sesi,siswa.id).intracurricular.length,0);
});

test('39. Uncheck menyembunyikan dari Rapor tanpa menghapus data maupun bukti',()=>{
  const {sesi,siswa,mapel,A}=panggung();
  simpan(sesi,mapel,'daily',A.id,siswa.id,85);
  saveStudentIntracurricularSelection(sesi,siswa.id,
    {subjectId:mapel,butirIds:[A.id],jenis:'teori',predicate:'Baik'});
  setIntracurricularVisibility(sesi,siswa.id,mapel,false);
  const tersimpan=getStudentIntracurricularSelection(sesi,siswa.id,mapel);
  assert.ok(tersimpan,'catatannya masih ada');
  assert.deepEqual(tersimpan.butirIds,[A.id],'pilihan butirnya tidak hilang');
  assert.equal(tersimpan.includeInReport,false,'yang berubah hanya penandanya');
  assert.equal(nilaiButir(sesi,mapel,'daily',A.id,siswa.id),85,'dan buktinya juga tidak hilang');
});

test('40. Rapor tetap satu Nilai Akhir per mapel walau buktinya banyak',()=>{
  const {sesi,siswa,mapel,A,B,C}=panggung();
  for(const jenis of ['formative','daily','practice','scopeSummative','semesterSummative']){
    simpan(sesi,mapel,jenis,A.id,siswa.id,85);
    simpan(sesi,mapel,jenis,B.id,siswa.id,78);
    simpan(sesi,mapel,jenis,C.id,siswa.id,90);
  }
  const baris=getReportDocument(sesi,siswa.id).subjects.filter(item=>item.subject.id===mapel);
  assert.equal(baris.length,1,'satu baris nilai untuk satu mata pelajaran');
  /* Lima belas bukti kompetensi di belakangnya tetap menghasilkan lima komponen berbobot,
     satu Nilai Akhir, dan satu baris rapor. */
  const nilai=calculateReportScore(sesi,mapel,siswa.id);
  assert.equal(nilai.componentCount,5);
  assert.equal(nilai.weightTotal,100);
  assert.equal(typeof nilai.finalScore,'number');
});
