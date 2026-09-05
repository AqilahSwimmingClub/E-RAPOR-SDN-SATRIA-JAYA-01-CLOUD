import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { setTeacherAssignment } from '../src/services/teacher-assignments.js';
import { saveSubjectMapping } from '../src/services/storage.js';
import { createStudent } from '../src/services/students.js';
import { createCpButir, listCpButir, setCpButirActive } from '../src/services/cp-butir.js';
import { createLearningObjective } from '../src/services/objectives.js';
import {
  composeIntracurricularDescriptionFromCp, PESAN_BUTIR_WAJIB, previewAllIntracurricular,
  saveAllIntracurricular, saveStudentIntracurricularSelection,
  getStudentIntracurricularSelection, setIntracurricularVisibility,
} from '../src/services/intracurricular.js';
import { composeIntracurricularButirDescription } from '../src/services/cp-descriptions.js';
import { getReportDocument } from '../src/services/documents.js';
import { loadDb } from '../src/services/storage.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';

/* DESKRIPSI INTRAKURIKULER DAN BARIS INTRAKURIKULER PADA RAPOR.

   Dua hal yang diuji berkas ini, keduanya lahir dari pengujian APK di perangkat nyata:

   1. Deskripsi disusun dari NAMA SISWA + BUTIR CP YANG DICENTANG + JENIS + PREDIKAT PILIHAN
      GURU. Predikatnya tidak pernah dihitung dari Nilai Akhir - rentang nilai dan rubrik
      adalah urusan Deskripsi Rapor, bukan Intrakurikuler.

   2. Yang tampil pada rapor hanyalah mata pelajaran yang memang dinyatakan tampil. Sebelumnya
      setiap mapel yang pernah disimpan ikut tercetak, sehingga guru yang menilai tiga mapel
      dan hanya ingin melaporkan satu tetap melihat ketiganya. */

function useMemoryStorage(){
  const values=new Map();
  const buat=()=>({getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),clear:()=>values.clear()});
  globalThis.localStorage=buat();globalThis.sessionStorage=buat();
}

const SEMESTER=`Ganjil ${ACADEMIC_YEAR}`;
const KELAS='5B';
const admin={role:'admin',academicYear:ACADEMIC_YEAR,semester:SEMESTER,userName:'Admin'};
const guru=(classId=KELAS,semester=SEMESTER)=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});

/* Mapel diambil dari data aplikasi, bukan diketik, sehingga test tidak mengunci nama tertentu. */
function siapkan(classId=KELAS,semester=SEMESTER){
  const sesi=guru(classId,semester);
  saveSubjectMapping(sesi,SUBJECTS_DEFAULT.map(item=>({...item,active:true})));
  const berlaku=SUBJECTS_DEFAULT.map(item=>item.id);
  setTeacherAssignment({...admin,semester},classId,{subjectIds:berlaku,active:true});
  return sesi;
}
function tambahSiswa(sesi,index=1,nama=`Siswa Uji ${index}`){
  return createStudent(sesi,{classId:sesi.classId,nis:`${sesi.classId}-${index}`,
    nisn:`88${String(index).padStart(8,'0')}`,religion:'Islam',name:nama,
    gender:index%2?'L':'P',photo:''});
}
/* Mapel yang punya Butir CP aktif DAN memang menjadi mapel murid itu.

   Daftar mapel seorang murid tidak sama dengan daftar mapel rombelnya: mapel agama mengikuti
   agama murid, sehingga murid beragama Islam tidak pernah mempunyai baris PAK BP. Helper ini
   memakai daftar milik murid supaya test menguji aturan tampil-di-rapor, bukan aturan mapel
   agama yang memang sudah benar. */
