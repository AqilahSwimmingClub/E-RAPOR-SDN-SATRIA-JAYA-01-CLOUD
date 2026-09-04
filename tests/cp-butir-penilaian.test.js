import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { capaianPembelajaran, CP_SUBJECTS, cpElements } from '../src/data/curriculum-cp.js';
import { cpButirCoverage, defaultCpButir } from '../src/data/cp-butir-defaults.js';
import { createCpButir, deleteCpButir, getCpButir, listCpButir, listCpButirForSemester,
  semesterNumberOf, setCpButirActive, updateCpButir } from '../src/services/cp-butir.js';
import { composeIntracurricularButirDescription, composeReportButirDescription,
  deskripsiBocorFase, deskripsiMengulangMapel, JENIS_INTRAKURIKULER,
  substansiButir } from '../src/services/cp-descriptions.js';
import { generateReportDescription } from '../src/services/descriptions.js';
import { composeIntracurricularDescriptionFromCp, fillAllIntracurricular,
  getStudentIntracurricularSelection,
  saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { createLearningObjective, listLearningObjectives } from '../src/services/objectives.js';
import { saveAssessmentScores, saveAssessmentSettings, ASSESSMENT_TYPES } from '../src/services/assessment.js';
import { saveAttendance } from '../src/services/attendance.js';
import { saveClassAttitudeBulk } from '../src/services/attitudes.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb, saveSubjectMapping } from '../src/services/storage.js';

/* MODEL CP YANG SUDAH DISEDERHANAKAN.

       CP RESMI -> ELEMEN -> BUTIR CP

   Itu saja. Rantainya sengaja tidak lebih panjang dari itu, dan suite ini menjaganya tetap
   pendek. Tiga hal yang DIHAPUS dari model - dan karena itu diuji sebagai ketiadaan, bukan
   sebagai keberadaan:

   1. SEMESTER pada Butir CP. CP ditetapkan pemerintah per FASE. Seluruh butir aktif tersedia
      pada semester mana pun, dan semester sebuah PENILAIAN mengikuti semester aplikasi.
   2. JENIS PENILAIAN pada Butir CP. Teori/Praktik adalah sifat KEGIATAN, bukan sifat
      kompetensi, sehingga ia milik Intrakurikuler.
   3. "Teori + Praktik". Satu kegiatan penilaian menilai satu sisi.

   Yang tetap dijaga: Butir CP BUKAN TP yang berganti nama; deskripsi Intrakurikuler dan
   deskripsi Rapor tidak boleh sama; dan Fase, kode CP, serta nama mata pelajaran tidak pernah
   bocor ke kalimat yang dibaca orang tua. */

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

/* ------------------------------------------------ 1. Label UI sudah berpindah ke CP */

test('1. Menu CP hanya menyajikan pengelolaan CP - tanpa jenis, semester, dan nilai',()=>{
  const halaman=read('src/pages/objectives.js');
  const navigasi=read('src/data/navigation.js');
  assert.match(navigasi,/item\('objectives','Capaian Pembelajaran'/,'menu bernama Capaian Pembelajaran');
  assert.match(halaman,/<h1>Capaian Pembelajaran<\/h1>/,'judul halaman memakai CP');
  assert.match(halaman,/Tambah CP/,'tombol Tambah CP');
  assert.match(halaman,/Buat CP Manual/,'tombol Buat CP Manual');
  assert.match(halaman,/<th>Butir CP<\/th>/,'tabel memuat kolom Butir CP');
  /* EMPAT FUNGSI YANG DIMINTA, dan hanya itu. */
  for(const aksi of ['data-toggle','data-edit','data-tambah','data-manual'])
    assert.ok(halaman.includes(aksi),`menu CP menyediakan aksi ${aksi}`);
  /* Kolom dan kendali yang sudah dibuang tidak boleh tertinggal sebagai jalur kedua. */
  for(const dibuang of ['<th>Jenis Penilaian</th>','<th>Semester</th>','data-jenis','data-semester',
    'data-nilai','Teori + Praktik','getCpButirScoreSheet','saveCpButirScores'])
    assert.equal(halaman.includes(dibuang),false,`menu CP tidak lagi memuat ${dibuang}`);
  for(const lama of ['Tambah TP','Buat TP Manual','Simpan TP Terpilih'])
    assert.equal(halaman.includes(lama),false,`tombol lama ${lama} sudah tidak ada`);
});

test('2. Form Tambah/Edit CP tidak meminta jenis penilaian maupun semester',()=>{
  const halaman=read('src/pages/objectives.js');
  const form=halaman.slice(halaman.indexOf('function openManualForm'),
    halaman.indexOf('function drawLegacy'));
  assert.match(form,/name="elementId"/,'form meminta Elemen CP');
  assert.match(form,/name="name"/,'form meminta nama Butir CP');
  assert.match(form,/name="teori"/,'form meminta rumusan pengetahuan');
  assert.match(form,/name="praktik"/,'form meminta rumusan keterampilan');
  assert.match(form,/name="active"/,'form meminta status aktif');
  for(const dilarang of ['name="jenis"','name="semester"','Jenis Penilaian','Semester 1','Semester 2'])
    assert.equal(form.includes(dilarang),false,`form Tambah/Edit CP tidak meminta ${dilarang}`);
});

/* ------------------------------------------------ 3-6. CRUD dan status Butir CP */

test('3-4. Tambah dan edit Butir CP bekerja tanpa parameter jenis/semester',()=>{
  const {session}=siapkan();
  const elemen=cpElements('mtk','C');
  const sebelum=listCpButir(session,'mtk').length;

  const baru=createCpButir(session,'mtk',{elementId:elemen[0].id,name:'Estimasi hasil hitung',
    teori:'strategi estimasi hasil operasi hitung',praktik:'melakukan estimasi hasil operasi hitung'});
  assert.equal(baru.isDefault,false,'butir buatan guru ditandai bukan bawaan');
  assert.equal(baru.elementName,elemen[0].name,'butir menempel pada elemen CP resmi');
  assert.equal('jenis' in baru,false,'butir baru tidak membawa jenis penilaian');
  assert.equal('semester' in baru,false,'butir baru tidak membawa semester');
  assert.equal(listCpButir(session,'mtk').length,sebelum+1,'3. butir baru masuk daftar');

  const diubah=updateCpButir(session,'mtk',baru.id,{...baru,name:'Estimasi dan pembulatan'});
  assert.equal(diubah.name,'Estimasi dan pembulatan','4. edit butir buatan guru tersimpan');

  /* Butir BAWAAN juga dapat diedit; dataset aslinya tidak diubah, yang tersimpan penyesuaiannya. */
  const bawaan=listCpButir(session,'mtk').find(item=>item.isDefault);
  const ubahBawaan=updateCpButir(session,'mtk',bawaan.id,{...bawaan,name:`${bawaan.name} (disesuaikan)`});
  assert.match(ubahBawaan.name,/disesuaikan/,'4. edit butir bawaan tersimpan sebagai penyesuaian');
  assert.equal(defaultCpButir('mtk','C').find(item=>item.id===bawaan.id).name,bawaan.name,
    'dataset bawaan tidak ikut berubah');
});

test('5. Butir CP manual dapat dihapus; butir bawaan hanya dinonaktifkan',()=>{
  const {session}=siapkan();
  const elemen=cpElements('mtk','C');
  const manual=createCpButir(session,'mtk',{elementId:elemen[1].id,name:'Butir uji hapus',
    teori:'materi uji'});
  assert.equal(deleteCpButir(session,'mtk',manual.id),true,'5. butir manual terhapus');
  assert.equal(getCpButir(session,'mtk',manual.id),null,'butir manual tidak lagi terdaftar');

  const bawaan=listCpButir(session,'mtk').find(item=>item.isDefault);
  assert.throws(()=>deleteCpButir(session,'mtk',bawaan.id),/tidak dapat dihapus/i,
    'butir bawaan dilindungi agar catatan lamanya tidak kehilangan induk');
});

test('6. Aktif dan nonaktif Butir CP bekerja dan menentukan yang dipakai',()=>{
  const {session}=siapkan();
  const butir=listCpButirForSemester(session,'mtk')[0];
  assert.ok(butir,'ada butir aktif');
  setCpButirActive(session,'mtk',butir.id,false);
  assert.equal(getCpButir(session,'mtk',butir.id).active,false,'6. butir dinonaktifkan');
  assert.equal(listCpButirForSemester(session,'mtk').some(item=>item.id===butir.id),false,
    'butir nonaktif tidak lagi ditawarkan untuk penilaian');
  setCpButirActive(session,'mtk',butir.id,true);
  assert.equal(listCpButirForSemester(session,'mtk').some(item=>item.id===butir.id),true,
    'butir dapat diaktifkan kembali');
});

/* ------------------------------------------------- 7-9. Elemen dan ketiadaan semester */

test('7-8. CP resmi punya elemen, dan satu elemen memuat beberapa Butir CP',()=>{
  const elemen=cpElements('mtk','C');
  assert.ok(elemen.length>=5,'7. CP Matematika Fase C memiliki elemen resmi');
  const bilangan=defaultCpButir('mtk','C').filter(item=>item.elementName==='Bilangan');
  assert.ok(bilangan.length>=6,`8. elemen Bilangan dipecah menjadi ${bilangan.length} Butir CP`);
  /* Yang diuji bukan nama butirnya, melainkan bahwa setiap kemampuan yang disebut naskah CP
     Bilangan Fase C benar-benar terwakili oleh sebuah butir. */
  const isiBilangan=bilangan.map(item=>`${item.name} ${item.teori||''} ${item.praktik||''}`.toLowerCase()).join(' | ');
  for(const kemampuan of ['1.000.000','nilai tempat','uang','kpk','fpb','pecahan','desimal'])
    assert.ok(isiBilangan.includes(kemampuan),`kemampuan "${kemampuan}" pada naskah CP terwakili butir`);
  for(const item of defaultCpButir('mtk','C'))
    assert.ok(elemen.some(el=>el.id===item.elementId),'butir menunjuk elemen CP resmi');
});

test('9. Seluruh Butir CP aktif tersedia pada semester aktif mana pun',()=>{
  const {session}=siapkan();
  const ganjil=listCpButirForSemester(session,'mtk');
  assert.ok(ganjil.length>=6,`ada butir aktif pada semester ganjil: ${ganjil.length}`);

  /* Semester GENAP melihat daftar butir yang SAMA PERSIS. Dulu daftarnya terbelah dua dan guru
     harus memindahkan butir antar semester secara manual. */
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  const daftarGenap=listCpButirForSemester(genap,'mtk');
  assert.deepEqual(daftarGenap.map(item=>item.id),ganjil.map(item=>item.id),
    '9. butir yang sama tersedia pada Ganjil maupun Genap');
  assert.equal(semesterNumberOf(session),1,'Ganjil dipetakan ke Semester 1');
  assert.equal(semesterNumberOf(genap),2,'Genap dipetakan ke Semester 2');
  /* Menonaktifkan pada satu semester berlaku untuk butirnya, bukan untuk semesternya. */
  setCpButirActive(session,'mtk',ganjil[0].id,false);
  assert.equal(listCpButirForSemester(genap,'mtk').some(item=>item.id===ganjil[0].id),false,
    'status aktif adalah milik butir, bukan milik semester');
});

/* ------------------------------------- 10-14. Intrakurikuler: multi butir, dua jenis saja */

function siapkanIntra(){
  const {session,siswa}=siapkan();
  saveAssessmentSettings(session,'mtk',{formative:30,daily:20,practice:20,scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,'mtk',jenis.id,{[siswa.id]:82});
  return {session,siswa,butir:listCpButirForSemester(session,'mtk')};
}

test('10. Intrakurikuler hanya mengenal Teori dan Praktik - tidak ada Teori + Praktik',()=>{
  assert.deepEqual(JENIS_INTRAKURIKULER.map(item=>item.id),['teori','praktik'],
    '10. persis dua jenis penilaian');
  /* Komentar dibuang lebih dulu supaya yang diperiksa benar-benar KODENYA, bukan catatan
     sejarah yang memang menyebut nama jenis lama untuk menerangkan mengapa ia dihapus. */
  const kode=['src/services/cp-descriptions.js','src/services/intracurricular.js',
    'src/pages/intracurricular-input.js','src/pages/objectives.js','src/services/cp-butir.js']
    .map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  for(const dibuang of ['teori_praktik','Teori + Praktik','JENIS_PENILAIAN'])
    assert.equal(kode.includes(dibuang),false,`${dibuang} sudah tidak ada di jalur aktif`);
});

test('11. Satu, dua, dan banyak Butir CP dapat dipilih dan semuanya masuk deskripsi',()=>{
  const {session,siswa,butir}=siapkanIntra();
  for(const jumlah of [1,2,3,4]){
    const dipilih=butir.slice(0,jumlah);
    const hasil=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
      butirIds:dipilih.map(item=>item.id),jenis:'teori',predicate:'Baik'});
    assert.equal(hasil.butirIds.length,jumlah,`11. ${jumlah} Butir CP tersimpan`);
    for(const item of dipilih)
      assert.ok(hasil.description.includes(substansiButir(item,'teori')),
        `substansi butir "${item.name}" masuk ke deskripsi`);
  }
});

test('12. Banyak Butir CP tetap menghasilkan SATU predikat dan SATU deskripsi',()=>{
  const {session,siswa,butir}=siapkanIntra();
  const hasil=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:butir.slice(0,3).map(item=>item.id),jenis:'teori',predicate:'Sangat Baik'});
  assert.equal(hasil.predicate,'Sangat Baik','12. satu predikat untuk seluruh butir');
  assert.equal(typeof hasil.description,'string');
  /* Bukan tiga paragraf: satu kalimat yang meringkas ketiganya. */
  const kalimat=hasil.description.split(/(?<=\.)\s+/).filter(Boolean);
  assert.ok(kalimat.length<=2,`deskripsi ringkas, bukan tiga paragraf: ${kalimat.length} kalimat`);
});

