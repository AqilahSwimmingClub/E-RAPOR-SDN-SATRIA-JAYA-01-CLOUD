import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { setTeacherAssignment } from '../src/services/teacher-assignments.js';
import { loadDb, saveSubjectMapping } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { listCpButir, setCpButirActive } from '../src/services/cp-butir.js';
import { createLearningObjective } from '../src/services/objectives.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';
import {
  getAssessmentSheet, saveAssessmentScores, saveAssessmentSettings,
  PESAN_BUTIR_NILAI_WAJIB,
} from '../src/services/assessment.js';
import { fillAllAssessmentScores } from '../src/services/assessment-bulk.js';
import { calculateReportScore } from '../src/services/report.js';
import {
  buktiButirSiswa, capaianButirSiswa, hitungCapaianButir, komposisiDeskripsiCapaian,
  kktpSudahDiatur, PESAN_KKTP_BELUM_DIATUR, predikatIntraDariCapaian, ringkasanCapaianSiswa,
} from '../src/services/cp-attainment.js';
import {
  getStudentIntracurricularSelection, saveStudentIntracurricularSelection,
  setIntracurricularVisibility,
} from '../src/services/intracurricular.js';
import { saveStudentIntracurricular } from '../src/services/completeness.js';
import { getReportDocument } from '../src/services/documents.js';

/* PENILAIAN → BUTIR CP → CAPAIAN → KKTP → DESKRIPSI.

   Rantai inilah yang diuji berkas ini, beserta dua batas yang menjaganya tetap jujur:

     Angka nilai TIDAK PERNAH berubah artinya karena metadata kompetensi ditambahkan, dan
     Nilai Akhir mata pelajaran tidak bergeser satu angka pun.

     Kesimpulan tentang penguasaan hanya diambil dari kompetensi yang MEMANG sudah dinilai,
     dengan KKTP yang MEMANG sudah ditetapkan sekolah. */

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

function siapkan(classId='5B',semester=SEMESTER,{mapel=null}={}){
  const sesi=guru(classId,semester);
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  setTeacherAssignment(admin(semester),classId,
    {subjectIds:mapel||SUBJECTS_DEFAULT.map(item=>item.id),active:true});
  return sesi;
}
function tambahSiswa(sesi,index=1,nama=`Siswa ${index}`){
  return createStudent(sesi,{classId:sesi.classId,nis:`${sesi.classId}-${index}`,
    nisn:`66${String(index).padStart(8,'0')}`,religion:'Islam',name:nama,
    gender:index%2?'L':'P',photo:''});
}
/* Mapel dan butir diambil dari data aplikasi, tidak diketik, sehingga test tidak mengunci
   nama mata pelajaran atau bunyi kompetensi tertentu. */
function mapelBerbutir(sesi,student,jumlah=2){
  const hasil=[];
  for(const item of listSubjectsForStudent(sesi,student)){
    let butir=[];
    try{butir=listCpButir(sesi,item.id,{activeOnly:true});}catch{continue;}
    if(butir.length>=2)hasil.push(item.id);
    if(hasil.length>=jumlah)break;
  }
  return hasil;
}
function aturKktp(sesi,subjectId,kktp){
  saveAssessmentSettings(sesi,subjectId,{...BOBOT,kktp});
}

/* ------------------------------------------- §35 PENILAIAN ↔ BUTIR CP */

test('1. Nilai baru menyimpan hubungan ke Butir CP aktif yang sedang dinilai',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:85},{cpButirId:butir.id});
  const bukti=buktiButirSiswa(sesi,mapel,siswa.id);
  assert.deepEqual(bukti.get(butir.id),
    [{assessmentType:'daily',assessmentLabel:'Penilaian Harian',score:85}]);
});

test('2. Butir CP nonaktif ditolak untuk penilaian baru',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  setCpButirActive(sesi,mapel,butir.id,false);
  assert.throws(()=>saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:85},
    {cpButirId:butir.id}),new RegExp(PESAN_BUTIR_NILAI_WAJIB));
});