function mapelBerbutir(sesi,jumlah=3,student=null){
  const tersedia=student
    ? listSubjectsForStudent(sesi,student).map(item=>item.id)
    : SUBJECTS_DEFAULT.map(item=>item.id);
  const hasil=[];
  for(const id of tersedia){
    let butir=[];
    try{butir=listCpButir(sesi,id,{activeOnly:true});}catch{continue;}
    if(butir.length)hasil.push(id);
    if(hasil.length>=jumlah)break;
  }
  return hasil;
}
function butirPertama(sesi,subjectId){
  const butir=listCpButir(sesi,subjectId,{activeOnly:true});
  return butir[0];
}

/* ------------------------------------------------- K. REDAKSI DESKRIPSI INTRAKURIKULER */

/* Butir buatan sendiri dipakai untuk menguji redaksi supaya kalimatnya dapat diperiksa kata
   demi kata tanpa bergantung pada bunyi katalog CP bawaan. */
const BUTIR_TEORI=[{teori:'konsep pecahan sederhana'}];
const BUTIR_PRAKTIK=[{teori:'konsep pecahan sederhana',
  praktik:'menyelesaikan soal pecahan dalam kehidupan sehari-hari'}];

test('1. Teori + Sangat Baik menyebut penguasaan sangat baik dan menutup dengan pemahaman yang kuat',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_TEORI,
    jenis:'teori',predicate:'Sangat Baik'});
  assert.ok(teks.startsWith('Ananda Adwa '),teks);
  assert.match(teks,/sangat baik/);
  assert.match(teks,/konsep pecahan sederhana/);
  assert.match(teks,/pemahaman yang kuat terhadap kompetensi tersebut\.$/);
});

test('2. Teori + Baik menyebut penguasaan baik dan menutup dengan telah memahami',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_TEORI,
    jenis:'teori',predicate:'Baik'});
  assert.match(teks,/yang baik/);
  assert.match(teks,/telah memahami kompetensi tersebut dengan baik\.$/);
  assert.equal(/sangat baik/.test(teks),false,'predikat Baik tidak boleh berbunyi sangat baik');
});

test('3. Teori + Cukup menutup dengan penguatan, bukan pujian',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_TEORI,
    jenis:'teori',predicate:'Cukup'});
  assert.match(teks,/cukup/);
  assert.match(teks,/, namun masih memerlukan penguatan agar penguasaannya semakin mantap\.$/);
});

test('4. Teori + Perlu Bimbingan menutup dengan penguatan bertahap',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_TEORI,
    jenis:'teori',predicate:'Perlu Bimbingan'});
  assert.match(teks,/masih memerlukan bimbingan/);
  assert.match(teks,/perlu penguatan secara bertahap untuk meningkatkan pemahamannya\.$/);
});

test('5. Praktik + Sangat Baik menyebut keterampilan dan kemandirian',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_PRAKTIK,
    jenis:'praktik',predicate:'Sangat Baik'});
  assert.match(teks,/keterampilan yang sangat baik|sangat terampil/);
  assert.match(teks,/menyelesaikan soal pecahan/);
  assert.match(teks,/melaksanakan kegiatan dengan tepat dan mandiri\.$/);
});

test('6. Praktik + Baik menutup dengan cukup mandiri',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_PRAKTIK,
    jenis:'praktik',predicate:'Baik'});
  assert.match(teks,/keterampilan yang baik|terampil/);
  assert.match(teks,/melaksanakan kegiatan dengan cukup mandiri\.$/);
});

test('7. Praktik + Cukup menutup dengan arahan pada beberapa tahapan',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_PRAKTIK,
    jenis:'praktik',predicate:'Cukup'});
  assert.match(teks,/, namun masih memerlukan arahan pada beberapa tahapan kegiatan\.$/);
});

test('8. Praktik + Perlu Bimbingan menutup dengan latihan bertahap',()=>{
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_PRAKTIK,
    jenis:'praktik',predicate:'Perlu Bimbingan'});
  assert.match(teks,/masih memerlukan bimbingan/);
  assert.match(teks,/perlu latihan bertahap untuk mengembangkan keterampilannya\.$/);
});