test('13. Butir yang tidak dipilih tidak masuk; butir nonaktif tidak dapat dipilih',()=>{
  const {session,siswa,butir}=siapkanIntra();
  const dipilih=butir[0];
  const tidakDipilih=butir[1];
  const hasil=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:[dipilih.id],jenis:'teori',predicate:'Baik'});
  assert.ok(hasil.description.includes(substansiButir(dipilih,'teori')));
  assert.equal(hasil.description.includes(substansiButir(tidakDipilih,'teori')),false,
    '13. butir yang tidak dipilih tidak pernah masuk deskripsi');

  /* Butir yang dinonaktifkan disaring walaupun id-nya tetap dikirim. */
  setCpButirActive(session,'mtk',dipilih.id,false);
  const sesudah=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:[dipilih.id,tidakDipilih.id],jenis:'teori',predicate:'Baik'});
  assert.deepEqual(sesudah.butirIds,[tidakDipilih.id],'butir nonaktif tidak dapat dipakai');
  assert.equal(sesudah.description.includes(substansiButir(dipilih,'teori')),false,
    'substansi butir nonaktif tidak bocor ke deskripsi');
});

test('14. Teori dan Praktik menghasilkan bahasa yang berbeda dan sesuai substansi CP',()=>{
  const {session,siswa,butir}=siapkanIntra();
  const ids=butir.slice(0,2).map(item=>item.id);
  const teori=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:ids,jenis:'teori',predicate:'Baik'});
  const praktik=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:ids,jenis:'praktik',predicate:'Baik'});
  assert.notEqual(teori.description,praktik.description,'14. dua jenis, dua kalimat');
  assert.match(teori.description,/^Memahami /,'Teori memakai bahasa pemahaman');
  assert.match(praktik.description,/^Terampil /,'Praktik memakai bahasa keterampilan');
  /* Substansinya memang diambil dari sisi yang benar - bukan hasil menukar kata. */
  for(const item of butir.slice(0,2)){
    assert.ok(teori.description.includes(substansiButir(item,'teori')));
    assert.ok(praktik.description.includes(substansiButir(item,'praktik')));
  }
  /* Generator tidak mengarang: butir yang hanya punya satu sisi memakai sisi yang ada. */
  const hanyaTeori={teori:'konsep nilai tempat bilangan cacah',praktik:null};
  assert.equal(substansiButir(hanyaTeori,'praktik'),'konsep nilai tempat bilangan cacah',
    'tidak ada kompetensi praktik yang dikarang');
});