test('3. Butir CP milik mata pelajaran lain ditolak',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const [pertama,kedua]=mapelBerbutir(sesi,siswa,2);
  const butirLain=listCpButir(sesi,kedua,{activeOnly:true})[0];
  assert.throws(()=>saveAssessmentScores(sesi,pertama,'daily',{[siswa.id]:85},
    {cpButirId:butirLain.id}),new RegExp(PESAN_BUTIR_NILAI_WAJIB));
});

test('4. Mata pelajaran di luar penugasan Guru ditolak sebelum Butir CP diperiksa',()=>{
  useMemoryStorage();
  const sesi=guru();
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  const siswa=tambahSiswa(sesi);
  const semua=SUBJECTS_DEFAULT.map(item=>item.id);
  /* Hanya mapel pertama yang ditugaskan Admin. */
  setTeacherAssignment(admin(),'5B',{subjectIds:[semua[0]],active:true});
  assert.throws(()=>saveAssessmentScores(sesi,semua[3],'daily',{[siswa.id]:85},
    {cpButirId:'apa pun'}),/tidak termasuk penugasan|tidak aktif/i);
});

test('5. Id butir yang diketik sendiri ditolak di lapisan layanan',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  for(const palsu of ['','   ','butir-karangan','../../lain'])
    assert.throws(()=>saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:85},
      {cpButirId:palsu}),new RegExp(PESAN_BUTIR_NILAI_WAJIB),`id "${palsu}" ditolak`);
});

test('6. Tujuan Pembelajaran legacy tidak dapat dipakai sebagai Butir CP penilaian',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const tp=createLearningObjective(sesi,mapel,{code:'TP-LAMA',description:'memahami konsep lama.'});
  assert.throws(()=>saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:85},
    {cpButirId:tp.id}),new RegExp(PESAN_BUTIR_NILAI_WAJIB));
});

test('7. Bukti satu siswa tidak bocor ke siswa lain',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const a=tambahSiswa(sesi,1,'Adwa');const b=tambahSiswa(sesi,2,'Budi');
  const mapel=mapelBerbutir(sesi,a)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveAssessmentScores(sesi,mapel,'daily',{[a.id]:90},{cpButirId:butir.id});
  assert.equal(buktiButirSiswa(sesi,mapel,a.id).get(butir.id).length,1);
  assert.equal(buktiButirSiswa(sesi,mapel,b.id).size,0);
});

test('8. Bukti satu mata pelajaran tidak bocor ke mata pelajaran lain',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const [pertama,kedua]=mapelBerbutir(sesi,siswa,2);
  const butir=listCpButir(sesi,pertama,{activeOnly:true})[0];
  saveAssessmentScores(sesi,pertama,'daily',{[siswa.id]:90},{cpButirId:butir.id});
  assert.equal(buktiButirSiswa(sesi,pertama,siswa.id).size,1);
  assert.equal(buktiButirSiswa(sesi,kedua,siswa.id).size,0);
});

test('9. Bukti tidak bocor antar rombel maupun antar semester',()=>{
  useMemoryStorage();
  const ganjil=siapkan('5B',SEMESTER);
  const genap=siapkan('5B',`Genap ${ACADEMIC_YEAR}`);
  const lain=siapkan('5C',SEMESTER);
  const siswa=tambahSiswa(ganjil,1,'Adwa');
  const mapel=mapelBerbutir(ganjil,siswa)[0];
  const butir=listCpButir(ganjil,mapel,{activeOnly:true})[0];
  saveAssessmentScores(ganjil,mapel,'daily',{[siswa.id]:90},{cpButirId:butir.id});
  assert.equal(buktiButirSiswa(ganjil,mapel,siswa.id).size,1);
  assert.equal(buktiButirSiswa(genap,mapel,siswa.id).size,0,'Ganjil tidak bocor ke Genap');
  assert.equal(buktiButirSiswa(lain,mapel,siswa.id).size,0,'rombel lain tidak terpengaruh');
});