test('9. Praktik pada Butir CP pengetahuan-saja tidak mengarang keterampilan',()=>{
  /* Guru memilih Praktik, tetapi butir yang dicentangnya hanya memuat rumusan pengetahuan.
     Kalimatnya wajib tetap berbahasa pemahaman - baik pembuka maupun penutupnya - sebab CP
     adalah sumber kebenaran kompetensi, bukan label jenis penilaian. */
  const teks=composeIntracurricularButirDescription({studentName:'Adwa',butir:BUTIR_TEORI,
    jenis:'praktik',predicate:'Baik'});
  assert.match(teks,/konsep pecahan sederhana/);
  for(const dikarang of ['keterampilan','terampil','mempraktikkan','mendemonstrasikan',
    'melaksanakan kegiatan'])
    assert.equal(teks.toLowerCase().includes(dikarang),false,
      `"${dikarang}" tidak boleh muncul: butirnya tidak memuat kompetensi keterampilan — ${teks}`);
  assert.match(teks,/telah memahami kompetensi tersebut dengan baik\.$/);
});

test('10. Multi Butir CP tercakup seluruhnya, masing-masing tepat sekali',()=>{
  const butir=[{teori:'konsep pecahan sederhana'},{teori:'operasi penjumlahan pecahan'},
    {teori:'penggunaan pecahan dalam kehidupan sehari-hari'}];
  const teks=composeIntracurricularButirDescription({studentName:'Budi',butir,
    jenis:'teori',predicate:'Sangat Baik'});
  for(const item of butir)
    assert.equal(teks.split(item.teori).length-1,1,`${item.teori} muncul tepat sekali — ${teks}`);
  /* Ringkas: tidak menempel seluruh teks CP berulang, dan tidak berbunyi ganda. */
  assert.equal(/memahami memahami|mampu mampu|\bdan\b.*\bdan\b.*\bdan\b/.test(teks),false,teks);
  assert.ok(teks.endsWith('.'),teks);
});

test('11. Tanpa Butir CP dipilih, penyusunan ditolak',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const mapel=mapelBerbutir(sesi,1)[0];
  const siswa=tambahSiswa(sesi);
  assert.throws(()=>composeIntracurricularDescriptionFromCp(sesi,{studentName:siswa.name,
    subjectId:mapel,butirIds:[],jenis:'teori',predicate:'Baik'}),new RegExp(PESAN_BUTIR_WAJIB));
  assert.throws(()=>previewAllIntracurricular(sesi,{subjectId:mapel,butirIds:[],
    jenis:'teori',predicate:'Baik'}),new RegExp(PESAN_BUTIR_WAJIB));
});

test('12. Butir CP nonaktif tidak dapat dipakai',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const mapel=mapelBerbutir(sesi,1)[0];
  const butir=butirPertama(sesi,mapel);
  const siswa=tambahSiswa(sesi);
  setCpButirActive(sesi,mapel,butir.id,false);
  assert.throws(()=>composeIntracurricularDescriptionFromCp(sesi,{studentName:siswa.name,
    subjectId:mapel,butirIds:[butir.id],jenis:'teori',predicate:'Baik'}),
    new RegExp(PESAN_BUTIR_WAJIB));
});

test('13. Tujuan Pembelajaran legacy tidak menjadi cadangan',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const mapel=mapelBerbutir(sesi,1)[0];
  const siswa=tambahSiswa(sesi);
  const tp=createLearningObjective(sesi,mapel,{code:'TP-LAMA',description:'memahami konsep lama.'});
  for(const item of listCpButir(sesi,mapel,{activeOnly:true}))setCpButirActive(sesi,mapel,item.id,false);
  assert.throws(()=>composeIntracurricularDescriptionFromCp(sesi,{studentName:siswa.name,
    subjectId:mapel,butirIds:[tp.id],jenis:'teori',predicate:'Baik'}),/Butir CP/i);
});