test('15. Intrakurikuler memakai PREDIKAT, bukan input nilai angka',()=>{
  const {session,siswa,butir}=siapkanIntra();
  const hasil=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:[butir[0].id],jenis:'teori',predicate:'Baik'});
  assert.equal(hasil.predicate,'Baik');
  assert.equal('score' in hasil,false,'catatan Intrakurikuler tidak menyimpan angka');
  assert.equal('nilai' in hasil,false,'catatan Intrakurikuler tidak menyimpan nilai');
  assert.throws(()=>saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:[butir[0].id],jenis:'teori',predicate:85}),/Predikat intrakurikuler tidak valid/,
    'angka ditolak sebagai predikat');
  /* Halaman Intrakurikuler tidak memuat satu pun input angka. */
  const halaman=read('src/pages/intracurricular-input.js');
  assert.equal(/type="number"/.test(halaman),false,'15. tidak ada input angka pada halaman Intrakurikuler');
});

/* ------------------------------------------------ 16-18. Rapor: satu Nilai Akhir, tanpa TP */

test('16. Rapor tidak punya nilai maupun pilihan Teori/Praktik',()=>{
  const halaman=read('src/pages/reports.js');
  for(const dilarang of ['Nilai Teori','Nilai Praktik','<th>Teori</th>','<th>Praktik</th>',
    'data-jenis','teori_praktik'])
    assert.equal(halaman.includes(dilarang),false,`16. Rapor tidak memuat ${dilarang}`);
  /* Yang tetap ada adalah satu Nilai Akhir dari lima komponen penilaian. */
  assert.match(halaman,/5 Komponen/,'lima komponen penilaian tetap menjadi dasar Nilai Akhir');
});