test('10. Hubungan Butir CP bertahan setelah dibaca ulang dari penyimpanan',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:85},{cpButirId:butir.id});
  /* Dibaca langsung dari database, bukan dari cache pemanggil. */
  const tersimpan=Object.values(loadDb().assessmentScores)
    .find(item=>item.studentId===siswa.id&&item.assessmentType==='daily');
  assert.equal(tersimpan.cpButirId,butir.id);
  assert.equal(tersimpan.score,85);
});

test('11. Isi Semua Nilai menyimpan hubungan Butir CP pada kelima komponen',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  fillAllAssessmentScores(sesi,mapel,80,{cpButirId:butir.id});
  const bukti=buktiButirSiswa(sesi,mapel,siswa.id).get(butir.id);
  assert.equal(bukti.length,5,'kelima komponen menjadi bukti butir yang sama');
  assert.deepEqual([...new Set(bukti.map(item=>item.score))],[80]);
});

test('12. Nilai lama tanpa hubungan CP tetap aman dan tidak ditebak kompetensinya',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  /* Nilai disimpan TANPA menyebut Butir CP - persis nilai yang sudah ada sebelum fitur ini. */
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:88});
  assert.equal(getAssessmentSheet(sesi,mapel,'daily').rows[0].score,88,'nilainya utuh');
  assert.equal(buktiButirSiswa(sesi,mapel,siswa.id).size,0,
    'tidak dipasangkan ke butir mana pun, termasuk butir pertama');
});

test('13. Menyimpan ulang tanpa menyebut butir tidak memutus hubungan yang sudah ada',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:85},{cpButirId:butir.id});
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:90});
  const bukti=buktiButirSiswa(sesi,mapel,siswa.id).get(butir.id);
  assert.deepEqual(bukti,[{assessmentType:'daily',assessmentLabel:'Penilaian Harian',score:90}]);
});

/* ------------------------------------------- §38 NILAI AKHIR TIDAK BERGESER */

test('14. Menambahkan hubungan Butir CP tidak mengubah Nilai Akhir sedikit pun',()=>{
  const angka={formative:82,daily:76,practice:91,scopeSummative:68,semesterSummative:74};

  /* Tanpa metadata kompetensi. */
  useMemoryStorage();
  let sesi=siapkan();let siswa=tambahSiswa(sesi);
  let mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  for(const [jenis,nilai] of Object.entries(angka))
    saveAssessmentScores(sesi,mapel,jenis,{[siswa.id]:nilai});
  const tanpa=calculateReportScore(sesi,mapel,siswa.id);

  /* Angka dan bobot yang sama persis, kali ini setiap nilai membawa Butir CP-nya. */
  useMemoryStorage();
  sesi=siapkan();siswa=tambahSiswa(sesi);
  mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const butir=listCpButir(sesi,mapel,{activeOnly:true});
  let i=0;
  for(const [jenis,nilai] of Object.entries(angka)){
    saveAssessmentScores(sesi,mapel,jenis,{[siswa.id]:nilai},
      {cpButirId:butir[i%butir.length].id});
    i+=1;
  }
  const dengan=calculateReportScore(sesi,mapel,siswa.id);

  assert.equal(dengan.rawScore,tanpa.rawScore,'nilai mentah identik');
  assert.equal(dengan.roundedScore,tanpa.roundedScore,'pembulatan identik');
  assert.equal(dengan.finalScore,tanpa.finalScore,'Nilai Akhir identik');
  assert.equal(dengan.masteryStatus,tanpa.masteryStatus);
});

/* ------------------------------------------- §36 CAPAIAN PER BUTIR CP */