test('14. Isi Otomatis Semua Siswa mengikuti predikat masing-masing siswa',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const adwa=tambahSiswa(sesi,1,'Adwa');
  const budi=tambahSiswa(sesi,2,'Budi');
  const citra=tambahSiswa(sesi,3,'Citra');
  const mapel=mapelBerbutir(sesi,1,adwa)[0];
  const butir=butirPertama(sesi,mapel);
  const predicates={[adwa.id]:'Baik',[budi.id]:'Sangat Baik',[citra.id]:'Cukup'};

  /* Pratinjau: menyusun untuk seluruh murid TANPA menulis apa pun ke penyimpanan. */
  const pratinjau=previewAllIntracurricular(sesi,{subjectId:mapel,butirIds:[butir.id],
    jenis:'teori',predicate:'Baik',predicates});
  assert.equal(pratinjau.rows.length,3);
  assert.equal(getStudentIntracurricularSelection(sesi,adwa.id,mapel),null,
    'pratinjau belum menyimpan apa pun');

  const baris=Object.fromEntries(pratinjau.rows.map(row=>[row.studentId,row]));
  /* Predikat tiap murid diikuti apa adanya, tidak diseragamkan. */
  assert.equal(baris[adwa.id].predicate,'Baik');
  assert.equal(baris[budi.id].predicate,'Sangat Baik');
  assert.equal(baris[citra.id].predicate,'Cukup');
  assert.match(baris[budi.id].description,/sangat baik/);
  assert.match(baris[adwa.id].description,/telah memahami kompetensi tersebut dengan baik/);
  assert.match(baris[citra.id].description,/memerlukan penguatan/);
  assert.equal(new Set(pratinjau.rows.map(row=>row.description)).size,3,
    'tiga predikat berbeda menghasilkan tiga kalimat berbeda');
  /* Nama tiap murid ada pada deskripsinya sendiri. */
  for(const murid of [adwa,budi,citra])
    assert.ok(baris[murid.id].description.startsWith(`Ananda ${murid.name} `),
      baris[murid.id].description);

  /* Baru setelah Simpan Semua, hasilnya menjadi data. */
  const hasil=saveAllIntracurricular(sesi,{subjectId:mapel,rows:pratinjau.rows});
  assert.equal(hasil.tersimpan,3);
  assert.deepEqual(hasil.gagal,[]);
  for(const murid of [adwa,budi,citra])
    assert.equal(getStudentIntracurricularSelection(sesi,murid.id,mapel).predicate,
      predicates[murid.id],'predikat tiap murid tersimpan apa adanya');
});

test('15. Nama murid pada deskripsi selalu nama murid itu sendiri',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const mapel=mapelBerbutir(sesi,1)[0];
  const butir=butirPertama(sesi,mapel);
  const daftar=[tambahSiswa(sesi,1,'Adwa Nur'),tambahSiswa(sesi,2,'Budi Santoso'),
    tambahSiswa(sesi,3,'Citra Lestari')];
  for(const murid of daftar){
    const teks=composeIntracurricularDescriptionFromCp(sesi,{studentName:murid.name,
      subjectId:mapel,butirIds:[butir.id],jenis:'teori',predicate:'Baik'});
    assert.ok(teks.startsWith(`Ananda ${murid.name} `),teks);
    for(const lain of daftar)
      if(lain.id!==murid.id)
        assert.equal(teks.includes(lain.name),false,`nama ${lain.name} tidak boleh bocor`);
  }
});

/* ------------------------------------------ L. BARIS INTRAKURIKULER PADA RAPOR */

/* Menyiapkan satu murid dengan catatan Intrakurikuler pada beberapa mata pelajaran. */
function isiBeberapaMapel(sesi,studentId,daftarMapel){
  for(const mapel of daftarMapel){
    const butir=butirPertama(sesi,mapel);
    saveStudentIntracurricularSelection(sesi,studentId,{subjectId:mapel,butirIds:[butir.id],
      jenis:'teori',predicate:'Baik'});
  }
}
const mapelRapor=doc=>doc.intracurricular.map(row=>row.subjectId);