test('17. Generator Rapor tidak lagi memakai TP sebagai basis',()=>{
  const {session,siswa}=siapkanIntra();
  const tp=createLearningObjective(session,'mtk',{description:'TP lama sekolah',active:true});
  const rapor=generateReportDescription(session,'mtk',siswa.id,{});
  assert.equal(rapor.source,'CP_BUTIR','17. deskripsi rapor bersumber Butir CP');
  assert.equal(rapor.text.includes('TP lama sekolah'),false,'isi TP tidak masuk deskripsi');
  assert.equal(rapor.objectiveIds,null,'tidak ada TP yang dijadikan acuan');
  /* Catatan TP-nya sendiri TIDAK dihapus. */
  assert.equal(listLearningObjectives(session,'mtk').some(item=>item.id===tp.id),true,
    'catatan TP lama tetap tersimpan dan dapat dibaca');
  /* Jalur batch pun tidak lagi menyentuh TP. */
  const bulk=read('src/services/report-bulk.js');
  const kode=bulk.replace(/\/\*[\s\S]*?\*\//g,'');
  for(const sisa of ['listActiveObjectives','objectiveIds','Belum ada TP aktif'])
    assert.equal(kode.includes(sisa),false,`jalur Simpan Otomatis tidak lagi memakai ${sisa}`);
});

test('18. Deskripsi Rapor berbeda dari deskripsi Intrakurikuler',()=>{
  const {session,siswa,butir}=siapkanIntra();
  const intra=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:butir.slice(0,2).map(item=>item.id),jenis:'teori',predicate:'Baik'});
  const rapor=generateReportDescription(session,'mtk',siswa.id,{});
  assert.notEqual(intra.description,rapor.text,'18. dua konteks, dua kalimat');
  /* Bedanya struktural: rapor menyatakan tingkat capaian dari Nilai Akhir. */
  assert.match(rapor.text,/^Menunjukkan /,'rapor memakai bingkai capaian');
  assert.equal(/^Menunjukkan /.test(intra.description),false,
    'Intrakurikuler tidak memakai bingkai capaian rapor');
  /* Keduanya memakai penyusun yang berbeda, bukan satu template yang dipakai bergantian. */
  const generatorIntra=composeIntracurricularButirDescription({butir,jenis:'teori',predicate:'Baik'});
  const generatorRapor=composeReportButirDescription({butir,finalScore:82,kktp:75});
  assert.notEqual(generatorIntra,generatorRapor,'penyusunnya memang berbeda');
});