test('15. Capaian satu butir hanya memakai bukti butir itu sendiri',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const [a,b]=listCpButir(sesi,mapel,{activeOnly:true});
  saveAssessmentScores(sesi,mapel,'formative',{[siswa.id]:80},{cpButirId:a.id});
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:90},{cpButirId:a.id});
  saveAssessmentScores(sesi,mapel,'practice',{[siswa.id]:60},{cpButirId:b.id});
  const capaian=capaianButirSiswa(sesi,mapel,siswa.id);
  const capA=capaian.find(item=>item.cpButirId===a.id);
  const capB=capaian.find(item=>item.cpButirId===b.id);
  assert.equal(capA.capaian,85,'rata-rata 80 dan 90');
  assert.equal(capB.capaian,60,'bukti butir A tidak ikut menghitung butir B');
});

test('16. Agregasi beberapa bukti bersifat deterministik dan dapat diulang',()=>{
  assert.equal(hitungCapaianButir([{score:80},{score:90}]),85);
  assert.equal(hitungCapaianButir([{score:90},{score:80}]),85,'urutan tidak mengubah hasil');
  assert.equal(hitungCapaianButir([{score:70},{score:75},{score:80}]),75);
  /* Pembulatan ke bilangan bulat terdekat, sama seperti Nilai Akhir. */
  assert.equal(hitungCapaianButir([{score:74},{score:75}]),75);
  assert.equal(hitungCapaianButir([]),null,'tanpa bukti tidak ada capaian');
});

test('17. Butir aktif tanpa bukti tidak disimpulkan mencapai maupun belum mencapai',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const butir=listCpButir(sesi,mapel,{activeOnly:true});
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:90},{cpButirId:butir[0].id});
  const ringkasan=ringkasanCapaianSiswa(sesi,mapel,siswa.id);
  assert.equal(ringkasan.dinilai.length,1);
  assert.ok(ringkasan.belumDinilai.length>0);
  for(const item of ringkasan.belumDinilai){
    assert.equal(item.capaian,null);
    assert.equal(item.mencapai,null,'bukan true, bukan pula false');
    assert.equal(item.dinilai,false);
  }
  assert.equal(ringkasan.penguatan.length,0,'butir tanpa bukti bukan area penguatan');
});

test('18. Seri capaian tertinggi diputus mengikuti urutan Butir CP, bukan urutan penyimpanan',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const [a,b]=listCpButir(sesi,mapel,{activeOnly:true});
  /* Butir KEDUA dinilai lebih dulu, keduanya bernilai sama. */
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:88},{cpButirId:b.id});
  saveAssessmentScores(sesi,mapel,'formative',{[siswa.id]:88},{cpButirId:a.id});
  const ringkasan=ringkasanCapaianSiswa(sesi,mapel,siswa.id);
  assert.equal(ringkasan.kekuatan.length,2,'keduanya seri tertinggi');
  assert.equal(ringkasan.terkuat.cpButirId,a.id,'yang lebih dulu pada urutan Butir CP');
  /* Diulang: hasilnya sama persis. */
  assert.equal(ringkasanCapaianSiswa(sesi,mapel,siswa.id).terkuat.cpButirId,a.id);
});

/* ------------------------------------------- §37 KKTP */

test('19. KKTP adalah milik Admin dan tidak pernah ditebak',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  assert.equal(kktpSudahDiatur(sesi,mapel),false);
  assert.throws(()=>capaianButirSiswa(sesi,mapel,siswa.id),
    new RegExp(PESAN_KKTP_BELUM_DIATUR.slice(0,40)));
  aturKktp(sesi,mapel,75);
  assert.equal(kktpSudahDiatur(sesi,mapel),true);
  assert.equal(ringkasanCapaianSiswa(sesi,mapel,siswa.id).kktp,75);
});

test('20. Batas ketercapaian dibaca tepat pada angka KKTP',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  const capaianDenganKktp=(nilai,kktp)=>{
    aturKktp(sesi,mapel,kktp);
    saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:nilai},{cpButirId:butir.id});
    return capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===butir.id);
  };
  assert.equal(capaianDenganKktp(75,75).mencapai,true,'KKTP 75, capaian 75');
  assert.equal(capaianDenganKktp(74,75).mencapai,false,'KKTP 75, capaian 74');
  assert.equal(capaianDenganKktp(79,80).mencapai,false,'KKTP 80, capaian 79');
  assert.equal(capaianDenganKktp(80,80).mencapai,true,'KKTP 80, capaian 80');
});