test('16. Tiga mapel punya catatan, hanya satu dinyatakan tampil: rapor memuat tepat satu',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,3,siswa);
  assert.equal(mapel.length,3,'tersedia tiga mapel berbutir CP untuk diuji');
  isiBeberapaMapel(sesi,siswa.id,mapel);
  assert.equal(getReportDocument(sesi,siswa.id).intracurricular.length,3,
    'menyimpan berarti mencentang, jadi ketiganya tampil lebih dulu');
  setIntracurricularVisibility(sesi,siswa.id,mapel[1],false);
  setIntracurricularVisibility(sesi,siswa.id,mapel[2],false);
  assert.deepEqual(mapelRapor(getReportDocument(sesi,siswa.id)),[mapel[0]]);
});

test('17. Tiga mapel dinyatakan tampil: rapor memuat tepat tiga',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,3,siswa);
  isiBeberapaMapel(sesi,siswa.id,mapel);
  assert.deepEqual([...mapelRapor(getReportDocument(sesi,siswa.id))].sort(),[...mapel].sort());
});

test('18. Mapel yang tidak pernah diisi tidak pernah muncul',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,3,siswa);
  isiBeberapaMapel(sesi,siswa.id,[mapel[0]]);
  const tampil=mapelRapor(getReportDocument(sesi,siswa.id));
  assert.deepEqual(tampil,[mapel[0]]);
  assert.equal(tampil.includes(mapel[1]),false);
  assert.equal(tampil.includes(mapel[2]),false);
});

test('19. Mapel yang centangnya dilepas tidak tampil lagi',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,2,siswa);
  isiBeberapaMapel(sesi,siswa.id,mapel);
  setIntracurricularVisibility(sesi,siswa.id,mapel[0],false);
  assert.deepEqual(mapelRapor(getReportDocument(sesi,siswa.id)),[mapel[1]]);
  /* Dicentang kembali: barisnya muncul lagi memakai catatan yang sama. */
  setIntracurricularVisibility(sesi,siswa.id,mapel[0],true);
  assert.deepEqual([...mapelRapor(getReportDocument(sesi,siswa.id))].sort(),[...mapel].sort());
});

test('20. Melepas centang tidak menghapus satu pun data akademik',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,2,siswa);
  isiBeberapaMapel(sesi,siswa.id,mapel);
  const sebelum=getStudentIntracurricularSelection(sesi,siswa.id,mapel[0]);
  const jumlahCatatan=Object.keys(loadDb().intracurricularScores).length;

  setIntracurricularVisibility(sesi,siswa.id,mapel[0],false);

  const sesudah=getStudentIntracurricularSelection(sesi,siswa.id,mapel[0]);
  assert.equal(Object.keys(loadDb().intracurricularScores).length,jumlahCatatan,
    'tidak ada catatan yang hilang');
  assert.equal(sesudah.description,sebelum.description);
  assert.equal(sesudah.predicate,sebelum.predicate);
  assert.deepEqual(sesudah.butirIds,sebelum.butirIds);
  assert.equal(sesudah.jenis,sebelum.jenis);
  assert.equal(sesudah.createdAt,sebelum.createdAt,'stempel pembuatan tidak diubah');
  assert.equal(sesudah.includeInReport,false,'hanya penandanya yang berubah');
});

test('21. Pilihan siswa A tidak memengaruhi siswa B',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const a=tambahSiswa(sesi,1,'Adwa');
  const b=tambahSiswa(sesi,2,'Budi');
  const mapel=mapelBerbutir(sesi,2,a);
  isiBeberapaMapel(sesi,a.id,mapel);
  isiBeberapaMapel(sesi,b.id,mapel);
  setIntracurricularVisibility(sesi,a.id,mapel[0],false);
  assert.deepEqual(mapelRapor(getReportDocument(sesi,a.id)),[mapel[1]]);
  assert.deepEqual([...mapelRapor(getReportDocument(sesi,b.id))].sort(),[...mapel].sort(),
    'rapor murid lain tidak ikut berubah');
});