/* ------------------------------------------- 19-20. Fase, kode CP, dan nama mapel tidak bocor */

test('19. Fase, kode CP, dan TP tidak pernah bocor ke deskripsi siswa',()=>{
  for(const classId of ['1A','3C','5B']){
    useMemoryStorage();
    const session=guru(classId);
    aktifkanMapel(session,['mtk','bindo','pjok']);
    const siswa=tambahSiswa(session);
    for(const subjectId of ['mtk','bindo','pjok']){
      const butir=listCpButirForSemester(session,subjectId);
      if(!butir.length)continue;
      const intra=saveStudentIntracurricularSelection(session,siswa.id,{subjectId,
        butirIds:butir.slice(0,2).map(item=>item.id),jenis:'teori',predicate:'Baik'});
      const rapor=generateReportDescription(session,subjectId,siswa.id,{});
      for(const [nama,teks] of [['Intrakurikuler',intra.description],['Rapor',rapor.text]]){
        assert.equal(deskripsiBocorFase(teks),false,`19. ${nama} ${classId} ${subjectId} bebas kata Fase/TP`);
        assert.equal(/\bFase\b/.test(teks),false,`${nama} ${classId} ${subjectId} tidak menyebut Fase`);
        assert.equal(/CP [A-Z][a-z]+ \d/.test(teks),false,'kode butir tidak ikut ke deskripsi');
        assert.equal(/pada akhir fase/i.test(teks),false,'bahasa administratif kurikulum tidak dipakai');
      }
    }
  }
  const sumber=read('src/services/cp-descriptions.js');
  assert.equal(/Fase \$\{cp\.phase\}/.test(sumber),false,'template kalimat tidak menyisipkan fase');
});