test('21. Mengubah KKTP hanya mengubah tafsirnya, bukan angka nilai maupun Nilai Akhir',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  aturKktp(sesi,mapel,75);
  for(const jenis of ['formative','daily','practice','scopeSummative','semesterSummative'])
    saveAssessmentScores(sesi,mapel,jenis,{[siswa.id]:79},{cpButirId:butir.id});
  const sebelum=calculateReportScore(sesi,mapel,siswa.id);
  const capaianSebelum=capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===butir.id);
  assert.equal(capaianSebelum.mencapai,true);

  saveAssessmentSettings(sesi,mapel,{...BOBOT,kktp:80});

  const sesudah=calculateReportScore(sesi,mapel,siswa.id);
  const capaianSesudah=capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===butir.id);
  assert.equal(getAssessmentSheet(sesi,mapel,'daily').rows[0].score,79,'angka nilai tidak berubah');
  assert.equal(sesudah.rawScore,sebelum.rawScore,'Nilai Akhir mentah tidak berubah');
  assert.equal(sesudah.finalScore,sebelum.finalScore,'Nilai Akhir tidak berubah');
  assert.equal(capaianSesudah.capaian,capaianSebelum.capaian,'capaian kompetensi tidak berubah');
  assert.equal(capaianSesudah.mencapai,false,'yang berubah hanya tafsir ketercapaiannya');
});

test('22. KKTP tidak bocor antar mapel, antar rombel, maupun antar semester',()=>{
  useMemoryStorage();
  const limaB=siapkan('5B',SEMESTER);
  const limaC=siapkan('5C',SEMESTER);
  const genap=siapkan('5B',`Genap ${ACADEMIC_YEAR}`);
  const siswa=tambahSiswa(limaB);
  const [a,b]=mapelBerbutir(limaB,siswa,2);
  aturKktp(limaB,a,70);
  assert.equal(kktpSudahDiatur(limaB,b),false,'mapel lain belum diatur');
  assert.equal(kktpSudahDiatur(limaC,a),false,'rombel lain belum diatur');
  assert.equal(kktpSudahDiatur(genap,a),false,'semester lain belum diatur');
  aturKktp(limaB,b,85);
  assert.equal(kktpSudahDiatur(limaB,a)&&kktpSudahDiatur(limaB,b),true);
});

test('23. Tidak ada angka KKTP nasional yang ditanam di dalam kode',()=>{
  /* Angka contoh pada panduan mana pun tidak boleh menjadi aturan aplikasi. Yang diperiksa di
     sini adalah lapisan ketercapaian kompetensi: ia tidak boleh memuat satu pun angka KKTP
     tertulis, sebab satu-satunya sumbernya adalah pengaturan Admin. */
  const sumber=readFileSync(new URL('../src/services/cp-attainment.js',import.meta.url),'utf8');
  const tanpaKomentar=sumber.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  for(const angka of ['66','70','75','80'])
    assert.equal(new RegExp(`\\bkktp\\b[^\\n]{0,24}\\b${angka}\\b`,'i').test(tanpaKomentar),false,
      `tidak ada KKTP ${angka} yang ditanam`);
  assert.match(tanpaKomentar,/assessmentSettings/,'KKTP dibaca dari pengaturan yang disimpan Admin');
});

test('24. KKTP dan Rubrik tidak menghasilkan kesimpulan yang bertentangan',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  aturKktp(sesi,mapel,75);
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:70},{cpButirId:butir.id});
  const capaian=capaianButirSiswa(sesi,mapel,siswa.id).find(item=>item.cpButirId===butir.id);
  assert.equal(capaian.mencapai,false);
  assert.equal(['SANGAT BAIK','BAIK'].includes(capaian.kategori),false,
    `capaian di bawah KKTP tidak boleh berkategori ${capaian.kategori}`);
});