test('22. Semester Ganjil tidak bocor ke Genap',()=>{
  useMemoryStorage();
  const ganjil=siapkan(KELAS,SEMESTER);
  const genap=siapkan(KELAS,`Genap ${ACADEMIC_YEAR}`);
  const muridGanjil=tambahSiswa(ganjil,1,'Adwa');
  const mapel=mapelBerbutir(ganjil,2,muridGanjil);
  const muridGenap=createStudent(genap,{classId:KELAS,nis:'5B-1',nisn:'8800000001',
    religion:'Islam',name:'Adwa',gender:'L',photo:'',id:muridGanjil.id});
  isiBeberapaMapel(ganjil,muridGanjil.id,mapel);
  assert.equal(getReportDocument(ganjil,muridGanjil.id).intracurricular.length,2);
  assert.equal(getReportDocument(genap,muridGenap.id).intracurricular.length,0,
    'semester Genap belum diisi sehingga rapornya kosong');
  setIntracurricularVisibility(ganjil,muridGanjil.id,mapel[0],false);
  assert.equal(getReportDocument(genap,muridGenap.id).intracurricular.length,0);
});

test('23. Rombel lain tidak terpengaruh',()=>{
  useMemoryStorage();
  const limaB=siapkan('5B');
  const limaC=siapkan('5C');
  const diB=tambahSiswa(limaB,1,'Adwa');
  const mapel=mapelBerbutir(limaB,2,diB);
  const diC=createStudent(limaC,{classId:'5C',nis:'5C-1',nisn:'8800000009',religion:'Islam',
    name:'Citra',gender:'P',photo:''});
  isiBeberapaMapel(limaB,diB.id,mapel);
  isiBeberapaMapel(limaC,diC.id,mapel);
  setIntracurricularVisibility(limaB,diB.id,mapel[0],false);
  assert.deepEqual(mapelRapor(getReportDocument(limaB,diB.id)),[mapel[1]]);
  assert.deepEqual([...mapelRapor(getReportDocument(limaC,diC.id))].sort(),[...mapel].sort());
});

test('24. Menyembunyikan satu subjectId tidak menyentuh subjectId lain',()=>{
  useMemoryStorage();
  const sesi=siapkan();
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,3,siswa);
  isiBeberapaMapel(sesi,siswa.id,mapel);
  setIntracurricularVisibility(sesi,siswa.id,mapel[1],false);
  assert.equal(getStudentIntracurricularSelection(sesi,siswa.id,mapel[0]).includeInReport,true);
  assert.equal(getStudentIntracurricularSelection(sesi,siswa.id,mapel[1]).includeInReport,false);
  assert.equal(getStudentIntracurricularSelection(sesi,siswa.id,mapel[2]).includeInReport,true);
});

test('25. Baris rapor tidak pernah disusun dari catatan terakhir atau seluruh mapel aktif',()=>{
  /* Penjaga akar masalah: baris Intrakurikuler harus lahir dari catatan yang memang dinyatakan
     tampil, bukan dari "mapel pernah punya record", "record terakhir", atau "seluruh mapel
     aktif/ditugaskan". Ketiganya diuji sekaligus di sini. */
  useMemoryStorage();
  const sesi=siapkan();
  const siswa=tambahSiswa(sesi);
  const mapel=mapelBerbutir(sesi,3,siswa);
  isiBeberapaMapel(sesi,siswa.id,mapel);
  for(const id of mapel)setIntracurricularVisibility(sesi,siswa.id,id,false);

  const doc=getReportDocument(sesi,siswa.id);
  assert.deepEqual(doc.intracurricular,[],
    'seluruhnya disembunyikan, jadi tidak ada satu baris pun - bukan jatuh ke record terakhir');
  /* Catatannya tetap ada: yang kosong hanyalah rapornya. */
  assert.equal(Object.keys(loadDb().intracurricularScores).length,3);
  /* Dan mapel aktif rombel ini jauh lebih banyak daripada tiga, sehingga seandainya renderer
     jatuh ke "seluruh mapel aktif", jumlahnya tidak akan nol. */
  assert.ok(SUBJECTS_DEFAULT.length>3);
});