test('20. Nama mata pelajaran tidak pernah diulang di dalam kalimat deskripsi',()=>{
  const {session,siswa,butir}=siapkanIntra();
  const intra=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:butir.slice(0,2).map(item=>item.id),jenis:'teori',predicate:'Baik'});
  const rapor=generateReportDescription(session,'mtk',siswa.id,{});
  for(const [nama,teks] of [['Intrakurikuler',intra.description],['Rapor',rapor.text]]){
    assert.equal(deskripsiMengulangMapel(teks,'Matematika'),false,
      `20. ${nama} tidak berbunyi "mata pelajaran Matematika"`);
    assert.equal(/mata pelajaran/i.test(teks),false,`${nama} tidak menyebut "mata pelajaran"`);
  }
  /* Penjaganya sendiri memang bekerja - bukan sekadar kebetulan lolos. */
  assert.equal(deskripsiMengulangMapel('Menunjukkan kemampuan yang baik dalam mata pelajaran IPAS.','IPAS'),true);
});

/* --------------------------------------------------- 21-22. Cakupan katalog tidak berubah */

test('21. Seluruh mata pelajaran memakai mekanisme CP/Butir CP yang sama',()=>{
  const cakupan=cpButirCoverage(CP_SUBJECTS);
  const berlaku=cakupan.filter(item=>item.elemen>0);
  assert.ok(berlaku.length>=29,`kombinasi mapel-fase yang berlaku: ${berlaku.length}`);
  /* SATU PENGECUALIAN YANG DISENGAJA. `seni` adalah label payung demi kompatibilitas mapping
     lama, bukan nama mata pelajaran pada dokumen CP resmi. */
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
    assert.ok(capaianPembelajaran(`${item.phase==='A'?1:item.phase==='B'?3:5}A`,item.subjectId).naskah,
      `${item.subjectId} Fase ${item.phase}: Butir CP bersandar pada naskah CP resmi yang dimuat`);
  }
  /* 291 butir substansinya TIDAK berubah oleh penyederhanaan model. */
  const total=berbutir.reduce((jumlah,item)=>jumlah+item.butir,0);
  assert.equal(total,291,`jumlah Butir CP tetap 291, terbaca ${total}`);
  for(const item of berbutir.flatMap(entry=>defaultCpButir(entry.subjectId,entry.phase))){
    assert.ok(item.teori||item.praktik,`${item.code}: memiliki rumusan substansi`);
    assert.equal('jenis' in item,false,`${item.code}: tidak lagi membawa jenis penilaian`);
    assert.equal('semester' in item,false,`${item.code}: tidak lagi membawa semester`);
  }
  /* Butir CP bukan TP yang berganti nama. */
  const katalogTp=read('src/data/learning-objective-defaults.js');
  for(const nama of defaultCpButir('mtk','C').map(item=>item.name))
    assert.equal(katalogTp.includes(nama),false,`butir "${nama}" bukan salinan katalog TP`);
});