/* ------------------------------------------- §39 DESKRIPSI DARI BUKTI */

test('25. Kompetensi terkuat dan area penguatan diambil dari capaian, bukan nilai tertinggi mapel',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi,1,'Adwa');
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const [a,b]=listCpButir(sesi,mapel,{activeOnly:true});
  saveAssessmentScores(sesi,mapel,'formative',{[siswa.id]:95},{cpButirId:a.id});
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:60},{cpButirId:b.id});
  const komposisi=komposisiDeskripsiCapaian(sesi,mapel,siswa.id,{studentName:'Adwa'});
  assert.equal(komposisi.terkuat.cpButirId,a.id);
  assert.deepEqual(komposisi.penguatan.map(item=>item.cpButirId),[b.id]);
  assert.equal(komposisi.kompetensiKuat[0],a.teori||a.praktik);
  assert.equal(komposisi.seluruhnyaMencapai,false);
});

test('26. Bila seluruh kompetensi yang dinilai mencapai KKTP, tidak ada kekurangan yang dikarang',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi,1,'Adwa');
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const [a,b]=listCpButir(sesi,mapel,{activeOnly:true});
  saveAssessmentScores(sesi,mapel,'formative',{[siswa.id]:90},{cpButirId:a.id});
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:80},{cpButirId:b.id});
  const komposisi=komposisiDeskripsiCapaian(sesi,mapel,siswa.id,{studentName:'Adwa'});
  assert.equal(komposisi.seluruhnyaMencapai,true);
  assert.deepEqual(komposisi.kompetensiPenguatan,[]);
});

test('27. Kompetensi tanpa bukti tidak pernah masuk ke dalam bahan deskripsi',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi,1,'Adwa');
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const butir=listCpButir(sesi,mapel,{activeOnly:true});
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:90},{cpButirId:butir[0].id});
  const komposisi=komposisiDeskripsiCapaian(sesi,mapel,siswa.id,{studentName:'Adwa'});
  const dipakai=new Set([...komposisi.kompetensiKuat,...komposisi.kompetensiPenguatan]);
  for(const item of butir.slice(1)){
    const frasa=item.teori||item.praktik;
    if(frasa)assert.equal(dipakai.has(frasa),false,`${frasa} belum dinilai sehingga tidak dipakai`);
  }
});

test('28. Bahan deskripsi tidak memuat angka, kode CP, fase, maupun istilah teknis',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi,1,'Adwa');
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:90},{cpButirId:butir.id});
  const komposisi=komposisiDeskripsiCapaian(sesi,mapel,siswa.id,{studentName:'Adwa'});
  for(const frasa of [...komposisi.kompetensiKuat,...komposisi.kompetensiPenguatan]){
    assert.equal(/\d/.test(frasa),false,`tanpa angka: ${frasa}`);
    assert.equal(/\bfase\s*[abc]\b/i.test(frasa),false,`tanpa fase: ${frasa}`);
    assert.equal(frasa.includes(butir.id),false,'tanpa id butir');
    assert.equal(/cpButirId|objectiveIds|KKTP/i.test(frasa),false,`tanpa istilah teknis: ${frasa}`);
  }
});

test('29. Tanpa satu pun bukti, tidak ada bahan deskripsi yang dihasilkan',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi,1,'Adwa');
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  assert.equal(komposisiDeskripsiCapaian(sesi,mapel,siswa.id,{studentName:'Adwa'}),null);
});

/* ------------------------------------------- §26 PREDIKAT INTRAKURIKULER OTOMATIS */

