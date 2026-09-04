import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { capaianPembelajaran, CP_SUBJECTS, cpElements } from '../src/data/curriculum-cp.js';
import { cpButirCoverage, defaultCpButir, JENIS_IDS } from '../src/data/cp-butir-defaults.js';
import { cpButirAverage, createCpButir, deleteCpButir, getCpButir, getCpButirScoreSheet,
  gabungNilaiButir, listCpButir, listCpButirForSemester, saveCpButirScores, setCpButirActive,
  setCpButirJenis, setCpButirSemester, studentCpButirAchievements,
  updateCpButir } from '../src/services/cp-butir.js';
import { deskripsiBocorFase, frasaButir } from '../src/services/cp-descriptions.js';
import { generateReportDescription } from '../src/services/descriptions.js';
import { composeIntracurricularDescriptionFromCp,
  saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { createLearningObjective, listLearningObjectives } from '../src/services/objectives.js';
import { saveAssessmentScores, saveAssessmentSettings, ASSESSMENT_TYPES } from '../src/services/assessment.js';
import { saveAttendance } from '../src/services/attendance.js';
import { saveClassAttitudeBulk } from '../src/services/attitudes.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* CP RESMI -> ELEMEN -> BUTIR CP -> SEMESTER -> JENIS PENILAIAN -> NILAI -> DESKRIPSI.

   Suite ini menjaga rantai di atas utuh. Yang paling mudah tergelincir dan karena itu diuji
   berulang kali:

   1. Butir CP BUKAN TP yang berganti nama. Ia milik elemen CP resmi, dan TP lama tidak lagi
      menjadi dasar penilaian meskipun catatannya tetap terbaca.
   2. Jenis penilaian melekat PER BUTIR, bukan per mata pelajaran. Satu mapel boleh memuat
      campuran Teori, Praktik, dan Teori + Praktik sekaligus.
   3. Deskripsi Intrakurikuler dan deskripsi rapor sama-sama lahir dari butir + jenis + nilai,
      tetapi kalimatnya tidak boleh sama.
   4. "Fase A/B/C" tidak pernah bocor ke kalimat yang dibaca orang tua. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
function aktifkanMapel(session,ids=['mtk','pjok','bindo']){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:ids.includes(item.id),order:index+1})));
}
function tambahSiswa(session,index=1){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`7788${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:'P',photo:''});
}
function siapkan(classId='5B',mapel=['mtk','pjok','bindo']){
  useMemoryStorage();
  const session=guru(classId);
  aktifkanMapel(session,mapel);
  const siswa=tambahSiswa(session);
  return {session,siswa};
}
/* Butir semester berjalan (Ganjil = Semester 1) yang jenisnya tertentu. */
function butirBerjenis(session,subjectId,jenis){
  return listCpButirForSemester(session,subjectId).find(item=>item.jenis===jenis)||null;
}

/* ------------------------------------------------ 1. Label UI sudah berpindah ke CP */

test('1. Menu, tabel, dan tombol pada area yang direvisi memakai istilah CP',()=>{
  const halaman=read('src/pages/objectives.js');
  const navigasi=read('src/data/navigation.js');
  assert.match(navigasi,/item\('objectives','Capaian Pembelajaran'/,'menu bernama Capaian Pembelajaran');
  assert.match(halaman,/<h1>Capaian Pembelajaran<\/h1>/,'judul halaman memakai CP');
  assert.match(halaman,/Tambah CP/,'tombol Tambah CP');
  assert.match(halaman,/Buat CP Manual/,'tombol Buat CP Manual');
  assert.match(halaman,/<th>Butir CP<\/th>/,'tabel memuat kolom Butir CP');
  assert.match(halaman,/<th>Jenis Penilaian<\/th>/,'tabel memuat kolom Jenis Penilaian');
  /* Tombol lama tidak boleh tertinggal sebagai jalur kedua. */
  for(const lama of ['Tambah TP','Buat TP Manual','Simpan TP Terpilih'])
    assert.equal(halaman.includes(lama),false,`tombol lama ${lama} sudah tidak ada`);
});

/* ------------------------------------------------ 2-5. CRUD dan status Butir CP */

test('2-3. Tambah dan edit Butir CP bekerja, termasuk butir buatan guru',()=>{
  const {session}=siapkan();
  const elemen=cpElements('mtk','C');
  const sebelum=listCpButir(session,'mtk').length;

  const baru=createCpButir(session,'mtk',{elementId:elemen[0].id,name:'Estimasi hasil hitung',
    teori:'strategi estimasi hasil operasi hitung',praktik:'melakukan estimasi hasil operasi hitung',
    semester:1,jenis:'teori_praktik'});
  assert.equal(baru.isDefault,false,'butir buatan guru ditandai bukan bawaan');
  assert.equal(baru.elementName,elemen[0].name,'butir menempel pada elemen CP resmi');
  assert.equal(listCpButir(session,'mtk').length,sebelum+1,'2. butir baru masuk daftar');

  const diubah=updateCpButir(session,'mtk',baru.id,{...baru,name:'Estimasi dan pembulatan'});
  assert.equal(diubah.name,'Estimasi dan pembulatan','3. edit butir buatan guru tersimpan');

  /* Butir BAWAAN juga dapat diedit; dataset aslinya tidak diubah, yang tersimpan penyesuaiannya. */
  const bawaan=listCpButir(session,'mtk').find(item=>item.isDefault);
  const ubahBawaan=updateCpButir(session,'mtk',bawaan.id,{...bawaan,name:`${bawaan.name} (disesuaikan)`});
  assert.match(ubahBawaan.name,/disesuaikan/,'3. edit butir bawaan tersimpan sebagai penyesuaian');
  assert.equal(defaultCpButir('mtk','C').find(item=>item.id===bawaan.id).name,bawaan.name,
    'dataset bawaan tidak ikut berubah');
});

test('4. Butir CP manual dapat dihapus; butir bawaan hanya dinonaktifkan',()=>{
  const {session}=siapkan();
  const elemen=cpElements('mtk','C');
  const manual=createCpButir(session,'mtk',{elementId:elemen[1].id,name:'Butir uji hapus',
    teori:'materi uji',semester:1,jenis:'teori'});
  assert.equal(deleteCpButir(session,'mtk',manual.id),true,'4. butir manual terhapus');
  assert.equal(getCpButir(session,'mtk',manual.id),null,'butir manual tidak lagi terdaftar');

  const bawaan=listCpButir(session,'mtk').find(item=>item.isDefault);
  assert.throws(()=>deleteCpButir(session,'mtk',bawaan.id),/tidak dapat dihapus/i,
    'butir bawaan dilindungi agar nilai lamanya tidak kehilangan induk');
});

test('5. Aktif dan nonaktif Butir CP bekerja dan menentukan yang dipakai',()=>{
  const {session}=siapkan();
  const butir=listCpButirForSemester(session,'mtk')[0];
  assert.ok(butir,'ada butir aktif pada semester berjalan');
  setCpButirActive(session,'mtk',butir.id,false);
  assert.equal(getCpButir(session,'mtk',butir.id).active,false,'5. butir dinonaktifkan');
  assert.equal(listCpButirForSemester(session,'mtk').some(item=>item.id===butir.id),false,
    'butir nonaktif tidak lagi dipakai penilaian');
  setCpButirActive(session,'mtk',butir.id,true);
  assert.equal(listCpButirForSemester(session,'mtk').some(item=>item.id===butir.id),true,
    'butir dapat diaktifkan kembali');
});

/* ------------------------------------- 6-9. Elemen, banyak butir, dan pemetaan semester */

test('6-7. CP resmi punya elemen, dan satu elemen memuat beberapa Butir CP',()=>{
  const elemen=cpElements('mtk','C');
  assert.ok(elemen.length>=5,'6. CP Matematika Fase C memiliki elemen resmi');
  const bilangan=defaultCpButir('mtk','C').filter(item=>item.elementName==='Bilangan');
  assert.ok(bilangan.length>=6,`7. elemen Bilangan dipecah menjadi ${bilangan.length} Butir CP`);
  /* Pemecahan yang diminta: satu paragraf CP menjadi butir-butir yang benar-benar dapat dinilai.
     Yang diuji bukan nama butirnya, melainkan bahwa setiap kemampuan yang disebut naskah CP
     Bilangan Fase C benar-benar terwakili oleh sebuah butir. */
  const isiBilangan=bilangan.map(item=>`${item.name} ${item.teori||''} ${item.praktik||''}`.toLowerCase()).join(' | ');
  for(const kemampuan of ['1.000.000','nilai tempat','uang','kpk','fpb','pecahan','desimal'])
    assert.ok(isiBilangan.includes(kemampuan),`kemampuan "${kemampuan}" pada naskah CP terwakili butir`);
  /* Setiap butir tetap menunjuk induk elemennya. */
  for(const item of defaultCpButir('mtk','C'))
    assert.ok(elemen.some(el=>el.id===item.elementId),'butir menunjuk elemen CP resmi');
});

test('8-9. Butir CP dapat dipetakan ke Semester 1 maupun Semester 2',()=>{
  const {session}=siapkan();
  const semester1=listCpButir(session,'mtk',{semester:1});
  const semester2=listCpButir(session,'mtk',{semester:2});
  assert.ok(semester1.length,'8. ada butir pada Semester 1');
  assert.ok(semester2.length,'9. ada butir pada Semester 2');
  assert.equal(semester1.some(item=>semester2.some(lain=>lain.id===item.id)),false,
    'satu butir hanya berada pada satu semester');

  /* Guru dapat memindahkan butir antar semester: semester adalah pemetaan internal aplikasi. */
  const dipindah=semester1[0];
  setCpButirSemester(session,'mtk',dipindah.id,2);
  assert.equal(getCpButir(session,'mtk',dipindah.id).semester,2,'butir berpindah ke Semester 2');
  assert.equal(listCpButir(session,'mtk',{semester:1}).some(item=>item.id===dipindah.id),false,
    'butir tidak lagi terbaca pada Semester 1');
  /* Perpindahan bertahan meski guru membuka semester lain - kunci butir memang tidak memuat
     semester, sehingga daftar butir tidak pernah hilang saat berganti semester. */
  const semesterGenap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  assert.equal(listCpButir(semesterGenap,'mtk',{semester:2}).some(item=>item.id===dipindah.id),true,
    'butir tetap terbaca dari semester lain');
});

/* --------------------------------------------- 10-15. Butir CP sebagai objek penilaian */

test('10-12. Butir CP menjadi objek penilaian untuk Teori dan Praktik',()=>{
  const {session,siswa}=siapkan();
  const teori=butirBerjenis(session,'mtk','teori')||listCpButirForSemester(session,'mtk')[0];
  setCpButirJenis(session,'mtk',teori.id,'teori');
  const lembarTeori=getCpButirScoreSheet(session,'mtk',teori.id);
  assert.equal(lembarTeori.kolomTeori,true,'11. kolom nilai teori tersedia');
  assert.equal(lembarTeori.kolomPraktik,false,'jenis Teori tidak memunculkan kolom praktik');
  saveCpButirScores(session,'mtk',teori.id,{[siswa.id]:{teori:88,praktik:95}});
  const nilaiTeori=getCpButirScoreSheet(session,'mtk',teori.id).rows[0];
  assert.equal(nilaiTeori.teori,88,'10. nilai tersimpan pada Butir CP');
  assert.equal(nilaiTeori.praktik,null,'nilai praktik tidak tersimpan diam-diam pada butir Teori');
  assert.equal(nilaiTeori.nilai,88,'nilai butir sama dengan nilai teori');

  const praktik=butirBerjenis(session,'pjok','praktik');
  assert.ok(praktik,'PJOK memiliki butir berjenis Praktik');
  const lembarPraktik=getCpButirScoreSheet(session,'pjok',praktik.id);
  assert.equal(lembarPraktik.kolomTeori,false,'jenis Praktik tidak memunculkan kolom teori');
  assert.equal(lembarPraktik.kolomPraktik,true,'12. kolom nilai praktik tersedia');
  saveCpButirScores(session,'pjok',praktik.id,{[siswa.id]:{praktik:90}});
  assert.equal(getCpButirScoreSheet(session,'pjok',praktik.id).rows[0].nilai,90,'nilai praktik tersimpan');
});

test('13. Teori + Praktik menyediakan dua nilai dan menggabungkannya',()=>{
  const {session,siswa}=siapkan();
  const butir=butirBerjenis(session,'mtk','teori_praktik')||listCpButirForSemester(session,'mtk')[0];
  setCpButirJenis(session,'mtk',butir.id,'teori_praktik');
  const lembar=getCpButirScoreSheet(session,'mtk',butir.id);
  assert.equal(lembar.kolomTeori,true,'kolom teori tersedia');
  assert.equal(lembar.kolomPraktik,true,'kolom praktik tersedia');
  saveCpButirScores(session,'mtk',butir.id,{[siswa.id]:{teori:80,praktik:90}});
  const baris=getCpButirScoreSheet(session,'mtk',butir.id).rows[0];
  assert.equal(baris.teori,80);
  assert.equal(baris.praktik,90);
  assert.equal(baris.nilai,85,'13. nilai butir adalah rata-rata teori dan praktik');
  /* Baru satu sisi terisi: nilai butir memakai sisi yang ada, bukan separuhnya. */
  assert.equal(gabungNilaiButir({jenis:'teori_praktik',teori:80,praktik:null}),80);
});

test('14. Jenis penilaian tersimpan PER Butir CP, bukan per mata pelajaran',()=>{
  const {session}=siapkan();
  const butir=listCpButirForSemester(session,'mtk');
  assert.ok(butir.length>=3,'tersedia beberapa butir untuk diuji');
  setCpButirJenis(session,'mtk',butir[0].id,'teori');
  setCpButirJenis(session,'mtk',butir[1].id,'praktik');
  setCpButirJenis(session,'mtk',butir[2].id,'teori_praktik');
  const sesudah=listCpButirForSemester(session,'mtk');
  assert.equal(sesudah.find(item=>item.id===butir[0].id).jenis,'teori');
  assert.equal(sesudah.find(item=>item.id===butir[1].id).jenis,'praktik');
  assert.equal(sesudah.find(item=>item.id===butir[2].id).jenis,'teori_praktik');
  assert.equal(new Set(sesudah.slice(0,3).map(item=>item.jenis)).size,3,
    '14. satu mata pelajaran memuat campuran ketiga jenis sekaligus');
  /* Tidak ada aturan yang mengunci mapel tertentu ke satu jenis. */
  const sumber=read('src/services/cp-butir.js')+read('src/data/cp-butir-defaults.js');
  assert.equal(/subjectId==='pjok'|subjectId==='mtk'|subjectId==='seni'/.test(sumber),false,
    'tidak ada jenis penilaian yang dipatok berdasarkan mata pelajaran');
});

test('15. Nilai tersimpan per siswa, per Butir CP, dan per semester',()=>{
  const {session}=siapkan();
  const kedua=tambahSiswa(session,2);
  const pertama=listStudents(session,{classId:'5B'})[0];
  const butir=listCpButirForSemester(session,'mtk')[0];
  setCpButirJenis(session,'mtk',butir.id,'teori');
  saveCpButirScores(session,'mtk',butir.id,{[pertama.id]:{teori:70},[kedua.id]:{teori:95}});
  const baris=getCpButirScoreSheet(session,'mtk',butir.id).rows;
  assert.equal(baris.find(item=>item.studentId===pertama.id).nilai,70);
  assert.equal(baris.find(item=>item.studentId===kedua.id).nilai,95,'15. nilai terpisah per siswa');

  /* Semester lain tidak ikut membaca nilai semester ini. */
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  setCpButirSemester(genap,'mtk',butir.id,2);
  assert.equal(studentCpButirAchievements(genap,'mtk',pertama.id).length,0,
    'nilai semester ganjil tidak terbawa ke semester genap');
});

/* ------------------------------------ 16-19. Deskripsi otomatis dari butir + jenis + nilai */

function siapkanDeskripsi(){
  const {session,siswa}=siapkan();
  const butir=listCpButirForSemester(session,'mtk');
  const teori=butir[0],praktik=butir[1],campuran=butir[2];
  setCpButirJenis(session,'mtk',teori.id,'teori');
  setCpButirJenis(session,'mtk',praktik.id,'praktik');
  setCpButirJenis(session,'mtk',campuran.id,'teori_praktik');
  saveCpButirScores(session,'mtk',teori.id,{[siswa.id]:{teori:92}});
  saveCpButirScores(session,'mtk',praktik.id,{[siswa.id]:{praktik:60}});
  saveCpButirScores(session,'mtk',campuran.id,{[siswa.id]:{teori:80,praktik:84}});
  saveAssessmentSettings(session,'mtk',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,'mtk',jenis.id,{[siswa.id]:82});
  return {session,siswa,teori,praktik,campuran};
}

test('16-17. Deskripsi Intrakurikuler dan rapor lahir dari Butir CP, jenis, dan nilai',()=>{
  const {session,siswa,teori,praktik}=siapkanDeskripsi();
  const intra=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',predicate:'Baik'});
  const rapor=generateReportDescription(session,'mtk',siswa.id,{});

  const butirTeori=getCpButir(session,'mtk',teori.id);
  const butirPraktik=getCpButir(session,'mtk',praktik.id);
  /* 16. Substansi butir yang nilainya tinggi muncul, dengan kata kerja PENGETAHUAN. */
  assert.ok(intra.description.includes(butirTeori.teori),'16. isi butir teori masuk deskripsi Intrakurikuler');
  assert.match(intra.description,/menguasai/,'nilai 92 dinyatakan sebagai menguasai');
  /* Butir praktik yang nilainya di bawah KKTP muncul sebagai yang perlu dibimbing. */
  assert.ok(intra.description.includes(butirPraktik.praktik),'isi butir praktik ikut dinyatakan');
  assert.match(intra.description,/memerlukan bimbingan/,'nilai 60 dinyatakan perlu bimbingan');

  /* 17. Deskripsi rapor memakai butir yang sama tetapi bingkai kalimat capaian akademik. */
  assert.equal(rapor.source,'CP_BUTIR','17. deskripsi rapor bersumber Butir CP');
  assert.ok(rapor.text.includes(butirTeori.teori),'isi butir masuk deskripsi rapor');
  assert.match(rapor.text,/menunjukkan capaian/,'bingkai kalimat rapor adalah capaian akademik');
  assert.match(rapor.text,/Perlu penguatan/,'butir di bawah KKTP dinyatakan sebagai penguatan');
});

test('18. Deskripsi Intrakurikuler dan deskripsi rapor tidak pernah identik',()=>{
  const {session,siswa}=siapkanDeskripsi();
  const intra=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',predicate:'Baik'});
  const rapor=generateReportDescription(session,'mtk',siswa.id,{});
  assert.notEqual(intra.description,rapor.text,'18. dua konteks, dua kalimat');
  /* Bedanya struktural, bukan sekadar beda satu kata. */
  assert.match(intra.description,/mengikuti kegiatan pembelajaran intrakurikuler/,
    'Intrakurikuler menceritakan keikutsertaan');
  assert.equal(/mengikuti kegiatan pembelajaran intrakurikuler/.test(rapor.text),false,
    'rapor tidak menceritakan keikutsertaan kegiatan');
});

test('19. Fase A/B/C tidak pernah bocor ke deskripsi siswa',()=>{
  for(const classId of ['1A','3C','5B']){
    useMemoryStorage();
    const session=guru(classId);
    aktifkanMapel(session,['mtk','bindo','pjok']);
    const siswa=tambahSiswa(session);
    for(const subjectId of ['mtk','bindo','pjok']){
      const butir=listCpButirForSemester(session,subjectId);
      if(!butir.length)continue;
      saveCpButirScores(session,subjectId,butir[0].id,{[siswa.id]:{teori:85,praktik:85}});
      const intra=saveStudentIntracurricularSelection(session,siswa.id,{subjectId,predicate:'Baik'});
      const rapor=generateReportDescription(session,subjectId,siswa.id,{});
      for(const [nama,teks] of [['Intrakurikuler',intra.description],['Rapor',rapor.text]]){
        assert.equal(deskripsiBocorFase(teks),false,`19. ${nama} ${classId} ${subjectId} bebas kata Fase`);
        assert.equal(/\bFase\b/.test(teks),false,`${nama} ${classId} ${subjectId} tidak menyebut Fase`);
        assert.equal(/CP [A-Z][a-z]+ \d/.test(teks),false,'kode butir tidak ikut ke deskripsi');
        assert.equal(/pada akhir fase/i.test(teks),false,'bahasa administratif kurikulum tidak dipakai');
      }
    }
  }
  /* Penyusun kalimatnya sendiri memang tidak lagi menyebut fase. */
  const sumber=read('src/services/cp-descriptions.js');
  assert.equal(/Fase \$\{cp\.phase\}/.test(sumber),false,'template kalimat tidak lagi menyisipkan fase');
});

/* ------------------------------------------- 20-21. TP tidak lagi menjadi dasar penilaian */

test('20. TP tidak lagi menjadi dasar penilaian, tetapi catatannya tetap terbaca',()=>{
  const {session,siswa}=siapkanDeskripsi();
  const tp=createLearningObjective(session,'mtk',{description:'TP lama sekolah',active:true});
  const rapor=generateReportDescription(session,'mtk',siswa.id,{});
  assert.equal(rapor.source,'CP_BUTIR','20. deskripsi rapor tidak memakai TP');
  assert.equal(rapor.text.includes('TP lama sekolah'),false,'isi TP tidak masuk deskripsi');
  assert.equal(rapor.objectiveIds,null,'tidak ada TP yang dijadikan acuan penilaian');
  /* Catatan TP-nya sendiri TIDAK dihapus. */
  assert.equal(listLearningObjectives(session,'mtk').some(item=>item.id===tp.id),true,
    'catatan TP lama tetap tersimpan dan dapat dibaca');
  /* Nilai kompetensi memang disimpan pada koleksi Butir CP, bukan pada TP. */
  assert.ok(Object.keys(loadDb().cpButirScores).length>0,'nilai tersimpan pada koleksi Butir CP');
});

test('21. Seluruh mata pelajaran memakai mekanisme CP/Butir CP yang sama',()=>{
  const cakupan=cpButirCoverage(CP_SUBJECTS);
  const berlaku=cakupan.filter(item=>item.elemen>0);
  assert.ok(berlaku.length>=29,`kombinasi mapel-fase yang berlaku: ${berlaku.length}`);
  /* SATU PENGECUALIAN YANG DISENGAJA. `seni` (Seni dan Budaya) adalah label payung demi
     kompatibilitas mapping lama, bukan nama mata pelajaran pada dokumen CP resmi, sehingga
     naskah CP-nya tidak ada dan Butir CP bawaannya tidak boleh dikarang. Kekosongan itu diuji
     secara eksplisit di sini supaya tidak pernah menjadi kelalaian yang tidak disadari. */
  const tanpaNaskah=new Set(['seni']);
  for(const item of berlaku.filter(entry=>tanpaNaskah.has(entry.subjectId))){
    assert.equal(item.butir,0,
      `${item.subjectId} Fase ${item.phase} sengaja tanpa Butir CP karena naskah CP resminya tidak ada`);
    assert.equal(capaianPembelajaran(`${item.phase==='A'?1:item.phase==='B'?3:5}A`,item.subjectId).naskah,null,
      `${item.subjectId} memang tidak memiliki naskah CP resmi pada dataset`);
  }
  const berbutir=berlaku.filter(item=>!tanpaNaskah.has(item.subjectId));
  assert.ok(berbutir.length>=26,`kombinasi mapel-fase ber-Butir CP: ${berbutir.length}`);
  for(const item of berbutir){
    assert.ok(item.butir>0,`21. ${item.subjectId} Fase ${item.phase} memiliki Butir CP`);
    assert.deepEqual(item.elemenTanpaButir,[],
      `${item.subjectId} Fase ${item.phase}: setiap elemen CP memiliki Butir CP`);
    assert.ok(item.semester1>0&&item.semester2>0,
      `${item.subjectId} Fase ${item.phase} terpetakan ke kedua semester`);
    /* Butir hanya boleh ada bila naskah CP induknya memang dimuat. */
    assert.ok(capaianPembelajaran(`${item.phase==='A'?1:item.phase==='B'?3:5}A`,item.subjectId).naskah,
      `${item.subjectId} Fase ${item.phase}: Butir CP bersandar pada naskah CP resmi yang dimuat`);
  }
  /* Struktur setiap butir seragam di seluruh mapel. */
  for(const item of berbutir.flatMap(entry=>defaultCpButir(entry.subjectId,entry.phase))){
    assert.ok(JENIS_IDS.includes(item.jenis),`${item.code}: jenis penilaian valid`);
    assert.ok(item.teori||item.praktik,`${item.code}: memiliki rumusan substansi`);
    assert.ok([1,2].includes(item.semester),`${item.code}: terpetakan ke semester`);
  }
  /* Butir CP bukan TP yang berganti nama: tidak satu pun butir menyalin katalog TP lama. */
  const katalogTp=read('src/data/learning-objective-defaults.js');
  const contohButir=defaultCpButir('mtk','C').map(item=>item.name);
  for(const nama of contohButir)assert.equal(katalogTp.includes(nama),false,
    `butir "${nama}" bukan salinan katalog TP`);
});

/* ------------------------------------------------- 22-23. Data lama tetap utuh dan terbaca */

test('22-23. Data pengguna lama tetap terbaca dan tidak ada yang hilang',()=>{
  const {session,siswa}=siapkan();
  /* Data akademik yang mewakili pemakaian nyata sebelum revisi ini. */
  const tp=createLearningObjective(session,'mtk',{description:'TP warisan',active:true});
  saveAttendance(session,`${ACADEMIC_YEAR.slice(0,4)}-08-01`,{[siswa.id]:'Hadir'});
  saveAssessmentSettings(session,'mtk',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,'mtk',jenis.id,{[siswa.id]:80});
  saveClassAttitudeBulk(session,['faith'],'Berkembang Sesuai Harapan');
  const sebelum=loadDb();
  const cuplikan={
    students:Object.keys(sebelum.students).length,
    attendance:Object.keys(sebelum.attendance).length,
    assessmentScores:Object.keys(sebelum.assessmentScores).length,
    attitudeProfiles:Object.keys(sebelum.attitudeProfiles).length,
    learningObjectives:Object.keys(sebelum.learningObjectives).length,
  };

  /* Seluruh alur Butir CP dijalankan di atas data yang sama. */
  const butir=listCpButirForSemester(session,'mtk')[0];
  saveCpButirScores(session,'mtk',butir.id,{[siswa.id]:{teori:85,praktik:85}});
  createCpButir(session,'mtk',{elementId:cpElements('mtk','C')[0].id,name:'Butir tambahan',
    teori:'materi tambahan',semester:1,jenis:'teori'});
  saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',predicate:'Baik'});

  const sesudah=loadDb();
  for(const [koleksi,jumlah] of Object.entries(cuplikan))
    assert.equal(Object.keys(sesudah[koleksi]).length,jumlah,`23. ${koleksi} tidak berkurang`);
  assert.equal(listLearningObjectives(session,'mtk').find(item=>item.id===tp.id).description,'TP warisan',
    '22. catatan TP lama tetap terbaca setelah revisi');
  assert.equal(listStudents(session,{classId:'5B'}).length,1,'data siswa utuh');

  /* Layanan Butir CP memang tidak punya jalan untuk menghapus data akademik. */
  const sumber=read('src/services/cp-butir.js');
  for(const larangan of ['localStorage.clear()','replaceDb(','delete db.students','delete db.attendance',
    'delete db.assessmentScores','delete db.learningObjectives'])
    assert.equal(sumber.includes(larangan),false,`layanan Butir CP tidak pernah ${larangan}`);
});

test('24. Koleksi Butir CP ikut dijaga backup dan migration',()=>{
  const backup=read('src/services/backup.js');
  const migrasi=read('src/services/migrations.js');
  const storage=read('src/services/storage.js');
  for(const koleksi of ['cpButir','cpButirScores']){
    assert.ok(storage.includes(koleksi),`${koleksi} tersedia pada struktur database`);
    assert.ok(backup.includes(koleksi),`${koleksi} ikut backup`);
    assert.ok(migrasi.includes(koleksi),`${koleksi} dijaga migration`);
  }
  /* Skema database TIDAK dinaikkan: koleksi baru dibuat saat dipakai, sehingga database lama
     tetap terbaca tanpa migrasi yang menyentuh datanya. */
  assert.equal(/APP_SCHEMA_VERSION\s*=\s*6/.test(read('src/data/version.js')),false,
    'tidak ada kenaikan skema yang memaksa migrasi database lama');
});

/* ---------------------------------------------------- Rata-rata butir sebagai bahan bacaan */

test('Rata-rata capaian butir tersedia untuk mata pelajaran yang sudah dinilai',()=>{
  const {session,siswa}=siapkanDeskripsi();
  const rerata=cpButirAverage(session,'mtk',siswa.id);
  assert.ok(rerata>0&&rerata<=100,`rata-rata capaian butir terbaca: ${rerata}`);
  assert.equal(cpButirAverage(session,'bindo',siswa.id),null,
    'mata pelajaran yang belum dinilai tidak mengarang angka');
});

/* ------------------------------------------------------ Mutu kalimat yang dihasilkan */

test('Kalimat deskripsi tidak menderetkan dua kata kerja dan tidak mengulang objek',()=>{
  const praktik={jenis:'praktik',praktik:'menyelesaikan operasi hitung campuran bilangan cacah'};
  /* Rumusan keterampilan sudah berupa frasa kerja, dan bingkai kalimat sudah menyediakan
     "memerlukan bimbingan untuk". Kata kerja tambahan akan menghasilkan dua kata kerja
     berderet - "mempraktikkan menyelesaikan ..." - yang salah. */
  assert.equal(frasaButir(praktik,'bimbingan'),'menyelesaikan operasi hitung campuran bilangan cacah');
  assert.equal(frasaButir(praktik,'cukup'),'mampu menyelesaikan operasi hitung campuran bilangan cacah');

  /* Butir Teori + Praktik yang kedua sisinya memakai objek yang sama tidak diulang dua kali. */
  const berulang={jenis:'teori_praktik',teori:'masalah sehari-hari yang berkaitan dengan uang',
    praktik:'menyelesaikan masalah sehari-hari yang berkaitan dengan uang'};
  const teks=frasaButir(berulang,'cukup');
  assert.equal(teks,'mampu menyelesaikan masalah sehari-hari yang berkaitan dengan uang');
  assert.equal((teks.match(/masalah sehari-hari/g)||[]).length,1,'objeknya hanya disebut sekali');

  /* Dua sisi yang memang berbeda tetap dirangkai keduanya. */
  const berbeda={jenis:'teori_praktik',teori:'sistem koordinat kartesius',
    praktik:'menggambar titik pada bidang koordinat'};
  assert.equal(frasaButir(berbeda,'tinggi'),
    'menguasai sistem koordinat kartesius serta terampil menggambar titik pada bidang koordinat');

  /* Tidak ada kalimat hasil generator yang memuat dua kata kerja berderet. */
  const {session,siswa}=siapkanDeskripsi();
  const intra=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',predicate:'Baik'});
  const rapor=generateReportDescription(session,'mtk',siswa.id,{});
  for(const kalimat of [intra.description,rapor.text])
    assert.equal(/mempraktikkan meng|mempraktikkan mem|mempraktikkan meny/.test(kalimat),false,
      'tidak ada dua kata kerja berderet pada kalimat yang dihasilkan');
});

test('Halaman Intrakurikuler menyusun deskripsi dari Butir CP murid yang dibuka',()=>{
  /* Tombol Generate pada halaman harus memakai penyusun yang SAMA dengan yang dipakai saat
     Simpan. Tanpa studentId, penyusun tidak dapat membaca nilai Butir CP dan menghasilkan
     kalimat lingkup elemen - berbeda dari yang akhirnya tersimpan. */
  const halaman=read('src/pages/intracurricular-input.js');
  const potongan=halaman.slice(halaman.indexOf('const susun=()=>composeIntracurricularDescriptionFromCp'),
    halaman.indexOf('const susun=()=>composeIntracurricularDescriptionFromCp')+320);
  assert.match(potongan,/studentId:student\.id/,'penyusun deskripsi menerima studentId');

  const {session,siswa}=siapkanDeskripsi();
  const dariHalaman=composeIntracurricularDescriptionFromCp(session,{studentName:siswa.name,
    subjectName:'Matematika',subjectId:'mtk',studentId:siswa.id,predicate:'Baik'});
  const tersimpan=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',predicate:'Baik'});
  assert.equal(dariHalaman,tersimpan.description,
    'kalimat yang ditampilkan Generate sama dengan yang tersimpan');
  assert.match(dariHalaman,/menunjukkan kemampuan/,'kalimatnya bersumber Butir CP yang dinilai');
});