/* ------------------------------------------------- 22-24. Data lama tetap utuh dan terbaca */

test('22-23. Data pengguna lama tetap terbaca dan tidak ada yang hilang',()=>{
  const {session,siswa}=siapkan();
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

  const butir=listCpButirForSemester(session,'mtk');
  createCpButir(session,'mtk',{elementId:cpElements('mtk','C')[0].id,name:'Butir tambahan',
    teori:'materi tambahan'});
  saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:[butir[0].id],jenis:'teori',predicate:'Baik'});

  const sesudah=loadDb();
  for(const [koleksi,jumlah] of Object.entries(cuplikan))
    assert.equal(Object.keys(sesudah[koleksi]).length,jumlah,`23. ${koleksi} tidak berkurang`);
  assert.equal(listLearningObjectives(session,'mtk').find(item=>item.id===tp.id).description,'TP warisan',
    '22. catatan TP lama tetap terbaca setelah revisi');
  assert.equal(listStudents(session,{classId:'5B'}).length,1,'data siswa utuh');

  const sumber=read('src/services/cp-butir.js')+read('src/services/intracurricular.js');
  for(const larangan of ['localStorage.clear()','replaceDb(','delete db.students','delete db.attendance',
    'delete db.assessmentScores','delete db.learningObjectives'])
    assert.equal(sumber.includes(larangan),false,`layanan CP/Intrakurikuler tidak pernah ${larangan}`);
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
  /* Skema database TIDAK dinaikkan: penyederhanaan model tidak menyentuh baris mana pun. */
  assert.equal(/APP_SCHEMA_VERSION\s*=\s*6/.test(read('src/data/version.js')),false,
    'tidak ada kenaikan skema yang memaksa migrasi database lama');
});

/* ------------------------------------------------------ 25. Semester otomatis dan terpisah */