test('30. Predikat Intrakurikuler dibaca dari capaian, bukan ditebak guru',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi,1,'Adwa');
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveAssessmentScores(sesi,mapel,'daily',{[siswa.id]:60},{cpButirId:butir.id});
  const otomatis=predikatIntraDariCapaian(sesi,mapel,siswa.id);
  assert.equal(otomatis.capaian,60);
  assert.equal(otomatis.mencapai,false);
  /* Capaian di bawah KKTP tidak boleh menghasilkan predikat memuji. */
  assert.equal(['Sangat Baik','Baik'].includes(otomatis.predicate),false,
    `capaian di bawah KKTP tidak boleh berpredikat ${otomatis.predicate}`);
});

test('31. Tanpa bukti nilai, predikat tetap menjadi pilihan guru',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi,1,'Adwa');
  const mapel=mapelBerbutir(sesi,siswa)[0];
  aturKktp(sesi,mapel,75);
  assert.equal(predikatIntraDariCapaian(sesi,mapel,siswa.id),null,'aplikasi tidak menebak');
});

/* ------------------------------------------- §34 TAMPIL DI RAPOR: EKSPLISIT SAJA */

test('32. Catatan lama tanpa penanda tampil tidak muncul pada rapor',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  /* Catatan gaya lama: tersimpan, tetapi tidak pernah menyatakan kehendak tampil. */
  saveStudentIntracurricular(sesi,siswa.id,{activity:'Kegiatan Lama',predicate:'Baik',
    description:'Deskripsi lama.',subjectId:mapel});
  assert.deepEqual(getReportDocument(sesi,siswa.id).intracurricular,[],
    'keberadaan catatan bukan persetujuan untuk mencetaknya');
  /* Datanya tetap ada dan tinggal dicentang. */
  assert.equal(Object.keys(loadDb().intracurricularScores).length,1);
});

test('33. Penanda false, null, dan undefined sama-sama berarti tidak tampil',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  for(const penanda of [false,null,undefined]){
    saveStudentIntracurricular(sesi,siswa.id,{activity:'Kegiatan',predicate:'Baik',
      description:'Deskripsi.',subjectId:mapel,includeInReport:penanda});
    assert.deepEqual(getReportDocument(sesi,siswa.id).intracurricular,[],
      `penanda ${String(penanda)} berarti tidak tampil`);
  }
});

test('34. Hanya penanda true yang menampilkan, dan mencentang catatan lama cukup sekali',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveStudentIntracurricular(sesi,siswa.id,{activity:'Kegiatan Lama',predicate:'Baik',
    description:'Deskripsi lama.',subjectId:mapel});
  assert.equal(getReportDocument(sesi,siswa.id).intracurricular.length,0);
  /* Guru mencentangnya sekali: catatan lamanya sendiri yang tampil, tanpa diisi ulang. */
  setIntracurricularVisibility(sesi,siswa.id,mapel,true);
  const baris=getReportDocument(sesi,siswa.id).intracurricular;
  assert.equal(baris.length,1);
  assert.equal(baris[0].description,'Deskripsi lama.','deskripsi lamanya dipakai apa adanya');
  assert.ok(butir,'mapel ini memang punya butir aktif');
});

test('35. Menyimpan lewat alur Intrakurikuler menyatakan kehendak tampil secara eksplisit',()=>{
  useMemoryStorage();
  const sesi=siapkan();const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,siswa)[0];
  const butir=listCpButir(sesi,mapel,{activeOnly:true})[0];
  saveStudentIntracurricularSelection(sesi,siswa.id,{subjectId:mapel,butirIds:[butir.id],
    jenis:'teori',predicate:'Baik'});
  assert.equal(getStudentIntracurricularSelection(sesi,siswa.id,mapel).includeInReport,true);
  assert.equal(getReportDocument(sesi,siswa.id).intracurricular.length,1);
  setIntracurricularVisibility(sesi,siswa.id,mapel,false);
  assert.equal(getReportDocument(sesi,siswa.id).intracurricular.length,0);
  assert.equal(getStudentIntracurricularSelection(sesi,siswa.id,mapel).description.length>0,true,
    'melepas centang tidak menghapus deskripsinya');
});
