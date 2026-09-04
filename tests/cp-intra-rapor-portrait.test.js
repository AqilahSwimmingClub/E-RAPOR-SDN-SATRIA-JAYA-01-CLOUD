import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { defaultCpButir } from '../src/data/cp-butir-defaults.js';
import { generateCocurricularDescription } from '../src/data/cocurricular.js';
import { defaultExtracurricularActivities, generateExtracurricularDescription } from '../src/data/extracurricular-defaults.js';
import { createCpButir, listCpButir, listCpButirForSemester, semesterNumberOf,
  setCpButirActive } from '../src/services/cp-butir.js';
import { deskripsiBocorFase, deskripsiMengulangMapel, JENIS_INTRAKURIKULER,
  substansiButir } from '../src/services/cp-descriptions.js';
import { generateAllReportDescriptions, generateReportDescription,
  getReportDescription, saveReportDescription } from '../src/services/descriptions.js';
import { fillAllIntracurricular, getStudentIntracurricularSelection,
  saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { createExtracurricular, getStudentCocurricular, saveStudentCocurricular } from '../src/services/completeness.js';
import { saveAssessmentScores, saveAssessmentSettings, ASSESSMENT_TYPES } from '../src/services/assessment.js';
import { saveAttendance } from '../src/services/attendance.js';
import { saveClassAttitudeBulk } from '../src/services/attitudes.js';
import { calculateReportScore } from '../src/services/report.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* REVISI CP + INTRAKURIKULER + RAPOR + PORTRAIT.

   Suite ini menjaga 43 klaim yang diminta secara eksplisit. Yang paling mudah tergelincir
   kembali - dan karena itu diuji sebagai KETIADAAN, bukan keberadaan:

     - Butir CP tidak punya Teori/Praktik, tidak punya "Teori + Praktik", tidak punya semester.
     - Rapor tidak punya nilai maupun pilihan Teori/Praktik, dan tidak punya TP.
     - Deskripsi tidak menyebut Fase, kode CP, TP, maupun nama mata pelajaran.
     - Generate satu mata pelajaran tidak pernah menulis ke mata pelajaran lain.

   Dua bug nyata yang pernah terjadi dan sekarang dijaga di sini:
     1. Isi/Generate Semua pada IPAS mengembalikan mapel aktif ke Pancasila dan hasilnya hilang.
        Sebabnya dua: catatan Intrakurikuler dikunci per SISWA saja - tanpa mata pelajaran -
        sehingga IPAS menimpa Pancasila; dan halaman menghitung ulang mapel aktif dari catatan
        murid pertama setiap kali digambar ulang.
     2. "Simpan Otomatis Semua Mapel" mensyaratkan TP aktif, sehingga gagal total pada mapel
        yang tidak punya TP - dan sejak penilaian memakai Butir CP, hampir semuanya begitu. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const css=()=>read('src/styles/app.css');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
const MAPEL=['pancasila','mtk','ipas','bindo'];
function aktifkanMapel(session,ids=MAPEL){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
}
function tambahSiswa(session,index=1){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`6600${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:index%2?'L':'P',photo:''});
}
function nilaiPenuh(session,subjectId,studentId,nilai=82){
  saveAssessmentSettings(session,subjectId,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,subjectId,jenis.id,{[studentId]:nilai});
}
function siapkanKelas(jumlah=3){
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const murid=Array.from({length:jumlah},(_,i)=>tambahSiswa(session,i+1));
  for(const mapel of MAPEL)for(const anak of murid)nilaiPenuh(session,mapel,anak.id);
  return {session,murid};
}

/* ============================================================== CP (klaim 1-6) */

test('1-3. Butir CP tidak punya Teori/Praktik, Teori+Praktik, maupun Semester',()=>{
  const {session}=siapkanKelas(1);
  for(const item of listCpButir(session,'ipas')){
    assert.equal('jenis' in item,false,`${item.name}: tidak ada jenis penilaian`);
    assert.equal('semester' in item,false,`${item.name}: tidak ada semester`);
  }
  const halaman=read('src/pages/objectives.js');
  for(const dibuang of ['<th>Jenis Penilaian</th>','<th>Semester</th>','Teori + Praktik',
    'teori_praktik','data-jenis','data-semester','SEMESTER_LABEL'])
    assert.equal(halaman.includes(dibuang),false,`menu CP tidak memuat ${dibuang}`);
  /* Katalog bawaannya pun sudah tidak memancarkan kedua field itu. */
  for(const item of defaultCpButir('mtk','C')){
    assert.equal('jenis' in item,false);
    assert.equal('semester' in item,false);
  }
});

test('4-5. Tambah dan Edit CP tidak meminta jenis penilaian',()=>{
  const halaman=read('src/pages/objectives.js');
  const form=halaman.slice(halaman.indexOf('function openManualForm'),halaman.indexOf('function drawLegacy'));
  for(const dilarang of ['name="jenis"','name="semester"','Jenis Penilaian','JENIS_PENILAIAN'])
    assert.equal(form.includes(dilarang),false,`form tidak meminta ${dilarang}`);
  /* Dan layanannya memang menerima input tanpa kedua field itu. */
  const {session}=siapkanKelas(1);
  const elemen=listCpButir(session,'ipas')[0].elementId;
  const baru=createCpButir(session,'ipas',{elementId:elemen,name:'Butir uji tanpa jenis',
    teori:'konsep uji'});
  assert.equal(baru.name,'Butir uji tanpa jenis');
  assert.equal('jenis' in baru,false);
  assert.equal('semester' in baru,false);
});

test('6. Semua Butir CP aktif tersedia pada semester aktif mana pun',()=>{
  const {session}=siapkanKelas(1);
  const ganjil=listCpButirForSemester(session,'ipas').map(item=>item.id);
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  aktifkanMapel(genap);
  assert.deepEqual(listCpButirForSemester(genap,'ipas').map(item=>item.id),ganjil,
    '6. daftar butir identik di Ganjil dan Genap');
  assert.equal(semesterNumberOf(session),1);
  assert.equal(semesterNumberOf(genap),2);
});

/* ================================================== INTRAKURIKULER (klaim 7-17) */

test('7-8. Intrakurikuler hanya Teori dan Praktik, tanpa Teori + Praktik',()=>{
  assert.deepEqual(JENIS_INTRAKURIKULER.map(item=>item.id),['teori','praktik']);
  const halaman=read('src/pages/intracurricular-input.js');
  assert.match(halaman,/data-jenis/,'halaman menyediakan pilihan jenis');
  assert.equal(halaman.includes('teori_praktik'),false);
  assert.equal(halaman.includes('Teori + Praktik'),false);
});

test('9. Intrakurikuler memakai Predikat, bukan input nilai angka',()=>{
  const {session,murid}=siapkanKelas(1);
  const butir=listCpButirForSemester(session,'ipas')[0];
  const hasil=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:[butir.id],jenis:'teori',predicate:'Baik'});
  assert.equal(hasil.predicate,'Baik');
  for(const angka of ['score','nilai','finalScore'])
    assert.equal(angka in hasil,false,`catatan Intrakurikuler tidak menyimpan ${angka}`);
  assert.throws(()=>saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:[butir.id],jenis:'teori',predicate:90}),/Predikat intrakurikuler tidak valid/);
  const halaman=read('src/pages/intracurricular-input.js');
  const alurCp=halaman.slice(halaman.indexOf('function drawSubjectFlow'),halaman.indexOf('function drawLegacyFlow'));
  assert.equal(/type="number"/.test(alurCp),false,'alur CP tidak punya satu pun input angka');
});

test('10-12. Satu, beberapa, dan banyak Butir CP - tetap satu predikat',()=>{
  const {session,murid}=siapkanKelas(1);
  const butir=listCpButirForSemester(session,'ipas');
  assert.ok(butir.length>=4,'tersedia cukup butir untuk diuji');
  for(const jumlah of [1,2,3,4]){
    const hasil=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
      butirIds:butir.slice(0,jumlah).map(item=>item.id),jenis:'teori',predicate:'Sangat Baik'});
    assert.equal(hasil.butirIds.length,jumlah,`${jumlah} butir tersimpan`);
    assert.equal(hasil.predicate,'Sangat Baik','12. tetap satu predikat');
    assert.equal(typeof hasil.description,'string');
  }
});

test('13-14. Deskripsi merangkum SELURUH butir terpilih, dan hanya itu',()=>{
  const {session,murid}=siapkanKelas(1);
  const butir=listCpButirForSemester(session,'ipas');
  const dipilih=butir.slice(0,3);
  const diluar=butir.slice(3);
  const hasil=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:dipilih.map(item=>item.id),jenis:'teori',predicate:'Baik'});
  for(const item of dipilih)
    assert.ok(hasil.description.includes(substansiButir(item,'teori')),
      `13. substansi "${item.name}" masuk deskripsi`);
  for(const item of diluar)
    assert.equal(hasil.description.includes(substansiButir(item,'teori')),false,
      `14. butir "${item.name}" yang tidak dipilih tidak masuk`);
  /* Bukan tiga paragraf: satu kalimat yang meringkas. */
  assert.ok(hasil.description.split(/(?<=\.)\s+/).filter(Boolean).length<=2,'diringkas, bukan disalin');
});

test('15. Butir CP nonaktif tidak tersedia untuk penilaian',()=>{
  const {session,murid}=siapkanKelas(1);
  const butir=listCpButirForSemester(session,'ipas');
  const dimatikan=butir[0];
  setCpButirActive(session,'ipas',dimatikan.id,false);
  assert.equal(listCpButirForSemester(session,'ipas').some(item=>item.id===dimatikan.id),false,
    '15. butir nonaktif tidak ditawarkan');
  const hasil=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:[dimatikan.id,butir[1].id],jenis:'teori',predicate:'Baik'});
  assert.deepEqual(hasil.butirIds,[butir[1].id],'butir nonaktif disaring walau id-nya dikirim');
  assert.equal(hasil.description.includes(substansiButir(dimatikan,'teori')),false,
    'substansi butir nonaktif tidak bocor');
});

test('16-17. Teori dan Praktik memakai bahasa sesuai substansi CP',()=>{
  const {session,murid}=siapkanKelas(1);
  const ids=listCpButirForSemester(session,'ipas').slice(0,2).map(item=>item.id);
  const teori=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:ids,jenis:'teori',predicate:'Baik'});
  const praktik=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:ids,jenis:'praktik',predicate:'Baik'});
  assert.notEqual(teori.description,praktik.description);
  assert.match(teori.description,/^(Memahami|Menguasai|Mulai memahami) /,'16. bahasa pemahaman');
  assert.match(praktik.description,/^(Terampil|Sangat terampil|Mampu|Mulai mampu) /,'17. bahasa keterampilan');
  /* Substansinya diambil dari sisi yang benar - bukan hasil menukar kata. */
  const butir=listCpButirForSemester(session,'ipas').slice(0,2);
  for(const item of butir){
    assert.ok(teori.description.includes(substansiButir(item,'teori')));
    assert.ok(praktik.description.includes(substansiButir(item,'praktik')));
  }
  /* Butir yang hanya punya satu sisi TIDAK dikarangkan sisi lainnya. */
  assert.equal(substansiButir({teori:'konsep gaya dan gerak',praktik:null},'praktik'),
    'konsep gaya dan gerak','tidak mengarang kompetensi praktik');
});

/* ============================================================ RAPOR (klaim 18-25) */

test('18-19. Rapor tidak punya nilai maupun pilihan Teori/Praktik',()=>{
  const halaman=read('src/pages/reports.js');
  for(const dilarang of ['Nilai Teori','Nilai Praktik','<th>Teori</th>','<th>Praktik</th>',
    'data-jenis','teori_praktik','JENIS_PENILAIAN'])
    assert.equal(halaman.includes(dilarang),false,`Rapor tidak memuat ${dilarang}`);
  const dokumen=read('src/services/documents.js');
  for(const dilarang of ['teoriScore','praktikScore','nilaiTeori','nilaiPraktik'])
    assert.equal(dokumen.includes(dilarang),false,`dokumen rapor tidak memuat ${dilarang}`);
});

test('20. Nilai Akhir mapel lama tetap bekerja apa adanya',()=>{
  const {session,murid}=siapkanKelas(1);
  saveAssessmentSettings(session,'mtk',{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  saveAssessmentScores(session,'mtk','formative',{[murid[0].id]:80});
  saveAssessmentScores(session,'mtk','daily',{[murid[0].id]:70});
  saveAssessmentScores(session,'mtk','practice',{[murid[0].id]:90});
  saveAssessmentScores(session,'mtk','scopeSummative',{[murid[0].id]:85});
  saveAssessmentScores(session,'mtk','semesterSummative',{[murid[0].id]:75});
  const hasil=calculateReportScore(session,'mtk',murid[0].id);
  /* 80*.30 + 70*.20 + 90*.20 + 85*.15 + 75*.15 = 80 */
  assert.equal(hasil.rawScore,80,'20. rumus lima komponen tidak berubah');
  assert.equal(hasil.completionStatus,'COMPLETE');
  assert.equal(hasil.masteryStatus,'TUNTAS');
});

test('21. Tidak ada TP sebagai basis generator baru',()=>{
  const bulk=read('src/services/report-bulk.js').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  for(const sisa of ['learning-objectives','listActiveObjectives','objectiveIds','TP'])
    assert.equal(bulk.includes(sisa),false,`Simpan Otomatis tidak lagi memakai ${sisa}`);
  const halaman=read('src/pages/reports.js');
  assert.equal(/learning-objectives\.js/.test(halaman),false,'halaman Rapor tidak membaca TP');
  for(const dilarang of ['data-best','data-improve','Pilih TP','pilih TP','Periksa TP'])
    assert.equal(halaman.includes(dilarang),false,`Rapor tidak meminta ${dilarang}`);
  /* Dan pada praktiknya: CP menang walau objectiveIds dikirim. */
  const {session,murid}=siapkanKelas(1);
  const hasil=generateReportDescription(session,'ipas',murid[0].id,{objectiveIds:['tp-palsu']});
  assert.equal(hasil.source,'CP_BUTIR');
  assert.equal(hasil.objectiveIds,null);
});

test('22-23. Deskripsi bebas Fase, kode CP, TP, dan pengulangan nama mapel',()=>{
  const {session,murid}=siapkanKelas(1);
  const namaMapel={pancasila:'Pendidikan Pancasila',mtk:'Matematika',ipas:'IPAS',
    bindo:'Bahasa Indonesia'};
  for(const mapel of MAPEL){
    const butir=listCpButirForSemester(session,mapel);
    if(!butir.length)continue;
    const intra=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:mapel,
      butirIds:butir.slice(0,2).map(item=>item.id),jenis:'teori',predicate:'Baik'});
    const rapor=generateReportDescription(session,mapel,murid[0].id,{});
    for(const [label,teks] of [['Intrakurikuler',intra.description],['Rapor',rapor.text]]){
      assert.equal(deskripsiBocorFase(teks),false,`22. ${label} ${mapel} bebas Fase/TP`);
      assert.equal(/\bFase\b/i.test(teks),false,`${label} ${mapel} tidak menyebut Fase`);
      assert.equal(/CP [A-Z][a-z]+ \d/.test(teks),false,'kode CP tidak ikut');
      assert.equal(deskripsiMengulangMapel(teks,namaMapel[mapel]),false,
        `23. ${label} ${mapel} tidak mengulang nama mata pelajaran`);
      assert.equal(/mata pelajaran/i.test(teks),false,`${label} ${mapel} tidak menulis "mata pelajaran"`);
    }
  }
});

test('24. Deskripsi Rapor berbeda dari Deskripsi Intrakurikuler',()=>{
  const {session,murid}=siapkanKelas(1);
  const butir=listCpButirForSemester(session,'ipas');
  for(const jenis of ['teori','praktik'])
    for(const predikat of ['Cukup','Baik','Sangat Baik']){
      const intra=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
        butirIds:butir.slice(0,3).map(item=>item.id),jenis,predicate:predikat});
      const rapor=generateReportDescription(session,'ipas',murid[0].id,{});
      assert.notEqual(intra.description,rapor.text,
        `24. ${jenis}/${predikat}: dua kolom rapor tidak boleh berbunyi sama`);
    }
});

test('25. Generate Semua memproses seluruh siswa pada mapel terpilih',()=>{
  const {session,murid}=siapkanKelas(5);
  const hasil=generateAllReportDescriptions(session,'ipas');
  assert.equal(hasil.total,5,'seluruh murid diproses');
  assert.equal(hasil.terisi,5,'25. lima deskripsi sekaligus');
  assert.equal(hasil.subjectId,'ipas');
  for(const anak of murid)
    assert.ok(getReportDescription(session,'ipas',anak.id)?.text,`deskripsi ${anak.name} tersimpan`);
  /* Deskripsi terkunci dan yang disunting guru tidak ditimpa diam-diam. */
  saveReportDescription(session,'ipas',murid[0].id,{text:'Kalimat tulisan tangan guru.'});
  const kedua=generateAllReportDescriptions(session,'ipas');
  assert.equal(kedua.dilewati.length,1,'deskripsi tulisan guru dipertahankan');
  assert.equal(getReportDescription(session,'ipas',murid[0].id).text,'Kalimat tulisan tangan guru.');
});

/* ============================================ BUG MAPEL SILANG (klaim 26-32) */

test('26-29. IPAS: Generate Semua, pindah mapel, kembali, dan reload',()=>{
  const {session,murid}=siapkanKelas(3);
  /* 26. Mapel yang diproses adalah yang diminta - tidak pernah jatuh ke mapel pertama. */
  const hasil=generateAllReportDescriptions(session,'ipas');
  assert.equal(hasil.subjectId,'ipas','26. mapel yang diproses tetap IPAS');
  /* 27. Hasilnya tersimpan pada kunci IPAS. */
  const teksIpas=murid.map(anak=>getReportDescription(session,'ipas',anak.id)?.text);
  assert.ok(teksIpas.every(Boolean),'27. hasil IPAS tersimpan');
  /* 28. Membuka mapel lain lalu kembali: hasilnya masih ada dan tidak berubah. */
  generateAllReportDescriptions(session,'pancasila');
  assert.deepEqual(murid.map(anak=>getReportDescription(session,'ipas',anak.id)?.text),teksIpas,
    '28. hasil IPAS utuh setelah mapel lain diproses');
  /* 29. "Reload": cache dibuang, database dibaca ulang dari penyimpanan. */
  invalidateDbCache();
  assert.deepEqual(murid.map(anak=>getReportDescription(session,'ipas',anak.id)?.text),teksIpas,
    '29. hasil IPAS bertahan setelah database dibaca ulang');
  /* Kunci penyimpanannya memang memuat mata pelajaran. */
  const kunci=Object.keys(loadDb().reportDescriptions);
  assert.ok(kunci.every(key=>key.split('|').length===5),'kunci deskripsi memuat mapel dan siswa');
  assert.ok(kunci.some(key=>key.includes('|ipas|')),'ada kunci milik IPAS');
});

test('30-32. Generate satu mapel tidak pernah menulis ke mapel lain',()=>{
  const {session,murid}=siapkanKelas(3);
  const kosong=id=>murid.every(anak=>!getReportDescription(session,id,anak.id)?.text);
  const terisi=id=>murid.every(anak=>Boolean(getReportDescription(session,id,anak.id)?.text));

  generateAllReportDescriptions(session,'ipas');
  assert.ok(terisi('ipas'),'30. IPAS terisi');
  assert.ok(kosong('pancasila')&&kosong('mtk')&&kosong('bindo'),'30. mapel lain tidak tersentuh');

  generateAllReportDescriptions(session,'pancasila');
  assert.ok(terisi('pancasila'),'31. Pancasila terisi');
  assert.ok(kosong('mtk')&&kosong('bindo'),'31. Generate Pancasila tidak menulis ke IPAS/Matematika');

  generateAllReportDescriptions(session,'mtk');
  assert.ok(terisi('mtk'),'32. Matematika terisi');
  assert.ok(kosong('bindo'),'32. Generate Matematika tidak menulis mapel lain');

  /* Isi masing-masing memang kompetensi mapelnya sendiri, bukan salinan. */
  const contoh=id=>getReportDescription(session,id,murid[0].id).text;
  assert.equal(new Set([contoh('ipas'),contoh('pancasila'),contoh('mtk')]).size,3,
    'tiga mapel menghasilkan tiga deskripsi berbeda');

  /* Hal yang sama untuk Intrakurikuler, yang dulu justru menjadi sumber bug ini. */
  const butir=id=>listCpButirForSemester(session,id).slice(0,2).map(item=>item.id);
  fillAllIntracurricular(session,{subjectId:'ipas',butirIds:butir('ipas'),jenis:'teori',predicate:'Baik'});
  fillAllIntracurricular(session,{subjectId:'pancasila',butirIds:butir('pancasila'),jenis:'praktik',predicate:'Cukup'});
  for(const anak of murid){
    const ipas=getStudentIntracurricularSelection(session,anak.id,'ipas');
    const pancasila=getStudentIntracurricularSelection(session,anak.id,'pancasila');
    assert.equal(ipas.subjectId,'ipas','catatan IPAS berdiri sendiri');
    assert.equal(pancasila.subjectId,'pancasila','catatan Pancasila tidak tertimpa IPAS');
    assert.equal(ipas.jenis,'teori');
    assert.equal(pancasila.jenis,'praktik');
    assert.notEqual(ipas.description,pancasila.description);
  }
  /* Halamannya sendiri tidak lagi menghitung ulang mapel dari catatan murid. */
  const halaman=read('src/pages/intracurricular-input.js');
  assert.equal(/let subjectId=subjects\.some\(item=>item\.id===current\?\.subjectId\)/.test(halaman),false,
    'mapel aktif bukan lagi turunan catatan murid yang sedang dibuka');
  assert.match(read('src/pages/reports.js'),/const mapelDiproses=subjectId/,
    'Generate Semua mengunci mapel yang diproses sebelum bekerja');
});

/* ============================================================ SEMESTER (klaim 33-36) */

test('33-36. Semester mengikuti aplikasi, dan data dua semester terpisah',()=>{
  useMemoryStorage();
  const ganjil=guru('5B',`Ganjil ${ACADEMIC_YEAR}`);
  aktifkanMapel(ganjil);
  const anakGanjil=tambahSiswa(ganjil,1);
  const butir=listCpButirForSemester(ganjil,'ipas')[0];
  const hasilGanjil=saveStudentIntracurricularSelection(ganjil,anakGanjil.id,{subjectId:'ipas',
    butirIds:[butir.id],jenis:'teori',predicate:'Baik'});
  assert.equal(hasilGanjil.semesterNumber,1,'33. Ganjil tersimpan sebagai Semester 1');

  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  aktifkanMapel(genap);
  const anakGenap=tambahSiswa(genap,1);
  /* 35. Butir yang SAMA dipakai lagi - tidak perlu digandakan per semester. */
  assert.ok(listCpButirForSemester(genap,'ipas').some(item=>item.id===butir.id),
    '35. butir yang sama tersedia pada Genap');
  const hasilGenap=saveStudentIntracurricularSelection(genap,anakGenap.id,{subjectId:'ipas',
    butirIds:[butir.id],jenis:'praktik',predicate:'Sangat Baik'});
  assert.equal(hasilGenap.semesterNumber,2,'34. Genap tersimpan sebagai Semester 2');

  /* 36. Data Ganjil tidak tertimpa Genap. */
  const bacaGanjil=getStudentIntracurricularSelection(ganjil,anakGanjil.id,'ipas');
  assert.equal(bacaGanjil.predicate,'Baik','36. catatan Ganjil utuh');
  assert.equal(bacaGanjil.jenis,'teori');
  const kunci=Object.keys(loadDb().intracurricularScores);
  assert.ok(kunci.some(key=>key.startsWith(`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|`)));
  assert.ok(kunci.some(key=>key.startsWith(`${ACADEMIC_YEAR}|Genap ${ACADEMIC_YEAR}|`)));
  /* Guru tidak pernah diminta memilih semester di mana pun pada alur ini. */
  const halaman=read('src/pages/intracurricular-input.js')+read('src/pages/objectives.js');
  assert.equal(/name="semester"|data-semester/.test(halaman),false,
    'tidak ada kendali semester pada CP maupun Intrakurikuler');
});

/* ====================================================== EMPAT GENERATOR (klaim 37-40) */

test('37-40. Empat generator terpisah, masing-masing memakai sumber datanya sendiri',()=>{
  const {session,murid}=siapkanKelas(1);
  const butir=listCpButirForSemester(session,'ipas').slice(0,2);

  /* 37. Intrakurikuler dari Butir CP terpilih. */
  const intra=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:butir.map(item=>item.id),jenis:'teori',predicate:'Baik'});
  for(const item of butir)assert.ok(intra.description.includes(substansiButir(item,'teori')),
    '37. Intrakurikuler memakai Butir CP terpilih');

  /* 38. Rapor bukan salinan Intrakurikuler. */
  const rapor=generateReportDescription(session,'ipas',murid[0].id,{});
  assert.notEqual(rapor.text,intra.description,'38. Rapor tidak menyalin Intrakurikuler');
  assert.match(rapor.text,/^Menunjukkan /,'Rapor memakai bingkai capaian semester');

  /* 39. Kokurikuler dari data kokurikuler. */
  const koku=generateCocurricularDescription({studentName:'Alya',activity:'Bakti Sosial',
    predicate:'Sangat Baik',classId:'5B'});
  assert.match(koku,/kokurikuler/i,'39. kalimat kokurikuler menyebut kegiatannya sendiri');
  assert.match(koku,/Bakti Sosial/);
  assert.equal(/mata pelajaran|Menunjukkan pemahaman/.test(koku),false,
    'Kokurikuler tidak berbunyi seperti deskripsi mata pelajaran');

  /* 40. Ekstrakurikuler dari data ekstrakurikuler. */
  const kegiatan=defaultExtracurricularActivities('5B')[0];
  const ekstra=generateExtracurricularDescription({studentName:'Alya',activity:kegiatan.name,
    predicate:'Baik',classId:'5B'});
  assert.match(ekstra,/ekstrakurikuler/i,'40. kalimat ekstrakurikuler menyebut kegiatannya sendiri');
  assert.match(ekstra,new RegExp(kegiatan.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal(/mata pelajaran|Menunjukkan pemahaman/.test(ekstra),false,
    'Ekstrakurikuler tidak berbunyi seperti deskripsi mata pelajaran');

  /* Keempatnya benar-benar empat kalimat yang berbeda bentuknya. */
  assert.equal(new Set([intra.description,rapor.text,koku,ekstra]).size,4,
    'empat konteks, empat kalimat');
  /* Kokurikuler dan Ekstrakurikuler tidak lagi berbagi satu template generik. */
  for(const berkas of ['src/data/cocurricular.js','src/data/extracurricular-defaults.js'])
    assert.equal(read(berkas).includes('composeActivityDescription'),false,
      `${berkas} memakai penyusunnya sendiri`);
});

/* ================================================================ DATA (klaim 41-43) */

test('41. Perubahan struktur CP tidak menghapus satu pun data akademik',()=>{
  const {session,murid}=siapkanKelas(2);
  /* Absensi harian menuntut status untuk SELURUH murid rombel - itu memang aturannya. */
  saveAttendance(session,`${ACADEMIC_YEAR.slice(0,4)}-08-01`,
    Object.fromEntries(murid.map(anak=>[anak.id,'Hadir'])));
  saveClassAttitudeBulk(session,['faith'],'Berkembang Sesuai Harapan');
  saveStudentCocurricular(session,murid[0].id,{activity:'Bakti Sosial',predicate:'Baik',
    description:'Aktif membantu kegiatan.'});
  createExtracurricular(session,murid[0].id,{name:'Pramuka Penggalang',predicate:'Baik',
    description:'Aktif mengikuti latihan.'});
  const sebelum=loadDb();
  const cuplikan=Object.fromEntries(['students','attendance','assessmentScores','attitudeProfiles',
    'cocurricularScores','extracurricularScores','learningObjectives']
    .map(nama=>[nama,Object.keys(sebelum[nama]||{}).length]));

  /* Seluruh alur baru dijalankan di atas data yang sama. */
  for(const mapel of MAPEL){
    const butir=listCpButirForSemester(session,mapel);
    if(butir.length)fillAllIntracurricular(session,{subjectId:mapel,
      butirIds:butir.slice(0,2).map(item=>item.id),jenis:'teori',predicate:'Baik'});
    generateAllReportDescriptions(session,mapel);
  }

  const sesudah=loadDb();
  for(const [nama,jumlah] of Object.entries(cuplikan))
    assert.equal(Object.keys(sesudah[nama]||{}).length,jumlah,`41. ${nama} tidak berkurang`);
  assert.equal(getStudentCocurricular(session,murid[0].id).activity,'Bakti Sosial',
    'catatan kokurikuler tetap terbaca');
  /* Tidak ada jalur penghapusan pada berkas yang direvisi. */
  const sumber=['src/services/cp-butir.js','src/services/intracurricular.js',
    'src/services/descriptions.js','src/services/report-bulk.js','src/services/cp-descriptions.js']
    .map(read).join('\n');
  for(const larangan of ['localStorage.clear()','indexedDB.deleteDatabase','replaceDb(',
    'delete db.students','delete db.attendance','delete db.assessmentScores',
    'delete db.attitudeProfiles','delete db.reportScores'])
    assert.equal(sumber.includes(larangan),false,`tidak ada ${larangan}`);
  /* Skema database tidak dinaikkan, jadi tidak ada migrasi yang menyentuh baris mana pun. */
  assert.equal(/APP_SCHEMA_VERSION\s*=\s*6/.test(read('src/data/version.js')),false);
});

test('42. Sistem lisensi tetap utuh dan tidak tersentuh revisi ini',()=>{
  /* Aturan lisensi tidak boleh ikut berubah oleh pekerjaan CP/Rapor. */
  const lisensi=read('src/services/license.js');
  assert.match(lisensi,/verifyActivationToken/,'status tetap dari token bertanda tangan');
  assert.match(lisensi,/record\.installation_id!==getInstallationId\(\)/,
    'entitlement offline tetap terikat perangkat');
  const server=read('server/src/licenses.js');
  assert.match(server,/DEVICE_SLOTS=Object\.freeze\(\['android','windows'\]\)/,'slot Android/Windows utuh');
  assert.match(server,/TIPE_TANPA_BATAS=new Set\(\['OWNER'\]\)/,'aturan OWNER utuh');
  assert.match(read('server/src/db.js'),/ux_one_active_slot/,'indeks slot utuh');
  /* Berkas CP/Rapor tidak menyentuh lisensi sama sekali. */
  for(const berkas of ['src/services/cp-butir.js','src/services/intracurricular.js',
    'src/services/descriptions.js','src/pages/objectives.js','src/pages/reports.js'])
    for(const kunci of ['erapor_license_v1','erapor_installation_v1','activation_token'])
      assert.equal(read(berkas).includes(kunci),false,`${berkas} tidak menyentuh ${kunci}`);
});

test('43. Backup dan restore tetap membawa seluruh koleksi yang relevan',()=>{
  const backup=read('src/services/backup.js');
  const migrasi=read('src/services/migrations.js');
  const storage=read('src/services/storage.js');
  for(const koleksi of ['cpButir','cpButirScores','intracurricularScores','reportDescriptions',
    'cocurricularScores','extracurricularScores','attitudeProfiles','learningObjectives']){
    assert.ok(storage.includes(koleksi),`${koleksi} ada pada struktur database`);
    assert.ok(backup.includes(koleksi),`43. ${koleksi} ikut backup`);
  }
  for(const koleksi of ['cpButir','cpButirScores','intracurricularScores'])
    assert.ok(migrasi.includes(koleksi),`${koleksi} dijaga migration`);
  /* Backup tetap tidak pernah membawa lisensi maupun identitas perangkat. */
  for(const kunci of ['erapor_license_v1','erapor_installation_v1','activation_token','installation_id'])
    assert.equal(backup.includes(kunci),false,`backup tidak menyentuh ${kunci}`);
});

/* ============================================ PORTRAIT (§21-26, dijaga pada CSS) */

test('Portrait: Butir CP disajikan sebagai kartu beserta aksinya',()=>{
  const halaman=read('src/pages/objectives.js');
  assert.match(halaman,/cp-card-list/,'markup kartu tersedia');
  assert.match(halaman,/cp-butir-card/,'setiap butir menjadi satu kartu');
  assert.match(halaman,/cp-butir-actions/,'aksi berada di dalam kartu');
  /* Kartu memuat aksi yang sama dengan tabel - bukan versi yang dikurangi. */
  const kartu=halaman.slice(halaman.indexOf('<div class="cp-card-list">'),
    halaman.indexOf('</div></section>`;'));
  for(const aksi of ['data-toggle','data-edit'])
    assert.ok(kartu.includes(aksi)||halaman.includes(`aksi(item)`),`kartu memuat ${aksi}`);
  const gaya=css();
  assert.match(gaya,/@media \(max-width:1000px\)\{[\s\S]{0,200}\.cp-table-wrap\{display:none\}/,
    'di bawah 1000px tabel diganti kartu');
  assert.match(gaya,/\.cp-card-list\{display:none\}/,'pada layar lebar kartu disembunyikan');
});

test('Portrait: sidebar menjadi drawer pada HP dan tablet portrait',()=>{
  const gaya=css();
  assert.match(gaya,/@media\(max-width:767px\)\{\.app-shell\{display:block\}\.sidebar\{position:fixed/,
    'HP memakai drawer');
  assert.match(gaya,/@media \(min-width:768px\) and \(max-width:1024px\) and \(orientation:portrait\)/,
    'tablet portrait mendapat blok sendiri');
  const tablet=gaya.slice(gaya.indexOf('@media (min-width:768px) and (max-width:1024px) and (orientation:portrait)'));
  assert.match(tablet,/\.sidebar\{position:fixed/,'tablet portrait memakai drawer');
  assert.match(tablet,/\.mobile-menu\{display:grid/,'tombol menu tampil');
  /* Desktop dan landscape tidak tersentuh: tidak ada aturan drawer tanpa batas lebar. */
  assert.equal(/@media\s*\(orientation:portrait\)\s*\{/.test(gaya),false,
    'tidak ada aturan portrait tanpa batas lebar yang dapat mengenai desktop');
});

test('Portrait: sasaran sentuh dan tabel kompleks',()=>{
  const gaya=css();
  assert.match(gaya,/@media \(max-width:1000px\)\{[\s\S]{0,400}min-height:44px/,
    'tombol pada layar kecil minimal 44px');
  assert.match(gaya,/@media \(pointer:coarse\)/,'perangkat sentuh mendapat sasaran yang lebih besar');
  /* Tabel Rapor yang lebih lebar diganti kartu lebih awal. */
  assert.match(gaya,/@media \(max-width:1200px\)\{[\s\S]{0,160}\.report-table-card\{display:none\}/,
    'tabel Rapor diganti kartu pada layar di bawah 1200px');
  /* Modal tidak pernah melebihi viewport. */
  assert.match(gaya,/\.modal-card,\.modal-wide,\.modal-extra-wide\{max-height:calc\(100dvh/,
    'modal dibatasi tinggi viewport');
  assert.match(gaya,/\.modal-wide\{width:min\(820px,100%\)/,'modal tidak melebihi lebar viewport');
});