test('25. Butir yang sama dipakai Ganjil dan Genap tanpa saling menimpa',()=>{
  const {session,siswa}=siapkan();
  const butir=listCpButirForSemester(session,'mtk')[0];
  const ganjil=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:[butir.id],jenis:'teori',predicate:'Baik'});
  assert.equal(ganjil.semesterNumber,1,'hasil Ganjil tersimpan sebagai Semester 1');

  /* Data siswa memang bercakupan semester, jadi rombel semester berikutnya punya catatannya
     sendiri. Yang diuji di sini adalah bahwa BUTIR CP-nya tidak ikut terbelah. */
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  aktifkanMapel(genap,['mtk','pjok','bindo']);
  const siswaGenap=tambahSiswa(genap);
  assert.deepEqual(listCpButirForSemester(genap,'mtk').map(item=>item.id),
    listCpButirForSemester(session,'mtk').map(item=>item.id),
    '25. daftar Butir CP identik pada Ganjil dan Genap - tidak perlu digandakan');

  const hasilGenap=saveStudentIntracurricularSelection(genap,siswaGenap.id,{subjectId:'mtk',
    butirIds:[butir.id],jenis:'praktik',predicate:'Sangat Baik'});
  assert.equal(hasilGenap.semesterNumber,2,'hasil Genap tersimpan sebagai Semester 2');
  assert.deepEqual(hasilGenap.butirIds,[butir.id],'butir yang SAMA dipakai lagi di Genap');

  /* Riwayat semester sebelumnya TIDAK tertimpa: kuncinya memuat semester lewat scopeKey. */
  const bacaGanjil=getStudentIntracurricularSelection(session,siswa.id,'mtk');
  assert.equal(bacaGanjil.predicate,'Baik','data Ganjil tetap utuh');
  assert.equal(bacaGanjil.jenis,'teori');
  const bacaGenap=getStudentIntracurricularSelection(genap,siswaGenap.id,'mtk');
  assert.equal(bacaGenap.predicate,'Sangat Baik','data Genap berdiri sendiri');
  assert.notEqual(bacaGanjil.description,bacaGenap.description);
  /* Kunci penyimpanannya memang berbeda semester. */
  const kunci=Object.keys(loadDb().intracurricularScores);
  assert.ok(kunci.some(key=>key.startsWith(`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|`)),
    'catatan Ganjil tersimpan pada kunci semester Ganjil');
  assert.ok(kunci.some(key=>key.startsWith(`${ACADEMIC_YEAR}|Genap ${ACADEMIC_YEAR}|`)),
    'catatan Genap tersimpan pada kunci semester Genap');
});

/* ------------------------------------------------------ 26. Isi Otomatis Semua Siswa */

test('26. Isi Otomatis Semua Siswa memproses seluruh murid pada mapel yang dipilih',()=>{
  const {session}=siapkan();
  for(let i=2;i<=5;i++)tambahSiswa(session,i);
  const butir=listCpButirForSemester(session,'mtk').slice(0,2).map(item=>item.id);
  const hasil=fillAllIntracurricular(session,{subjectId:'mtk',butirIds:butir,
    jenis:'praktik',predicate:'Baik'});
  assert.equal(hasil.total,5,'seluruh murid rombel diproses');
  assert.equal(hasil.terisi,5,'26. lima murid terisi sekaligus');
  assert.equal(hasil.subjectId,'mtk','mapel yang diproses adalah yang diminta');
  for(const murid of listStudents(session,{classId:'5B'})){
    const catatan=getStudentIntracurricularSelection(session,murid.id,'mtk');
    assert.equal(catatan.subjectId,'mtk');
    assert.deepEqual(catatan.butirIds,butir,'butir terpilih tersimpan untuk tiap murid');
    assert.equal(catatan.jenis,'praktik');
  }
});

/* ------------------------------------------------------- 27. Halaman dan layanan sejalan */

test('27. Tombol Generate pada halaman memakai penyusun yang sama dengan Simpan',()=>{
  const halaman=read('src/pages/intracurricular-input.js');
  assert.match(halaman,/const susun=\(\)=>composeIntracurricularDescriptionFromCp/,
    'halaman memakai penyusun layanan, bukan template sendiri');
  assert.match(halaman,/butirIds:idTerpilih\(\)/,'penyusun menerima butir yang dicentang guru');

  const {session,siswa,butir}=siapkanIntra();
  const ids=butir.slice(0,2).map(item=>item.id);
  const dariHalaman=composeIntracurricularDescriptionFromCp(session,{subjectId:'mtk',
    butirIds:ids,jenis:'teori',predicate:'Baik'});
  const tersimpan=saveStudentIntracurricularSelection(session,siswa.id,{subjectId:'mtk',
    butirIds:ids,jenis:'teori',predicate:'Baik'});
  assert.equal(dariHalaman,tersimpan.description,
    'kalimat yang ditampilkan Generate sama dengan yang tersimpan');
});
