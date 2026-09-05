import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ASSESSMENT_TYPES, getAssessmentSettings, saveAllAssessmentSettings, saveAssessmentScores,
  saveAssessmentSettings } from '../src/services/assessment.js';
import { DEFAULT_REPORT_RUBRIC, normalizeReportRubric, REPORT_CATEGORIES,
  suggestReportRubricForKktp } from '../src/services/report-rubric.js';
import { ATTITUDE_DIMENSIONS, ATTITUDE_LEVELS, clearStudentAttitude, listStudentAttitudes,
  saveClassAttitudeBulk, saveStudentAttitude } from '../src/services/attitudes.js';
import { listCpButirForSemester } from '../src/services/cp-butir.js';
import { composeReportButirDescription, deskripsiBocorFase, deskripsiMengulangMapel,
  kalimatRapor, kategoriRapor, substansiButir } from '../src/services/cp-descriptions.js';
import { getStudentIntracurricular, listStudentIntracurricular,
  saveStudentIntracurricular } from '../src/services/completeness.js';
import { generateReportDescription, getReportDescription } from '../src/services/descriptions.js';
import { getReportDocument } from '../src/services/documents.js';
import { listIntracurricularButir, listIntracurricularSubjects, previewAllIntracurricular,
  saveAllIntracurricular, saveStudentIntracurricularSelection,
  getStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { intracurricularTable } from '../src/pages/print.js';
import { saveAllAutomaticReports } from '../src/services/report-bulk.js';
import { createStudent } from '../src/services/students.js';
import { listSubjectsForStudent } from '../src/services/subjects.js';
import { invalidateDbCache } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* INTRAKURIKULER PER MAPEL, NILAI SIKAP PERSIS PILIHAN GURU, DAN KATEGORI RAPOR TERHADAP KKTP.

   Tiga bug nyata dari APK yang dijaga suite ini:

     1. Guru menyimpan Intrakurikuler IPAS, tetapi rapor mencetak Pendidikan Pancasila beserta
        predikat dan deskripsinya. Dokumen rapor dulu membaca "catatan intrakurikuler murid"
        tanpa menyebut mata pelajaran, lalu memilih catatan lama atau catatan yang paling baru
        diperbarui. Menebak seperti itu tidak pernah benar.
     2. Guru mencentang tiga dari enam dimensi sikap, menekan Terapkan ke Semua Siswa lalu
        Simpan, dan keenam dimensi tersimpan. Pengisian massal dulu hanya menulis dimensi yang
        dipilih dan membiarkan sisanya - termasuk sisa pengisian lama - tetap hidup.
     3. Deskripsi rapor memakai ambang 90 yang sama untuk semua mata pelajaran, padahal setiap
        mata pelajaran menetapkan KKTP-nya sendiri.

   Seluruh pemeriksaan mapel di sini DINAMIS: daftarnya diambil dari konfigurasi aplikasi, bukan
   dari daftar nama yang ditulis tangan di dalam test. Menuliskan beberapa nama mapel untuk
   menutup bug berarti bug yang sama tetap terbuka bagi mapel yang tidak tertulis. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
/* "Muat ulang aplikasi": cache dibuang, isi localStorage dipertahankan apa adanya. */
function muatUlang(){invalidateDbCache();}

const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});

function aktifkanSemuaMapel(session){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
}
function tambahSiswa(session,index=1){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`7711${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:index%2?'L':'P',photo:''});
}
function nilaiPenuh(session,subjectId,studentId,nilai,kktp=75){
  saveAssessmentSettings(session,subjectId,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,subjectId,jenis.id,{[studentId]:nilai});
}
/* Butir CP aktif satu mata pelajaran. Sejak Intrakurikuler mewajibkan pilihan, setiap
   pemanggilan menyebut butir yang dinilai - tidak ada lagi "seluruh butir" yang tersirat. */
function butirMapel(session,subjectId,jumlah=1){
  return listCpButirForSemester(session,subjectId).slice(0,jumlah).map(item=>item.id);
}

/* Menetapkan rubrik satu mata pelajaran dari empat pasang batas, urut dari kategori tertinggi.
   Bobot dan KKTP yang sudah tersimpan tidak diubah. */
function aturRubrik(session,subjectId,batas){
  const lama=getAssessmentSettings(session,subjectId);
  saveAssessmentSettings(session,subjectId,{...lama,
    rubric:REPORT_CATEGORIES.map((category,index)=>
      ({category,min:batas[index][0],max:batas[index][1]}))});
}
/* Daftar mapel Intrakurikuler rombel - DIAMBIL DARI APLIKASI, bukan ditulis tangan.

   CATATAN PENTING setelah TP legacy dibuang: Intrakurikuler dan Deskripsi Rapor kini HANYA
   dapat disusun dari Butir CP aktif. Mata pelajaran yang katalog butirnya memang belum ada
   tidak lagi mendapat kalimat cadangan dari nama Elemen CP, sehingga test yang menyimpan
   Intrakurikuler memakai mapelBerButir - bukan seluruh mapel ber-CP.

   Dibatasi pada mapel yang benar-benar diampu murid itu (mapel agama mengikuti agama siswa),
   karena mapel itulah yang muncul pada rapornya. */
function mapelIntra(session,student){
  const milikSiswa=new Set(listSubjectsForStudent(session,student).map(item=>item.id));
  const daftar=listIntracurricularSubjects(session).filter(item=>milikSiswa.has(item.id));
  assert.ok(daftar.length>=3,'rombel uji harus punya beberapa mapel ber-CP');
  return daftar;
}
/* Mapel yang Butir CP-nya memang sudah tersedia pada semester berjalan. Mapel yang katalog
   butirnya belum ada tidak dipaksa punya - lebih baik tidak diuji daripada mengarang butir. */
function mapelBerButir(session,student){
  return mapelIntra(session,student).filter(item=>listCpButirForSemester(session,item.id).length>0);
}

/* ==================================================== §1-§2 ISOLASI INTRAKURIKULER PER MAPEL */

test('1. Setiap mata pelajaran menyimpan Intrakurikulernya sendiri, dan dibaca kembali sendiri',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);

  /* Satu murid, data BERBEDA untuk setiap subjectId. */
  const rencana=new Map();
  subjects.forEach((subject,index)=>{
    const butir=listIntracurricularButir(session,subject.id);
    const predikat=['Sangat Baik','Baik','Cukup'][index%3];
    const jenis=index%2?'praktik':'teori';
    const dipilih=butir.slice(0,1+(index%2)).map(item=>item.id);
    saveStudentIntracurricularSelection(session,siswa.id,
      {subjectId:subject.id,butirIds:dipilih,jenis,predicate:predikat});
    rencana.set(subject.id,{predikat,jenis,butirIds:dipilih});
  });

  muatUlang();
  for(const subject of subjects){
    const harapan=rencana.get(subject.id);
    const dibaca=getStudentIntracurricularSelection(session,siswa.id,subject.id);
    assert.ok(dibaca,`${subject.name} punya catatannya sendiri`);
    assert.equal(dibaca.subjectId,subject.id,`${subject.name} membawa subjectId-nya sendiri`);
    assert.equal(dibaca.activity,subject.name,`${subject.name} tidak tertukar nama mapel`);
    assert.equal(dibaca.predicate,harapan.predikat,`${subject.name} mempertahankan predikatnya`);
    assert.equal(dibaca.jenis,harapan.jenis,`${subject.name} mempertahankan jenis penilaiannya`);
    assert.deepEqual(dibaca.butirIds,harapan.butirIds,`${subject.name} mempertahankan butirnya`);
  }
  /* Satu catatan per mapel - tidak ada yang saling menimpa dan tidak ada yang berganda. */
  const semua=listStudentIntracurricular(session,siswa.id);
  assert.equal(semua.length,subjects.length,'satu catatan untuk setiap mapel');
  assert.equal(new Set(semua.map(item=>item.subjectId)).size,subjects.length,'subjectId-nya unik');
});

test('2. Kunci catatan memuat tahun, semester, kelas, mapel, dan siswa',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);
  for(const subject of subjects)
    saveStudentIntracurricularSelection(session,siswa.id,{subjectId:subject.id,butirIds:butirMapel(session,subject.id),predicate:'Baik'});
  const db=JSON.parse(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'));
  const kunci=Object.keys(db.intracurricularScores);
  assert.equal(kunci.length,subjects.length);
  for(const key of kunci){
    const bagian=key.split('|');
    assert.equal(bagian.length,5,`kunci ${key} memuat tahun|semester|kelas|mapel|siswa`);
    assert.equal(bagian[0],ACADEMIC_YEAR);
    assert.equal(bagian[1],session.semester);
    assert.equal(bagian[2],'5B');
    assert.ok(subjects.some(item=>item.id===bagian[3]),'bagian keempat adalah mapel');
    assert.equal(bagian[4],siswa.id,'bagian kelima adalah siswa');
  }
});

test('3. Menyunting satu mapel tidak mengubah mapel lain',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);
  for(const subject of subjects)
    saveStudentIntracurricularSelection(session,siswa.id,{subjectId:subject.id,butirIds:butirMapel(session,subject.id),predicate:'Baik'});

  /* Setiap mapel disunting satu per satu; setiap kali, SELURUH mapel lain diperiksa utuh. */
  for(const subject of subjects){
    const sebelum=new Map(subjects.filter(item=>item.id!==subject.id)
      .map(item=>[item.id,JSON.stringify(getStudentIntracurricularSelection(session,siswa.id,item.id))]));
    saveStudentIntracurricularSelection(session,siswa.id,
      {subjectId:subject.id,butirIds:butirMapel(session,subject.id),
        predicate:'Sangat Baik',description:`Sunting khusus ${subject.name}.`});
    assert.equal(getStudentIntracurricularSelection(session,siswa.id,subject.id).description,
      `Sunting khusus ${subject.name}.`);
    for(const [id,isi] of sebelum)
      assert.equal(JSON.stringify(getStudentIntracurricularSelection(session,siswa.id,id)),isi,
        `menyunting ${subject.name} tidak menyentuh ${id}`);
  }
});

test('4. Berpindah mapel bolak-balik tidak pernah menukar datanya',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);
  subjects.forEach((subject,index)=>{
    saveStudentIntracurricularSelection(session,siswa.id,{subjectId:subject.id,butirIds:butirMapel(session,subject.id),
      predicate:'Baik',description:`Deskripsi khas ${index}.`});
  });
  /* Menelusuri seluruh mapel maju lalu mundur, seperti guru yang mengganti pilihan mapel. */
  const urut=[...subjects,...[...subjects].reverse()];
  for(const subject of urut){
    const index=subjects.findIndex(item=>item.id===subject.id);
    assert.equal(getStudentIntracurricularSelection(session,siswa.id,subject.id).description,
      `Deskripsi khas ${index}.`,`${subject.name} tetap membawa deskripsinya sendiri`);
  }
});

test('5. Pembacaan tanpa subjectId tidak pernah menebak mata pelajaran',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);
  for(const subject of subjects)
    saveStudentIntracurricularSelection(session,siswa.id,{subjectId:subject.id,butirIds:butirMapel(session,subject.id),predicate:'Baik'});
  assert.equal(getStudentIntracurricular(session,siswa.id),null,
    'tanpa mapel tidak ada catatan per mapel yang dikembalikan');
  /* Dan sumbernya memang tidak lagi memuat penelusuran "catatan terakhir". */
  const sumber=read('src/services/completeness.js');
  const fungsi=sumber.slice(sumber.indexOf('export function getStudentIntracurricular('),
    sumber.indexOf('export function listStudentIntracurricular('));
  assert.equal(/sort\(/.test(fungsi),false,'tidak ada pengurutan untuk memilih catatan terbaru');
  assert.equal(/updatedAt/.test(fungsi),false,'tidak ada pemilihan berdasarkan waktu perubahan');
});

test('6. Catatan lama tanpa mapel tidak pernah dijadikan milik mapel mana pun',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);
  /* Bentuk lama: kegiatan bebas, tanpa subjectId sama sekali. */
  saveStudentIntracurricular(session,siswa.id,
    {activity:'Literasi Numerasi',predicate:'Baik',description:'Catatan versi lama.'});
  for(const subject of subjects)
    assert.equal(getStudentIntracurricularSelection(session,siswa.id,subject.id),null,
      `${subject.name} tidak mewarisi catatan lama tanpa mapel`);
  /* Tetapi catatan lamanya TIDAK dihapus dan tetap terbaca sebagai dirinya sendiri. */
  assert.equal(getStudentIntracurricular(session,siswa.id).description,'Catatan versi lama.');
});

test('7. Rapor mencetak baris Intrakurikuler untuk SETIAP mapel yang dinilai, tidak tertukar',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);
  for(const subject of subjects){
    nilaiPenuh(session,subject.id,siswa.id,85);
    saveStudentIntracurricularSelection(session,siswa.id,{subjectId:subject.id,butirIds:butirMapel(session,subject.id),
      predicate:'Baik',description:`Deskripsi intrakurikuler ${subject.name}.`});
  }
  const doc=getReportDocument(session,siswa.id);
  assert.ok(Array.isArray(doc.intracurricular),'dokumen membawa daftar, bukan satu catatan');
  assert.equal(doc.intracurricular.length,subjects.length);
  for(const subject of subjects){
    const baris=doc.intracurricular.find(item=>item.subjectId===subject.id);
    assert.ok(baris,`${subject.name} punya barisnya sendiri di rapor`);
    assert.equal(baris.activity,subject.name);
    assert.equal(baris.description,`Deskripsi intrakurikuler ${subject.name}.`);
  }
  const html=intracurricularTable(doc);
  for(const subject of subjects)
    /* Penyusun kalimat rapor menyapa murid ("Ananda ..."), sehingga huruf pertamanya turun.
       Yang diperiksa adalah isi deskripsinya benar-benar milik mapel itu. */
    assert.ok(html.includes(`eskripsi intrakurikuler ${subject.name}.`),
      `${subject.name} tercetak dengan deskripsinya sendiri`);
  assert.equal((html.match(/<td class="activity-no">/g)||[]).length,subjects.length);
});

test('8. Menyimpan satu mapel saja tidak memunculkan mapel lain di rapor',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const siswa=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,siswa);
  /* Diuji untuk SETIAP mapel, satu per satu, dari keadaan kosong. */
  for(const subject of subjects){
    useMemoryStorage();
    const sesi=guru('5B');
    aktifkanSemuaMapel(sesi);
    const anak=tambahSiswa(sesi,1);
    saveStudentIntracurricularSelection(sesi,anak.id,{subjectId:subject.id,butirIds:butirMapel(sesi,subject.id),predicate:'Sangat Baik'});
    const doc=getReportDocument(sesi,anak.id);
    assert.equal(doc.intracurricular.length,1,`hanya ${subject.name} yang tercetak`);
    assert.equal(doc.intracurricular[0].subjectId,subject.id);
    assert.equal(doc.intracurricular[0].activity,subject.name);
  }
  assert.ok(siswa&&subjects.length);
});

test('9. Ganjil dan Genap, serta rombel lain, tidak pernah saling membaca',()=>{
  useMemoryStorage();
  const ganjil=guru('5B',`Ganjil ${ACADEMIC_YEAR}`);
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  const lain=guru('5C');
  for(const sesi of [ganjil,genap,lain])aktifkanSemuaMapel(sesi);
  const anakGanjil=tambahSiswa(ganjil,1);
  const anakGenap=tambahSiswa(genap,2);
  const anakLain=tambahSiswa(lain,3);
  const subject=mapelBerButir(ganjil,anakGanjil)[0];
  saveStudentIntracurricularSelection(ganjil,anakGanjil.id,
    {subjectId:subject.id,butirIds:butirMapel(ganjil,subject.id),predicate:'Sangat Baik',description:'Ganjil.'});
  assert.equal(getStudentIntracurricularSelection(genap,anakGenap.id,subject.id),null,
    'Genap tidak membaca catatan Ganjil');
  assert.equal(getStudentIntracurricularSelection(lain,anakLain.id,subject.id),null,
    'rombel lain tidak membaca catatan rombel ini');
  saveStudentIntracurricularSelection(genap,anakGenap.id,
    {subjectId:subject.id,butirIds:butirMapel(genap,subject.id),predicate:'Cukup',description:'Genap.'});
  assert.equal(getStudentIntracurricularSelection(ganjil,anakGanjil.id,subject.id).description,'Ganjil.');
  assert.equal(getStudentIntracurricularSelection(genap,anakGenap.id,subject.id).description,'Genap.');
});

/* ================================================ §3 ALUR: ISI OTOMATIS, LALU SIMPAN SEMUA */

test('10. Isi Otomatis Semua Siswa menyusun hasil tanpa menyimpan apa pun',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const murid=[1,2,3].map(index=>tambahSiswa(session,index));
  const subject=mapelBerButir(session,murid[0])[0];
  const butir=listIntracurricularButir(session,subject.id).map(item=>item.id);

  const pratinjau=previewAllIntracurricular(session,
    {subjectId:subject.id,butirIds:butir,jenis:'teori',predicate:'Sangat Baik'});
  assert.equal(pratinjau.total,murid.length);
  assert.equal(pratinjau.rows.length,murid.length,'hasil tersusun untuk seluruh siswa');
  for(const row of pratinjau.rows)assert.ok(row.description,'setiap siswa mendapat deskripsi');

  /* TIDAK ADA satu pun tulisan ke penyimpanan. Termasuk sesudah muat ulang. */
  muatUlang();
  for(const anak of murid)
    assert.equal(getStudentIntracurricularSelection(session,anak.id,subject.id),null,
      'hasil yang belum disimpan tidak menjadi data');
  const db=JSON.parse(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'));
  assert.deepEqual(db.intracurricularScores,{},'koleksi Intrakurikuler masih kosong');
});

test('11. Simpan Semua menyimpan hasilnya, dan hasilnya bertahan setelah muat ulang',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const murid=[1,2,3].map(index=>tambahSiswa(session,index));
  const subject=mapelBerButir(session,murid[0])[0];
  const butir=listIntracurricularButir(session,subject.id).map(item=>item.id);
  const pratinjau=previewAllIntracurricular(session,
    {subjectId:subject.id,butirIds:butir,jenis:'praktik',predicate:'Baik'});
  const hasil=saveAllIntracurricular(session,{subjectId:subject.id,rows:pratinjau.rows});
  assert.equal(hasil.tersimpan,murid.length);
  assert.equal(hasil.gagal.length,0);
  muatUlang();
  for(const anak of murid){
    const dibaca=getStudentIntracurricularSelection(session,anak.id,subject.id);
    assert.ok(dibaca,'tersimpan dan terbaca setelah muat ulang');
    assert.equal(dibaca.subjectId,subject.id);
    assert.equal(dibaca.predicate,'Baik');
    assert.equal(dibaca.jenis,'praktik');
  }
});

test('12. Simpan Semua satu mapel tidak menyentuh catatan mapel lain',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const murid=[1,2].map(index=>tambahSiswa(session,index));
  const subjects=mapelBerButir(session,murid[0]);
  /* Seluruh mapel diisi lebih dulu. */
  for(const subject of subjects){
    const pratinjau=previewAllIntracurricular(session,{subjectId:subject.id,butirIds:butirMapel(session,subject.id),predicate:'Cukup'});
    saveAllIntracurricular(session,{subjectId:subject.id,rows:pratinjau.rows});
  }
  /* Lalu satu mapel diisi ulang, dan seluruh mapel lain diperiksa utuh - untuk SETIAP mapel. */
  for(const subject of subjects){
    const sebelum=new Map();
    for(const lain of subjects){
      if(lain.id===subject.id)continue;
      for(const anak of murid)
        sebelum.set(`${lain.id}|${anak.id}`,
          JSON.stringify(getStudentIntracurricularSelection(session,anak.id,lain.id)));
    }
    /* Predikat murid yang sudah tercatat kini dipertahankan, jadi perubahan predikat massal
       dinyatakan lewat `predicates` - bukan diam-diam menimpa penilaian guru. */
    const pratinjau=previewAllIntracurricular(session,
      {subjectId:subject.id,butirIds:butirMapel(session,subject.id),predicate:'Sangat Baik',overwriteManual:true,
        predicates:Object.fromEntries(murid.map(anak=>[anak.id,'Sangat Baik']))});
    saveAllIntracurricular(session,{subjectId:subject.id,rows:pratinjau.rows});
    for(const anak of murid)
      assert.equal(getStudentIntracurricularSelection(session,anak.id,subject.id).predicate,'Sangat Baik');
    for(const [kunci,isi] of sebelum){
      const [mapel,studentId]=kunci.split('|');
      assert.equal(JSON.stringify(getStudentIntracurricularSelection(session,studentId,mapel)),isi,
        `Simpan Semua ${subject.name} tidak mengubah ${mapel}`);
    }
  }
});

test('13. Halaman Intrakurikuler hanya punya Isi Otomatis Semua Siswa dan Simpan Semua',()=>{
  const halaman=read('src/pages/intracurricular-input.js');
  const alurCp=halaman.slice(halaman.indexOf('function drawSubjectFlow('),
    halaman.indexOf('function drawLegacyFlow('));
  assert.equal(/Simpan Siswa Ini/.test(alurCp),false,'tombol Simpan Siswa Ini sudah tidak ada');
  assert.match(alurCp,/data-fill-all/,'tombol Isi Otomatis Semua Siswa tetap ada');
  assert.match(alurCp,/Isi Otomatis Semua Siswa/);
  assert.match(alurCp,/data-save-all/,'tombol Simpan Semua tersedia');
  assert.match(alurCp,/Simpan Semua/);
  /* Isi Otomatis memanggil penyusun tanpa penyimpanan; hanya Simpan Semua yang menulis. */
  assert.match(alurCp,/previewAllIntracurricular\(/);
  assert.match(alurCp,/saveAllIntracurricular\(/);
  assert.equal(/saveStudentIntracurricularSelection\(/.test(alurCp),false,
    'alur CP tidak lagi menyimpan satu siswa langsung dari formulir');
  /* Dan layanannya benar-benar tidak menulis pada tahap pratinjau. */
  const layanan=read('src/services/intracurricular.js');
  const fungsi=layanan.slice(layanan.indexOf('export function previewAllIntracurricular('),
    layanan.indexOf('export function saveAllIntracurricular('));
  assert.equal(/saveStudentIntracurricular/.test(fungsi),false,'pratinjau tidak menyimpan');
  assert.equal(/updateDb\(/.test(fungsi),false,'pratinjau tidak menyentuh penyimpanan');
});

/* ============================================================ §4 NILAI SIKAP PERSIS PILIHAN */

function sikapTerisi(session,studentId){
  return listStudentAttitudes(session,studentId).filter(item=>item.status!=='EMPTY');
}

test('14. Mencentang tiga dari enam dimensi menyimpan tepat tiga dimensi itu',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const murid=[1,2,3].map(index=>tambahSiswa(session,index));
  const dipilih=[ATTITUDE_DIMENSIONS[0].id,ATTITUDE_DIMENSIONS[2].id,ATTITUDE_DIMENSIONS[4].id];
  saveClassAttitudeBulk(session,dipilih,ATTITUDE_LEVELS[0]);
  for(const anak of murid){
    const terisi=sikapTerisi(session,anak.id);
    assert.equal(terisi.length,3,'tepat tiga dimensi tersimpan');
    assert.deepEqual(terisi.map(item=>item.dimensionId).sort(),[...dipilih].sort(),
      'yang tersimpan persis yang dicentang');
    for(const item of terisi)assert.equal(item.level,ATTITUDE_LEVELS[0]);
  }
  /* Dan bertahan setelah muat ulang. */
  muatUlang();
  for(const anak of murid)
    assert.deepEqual(sikapTerisi(session,anak.id).map(item=>item.dimensionId).sort(),
      [...dipilih].sort(),'tetap tiga setelah muat ulang');
});

test('15. Enam dimensi yang pernah terisi tidak lagi ikut ketika guru memilih tiga',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const murid=[1,2].map(index=>tambahSiswa(session,index));
  /* Keadaan dari versi lama: keenam dimensi terisi. */
  saveClassAttitudeBulk(session,ATTITUDE_DIMENSIONS.map(item=>item.id),ATTITUDE_LEVELS[1]);
  for(const anak of murid)assert.equal(sikapTerisi(session,anak.id).length,6);
  /* Guru sekarang memilih tiga. */
  const dipilih=[ATTITUDE_DIMENSIONS[1].id,ATTITUDE_DIMENSIONS[3].id,ATTITUDE_DIMENSIONS[5].id];
  saveClassAttitudeBulk(session,dipilih,ATTITUDE_LEVELS[0]);
  muatUlang();
  for(const anak of murid){
    const terisi=sikapTerisi(session,anak.id);
    assert.equal(terisi.length,3,'sisa pengisian lama tidak ikut tersimpan');
    assert.deepEqual(terisi.map(item=>item.dimensionId).sort(),[...dipilih].sort());
  }
});

test('16. Satu dimensi menghasilkan satu, dan enam dimensi menghasilkan enam',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const anak=tambahSiswa(session,1);
  for(const jumlah of [1,2,3,4,5,6]){
    const dipilih=ATTITUDE_DIMENSIONS.slice(0,jumlah).map(item=>item.id);
    saveClassAttitudeBulk(session,dipilih,ATTITUDE_LEVELS[jumlah%ATTITUDE_LEVELS.length]);
    const terisi=sikapTerisi(session,anak.id);
    assert.equal(terisi.length,jumlah,`${jumlah} dicentang menghasilkan ${jumlah} tersimpan`);
    assert.deepEqual(terisi.map(item=>item.dimensionId).sort(),[...dipilih].sort());
  }
});

test('17. Rapor hanya memuat dimensi sikap yang benar-benar dipilih guru',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  saveClassAttitudeBulk(session,ATTITUDE_DIMENSIONS.map(item=>item.id),ATTITUDE_LEVELS[1]);
  const dipilih=[ATTITUDE_DIMENSIONS[0].id,ATTITUDE_DIMENSIONS[3].id,ATTITUDE_DIMENSIONS[4].id];
  saveClassAttitudeBulk(session,dipilih,ATTITUDE_LEVELS[0]);
  const doc=getReportDocument(session,anak.id);
  assert.equal(doc.attitudes.length,3,'rapor memuat tiga dimensi');
  assert.deepEqual(doc.attitudes.map(item=>item.dimensionId).sort(),[...dipilih].sort());
});

test('18. Mengembalikan satu dimensi ke Tidak diisi benar-benar mengosongkannya',()=>{
  useMemoryStorage();
  const session=guru('5B');
  const anak=tambahSiswa(session,1);
  const dimensi=ATTITUDE_DIMENSIONS[2].id;
  saveStudentAttitude(session,anak.id,dimensi,{level:ATTITUDE_LEVELS[0]});
  assert.equal(sikapTerisi(session,anak.id).length,1);
  assert.equal(clearStudentAttitude(session,anak.id,dimensi),true);
  muatUlang();
  assert.equal(sikapTerisi(session,anak.id).length,0,'catatannya dihapus, bukan disimpan kosong');
  assert.equal(clearStudentAttitude(session,anak.id,dimensi),false,'mengosongkan dua kali aman');
  assert.throws(()=>clearStudentAttitude(session,anak.id,'bukan-dimensi'),/tidak valid/i);
  /* Dan halaman memang memanggilnya ketika capaian dikosongkan. */
  const halaman=read('src/pages/attitudes.js');
  assert.match(halaman,/clearStudentAttitude\(session,studentId,row\.dataset\.dimension\)/);
});

test('19. Nilai Sikap rombel dan semester lain tidak tersentuh oleh pengisian massal',()=>{
  useMemoryStorage();
  const ganjil=guru('5B',`Ganjil ${ACADEMIC_YEAR}`);
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  const lain=guru('5C');
  const anakGanjil=tambahSiswa(ganjil,1);
  const anakGenap=tambahSiswa(genap,2);
  const anakLain=tambahSiswa(lain,3);
  saveClassAttitudeBulk(genap,ATTITUDE_DIMENSIONS.map(item=>item.id),ATTITUDE_LEVELS[1]);
  saveClassAttitudeBulk(lain,ATTITUDE_DIMENSIONS.map(item=>item.id),ATTITUDE_LEVELS[1]);
  /* Rombel dan semester berjalan diisi tiga dimensi saja. */
  saveClassAttitudeBulk(ganjil,[ATTITUDE_DIMENSIONS[0].id,ATTITUDE_DIMENSIONS[1].id,
    ATTITUDE_DIMENSIONS[2].id],ATTITUDE_LEVELS[0]);
  assert.equal(sikapTerisi(ganjil,anakGanjil.id).length,3);
  assert.equal(sikapTerisi(genap,anakGenap.id).length,6,'semester lain utuh');
  assert.equal(sikapTerisi(lain,anakLain.id).length,6,'rombel lain utuh');
});

/* ================================================= §5-§7 KATEGORI RAPOR TERHADAP KKTP MAPEL */

test('20. Empat kategori ditentukan oleh RENTANG RUBRIK, bukan oleh rumus turunan KKTP',()=>{
  /* Rubrik default aplikasi: 90-100 / 80-89 / 70-79 / 0-69. */
  const bawaan=DEFAULT_REPORT_RUBRIC;
  assert.equal(kategoriRapor(100,bawaan),'SANGAT BAIK');
  assert.equal(kategoriRapor(90,bawaan),'SANGAT BAIK','tepat batas bawah SANGAT BAIK');
  assert.equal(kategoriRapor(89,bawaan),'BAIK','satu angka di bawah batas');
  assert.equal(kategoriRapor(80,bawaan),'BAIK','tepat batas bawah BAIK');
  assert.equal(kategoriRapor(79,bawaan),'CUKUP');
  assert.equal(kategoriRapor(70,bawaan),'CUKUP','tepat batas bawah CUKUP');
  assert.equal(kategoriRapor(69,bawaan),'PERLU BIMBINGAN');
  assert.equal(kategoriRapor(0,bawaan),'PERLU BIMBINGAN','nilai 0');

  /* Rubrik pilihan guru: batasnya berubah, kategorinya ikut berubah. */
  const custom=normalizeReportRubric([{category:'SANGAT BAIK',min:85,max:100},
    {category:'BAIK',min:70,max:84},{category:'CUKUP',min:55,max:69},
    {category:'PERLU BIMBINGAN',min:0,max:54}]);
  assert.equal(kategoriRapor(85,custom),'SANGAT BAIK');
  assert.equal(kategoriRapor(84,custom),'BAIK');
  assert.equal(kategoriRapor(70,custom),'BAIK');
  assert.equal(kategoriRapor(69,custom),'CUKUP');
  assert.equal(kategoriRapor(55,custom),'CUKUP');
  assert.equal(kategoriRapor(54,custom),'PERLU BIMBINGAN');
  /* Nilai yang sama, rubrik berbeda, kategori berbeda - inilah inti perubahannya. */
  assert.equal(kategoriRapor(84,bawaan),'BAIK');
  assert.equal(kategoriRapor(84,custom),'BAIK');
  assert.equal(kategoriRapor(88,bawaan),'BAIK');
  assert.equal(kategoriRapor(88,custom),'SANGAT BAIK');

  /* Tanpa Nilai Akhir tidak ada kategori yang dikarang. */
  assert.equal(kategoriRapor(null,bawaan),null);
  assert.equal(kategoriRapor(undefined,bawaan),null);
  /* Rubrik yang belum ada dibaca sebagai default, bukan menggagalkan penyusunan kalimat. */
  assert.equal(kategoriRapor(95,null),'SANGAT BAIK');
});

test('20b. Setiap nilai 0 sampai 100 masuk TEPAT SATU kategori',()=>{
  const rubrik=[DEFAULT_REPORT_RUBRIC,
    normalizeReportRubric([{category:'SANGAT BAIK',min:96,max:100},{category:'BAIK',min:61,max:95},
      {category:'CUKUP',min:41,max:60},{category:'PERLU BIMBINGAN',min:0,max:40}]),
    normalizeReportRubric([{category:'SANGAT BAIK',min:100,max:100},{category:'BAIK',min:99,max:99},
      {category:'CUKUP',min:98,max:98},{category:'PERLU BIMBINGAN',min:0,max:97}])];
  for(const rubric of rubrik){
    for(let nilai=0;nilai<=100;nilai+=1){
      const cocok=rubric.filter(item=>nilai>=item.min&&nilai<=item.max);
      assert.equal(cocok.length,1,`nilai ${nilai} masuk tepat satu rentang`);
      assert.equal(kategoriRapor(nilai,rubric),cocok[0].category,`nilai ${nilai} digolongkan sesuai rentangnya`);
    }
  }
});

test('20c. Rubrik yang tidak sah ditolak beserta alasannya',()=>{
  const susun=(...batas)=>REPORT_CATEGORIES.map((category,index)=>({category,...batas[index]}));
  /* Tumpang tindih: 80 masuk BAIK sekaligus CUKUP. */
  assert.throws(()=>normalizeReportRubric(susun({min:90,max:100},{min:80,max:89},{min:75,max:80},{min:0,max:74})),
    /tumpang tindih/i);
  /* Celah: 75 sampai 79 tidak masuk kategori mana pun. */
  assert.throws(()=>normalizeReportRubric(susun({min:90,max:100},{min:80,max:89},{min:70,max:74},{min:0,max:69})),
    /celah/i);
  /* Batas bawah melebihi batas atas. */
  assert.throws(()=>normalizeReportRubric(susun({min:100,max:90},{min:80,max:89},{min:70,max:79},{min:0,max:69})),
    /tidak boleh melebihi/i);
  /* Di luar 0-100. */
  assert.throws(()=>normalizeReportRubric(susun({min:90,max:120},{min:80,max:89},{min:70,max:79},{min:0,max:69})),
    /0 sampai 100/i);
  assert.throws(()=>normalizeReportRubric(susun({min:90,max:100},{min:80,max:89},{min:70,max:79},{min:-5,max:69})),
    /0 sampai 100/i);
  /* Tidak menutup 0, dan tidak menutup 100. */
  assert.throws(()=>normalizeReportRubric(susun({min:90,max:100},{min:80,max:89},{min:70,max:79},{min:10,max:69})),
    /dimulai dari 0/i);
  assert.throws(()=>normalizeReportRubric(susun({min:90,max:95},{min:80,max:89},{min:70,max:79},{min:0,max:69})),
    /berakhir pada 100/i);
  /* Kategori kurang, berulang, atau tidak dikenal. */
  assert.throws(()=>normalizeReportRubric([{category:'BAIK',min:0,max:100}]),/empat kategori|4 kategori/i);
  assert.throws(()=>normalizeReportRubric([{category:'BAIK',min:90,max:100},{category:'BAIK',min:80,max:89},
    {category:'CUKUP',min:70,max:79},{category:'PERLU BIMBINGAN',min:0,max:69}]),/satu kali/i);
  assert.throws(()=>normalizeReportRubric([{category:'ISTIMEWA',min:90,max:100},{category:'BAIK',min:80,max:89},
    {category:'CUKUP',min:70,max:79},{category:'PERLU BIMBINGAN',min:0,max:69}]),/tidak dikenal/i);
  /* Batas wajib bilangan bulat supaya tidak ada celah pecahan yang tak terlihat. */
  assert.throws(()=>normalizeReportRubric(susun({min:89.5,max:100},{min:80,max:89},{min:70,max:79},{min:0,max:69})),
    /bilangan bulat/i);
  /* Yang sah dikembalikan urut dari kategori tertinggi. */
  const sah=normalizeReportRubric(susun({min:90,max:100},{min:80,max:89},{min:70,max:79},{min:0,max:69}));
  assert.deepEqual(sah.map(item=>item.category),[...REPORT_CATEGORIES]);
});

test('21. Kalimat rapor memakai empat rujukan final dan menyapa murid',()=>{
  const fokus='menganalisis pelaksanaan kewajiban, hak, dan tanggung jawab sebagai warga negara';
  const nama='Adwa Habibi Rizky';
  /* EMPAT RUJUKAN FINAL, seluruhnya dibuka dengan nama murid. */
  assert.equal(kalimatRapor('SANGAT BAIK',fokus,nama),
    `Ananda ${nama} menunjukkan capaian penguasaan yang sangat baik dalam ${fokus}.`);
  assert.equal(kalimatRapor('BAIK',fokus,nama),
    `Ananda ${nama} menunjukkan capaian yang baik dalam ${fokus}.`);
  assert.equal(kalimatRapor('CUKUP',fokus,nama),
    `Ananda ${nama} telah menunjukkan capaian pemahaman yang cukup mengenai ${fokus}.`);
  assert.equal(kalimatRapor('PERLU BIMBINGAN',fokus,nama),
    `Ananda ${nama} perlu meningkatkan pemahaman mengenai ${fokus} melalui pendampingan dan latihan lebih lanjut.`);
  assert.equal(kalimatRapor(null,fokus,nama),
    `Ananda ${nama} menempuh pembelajaran pada kompetensi ${fokus}.`);
  assert.equal(kalimatRapor('BAIK','',nama),null,'tanpa kompetensi tidak ada kalimat');
  assert.equal(kalimatRapor('BAIK',fokus,''),null,'tanpa nama murid tidak ada kalimat');

  /* TRANSFORMASI GRAMATIKAL: frasa benda diberi kata kerja setelah "dalam", dan frasa yang
     SUDAH dibuka kata kerja tidak diberi kata kerja kedua. */
  const benda='bilangan cacah sampai 1.000.000 beserta nilai tempatnya';
  assert.equal(kalimatRapor('BAIK',benda,nama),
    `Ananda ${nama} menunjukkan capaian yang baik dalam memahami ${benda}.`);
  assert.equal(kalimatRapor('CUKUP',benda,nama),
    `Ananda ${nama} telah menunjukkan capaian pemahaman yang cukup mengenai ${benda}.`,
    'setelah "mengenai" tidak pernah disisipkan kata kerja');
  const kerja='menganalisis hubungan antarmakhluk hidup';
  assert.equal(kalimatRapor('BAIK',kerja,nama),
    `Ananda ${nama} menunjukkan capaian yang baik dalam ${kerja}.`,
    'frasa yang sudah berkata kerja tidak diberi kata kerja kedua');
  for(const kategori of ['SANGAT BAIK','BAIK','CUKUP','PERLU BIMBINGAN']){
    for(const teks of [benda,kerja]){
      const kalimat=kalimatRapor(kategori,teks,nama);
      assert.equal(/memahami memahami|mengenai memahami|dalam memahami memahami/.test(kalimat),false,
        `${kategori}: tidak ada pengulangan kata kerja`);
    }
  }
});

test('22. Tidak ada ambang apa pun yang ditulis di jalur kategori rapor',()=>{
  const sumber=read('src/services/cp-descriptions.js');
  /* Rumus turunan KKTP dibuang seluruhnya. */
  for(const nama of ['SELISIH_SANGAT_BAIK','SELISIH_CUKUP','KKTP_BAWAAN','tingkatAkademik'])
    assert.equal(sumber.includes(nama),false,`${nama} tidak boleh ada lagi`);
  const blok=sumber.slice(sumber.indexOf('export function kategoriRapor('),
    sumber.indexOf('export function composeReportCpDescription('));
  const kode=blok.split('\n').filter(baris=>!/^\s*(\/\*|\*|\/\/)/.test(baris)).join('\n');
  for(const angka of ['90','80','75','70','65','15','10'])
    assert.equal(new RegExp(`\\b${angka}\\b`).test(kode),false,
      `angka ${angka} tidak boleh ditulis sebagai ambang`);
  /* Kategori sepenuhnya dibaca dari rubrik. */
  assert.match(sumber,/categoryForScore\(finalScore,rubric\)/);
  assert.equal(/kktp/i.test(kode),false,'kategori tidak lagi dihitung dari KKTP');
  /* Dan jalur pembaca pengaturan tidak memakai angka bawaan. */
  const layanan=read('src/services/descriptions.js');
  assert.equal(/\?\?\s*75/.test(layanan),false,'KKTP tidak pernah jatuh ke angka tetap');
  assert.match(layanan,/rubric/,'deskripsi rapor membaca rubrik mata pelajaran');
});

test('23. Deskripsi rapor mengikuti rubrik mata pelajarannya sendiri',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,anak);
  const longgar=subjects[0],ketat=subjects[1];
  /* Nilai Akhir yang SAMA, rubrik yang berbeda, karena itu kategori yang berbeda. */
  nilaiPenuh(session,longgar.id,anak.id,80,75);
  nilaiPenuh(session,ketat.id,anak.id,80,75);
  aturRubrik(session,longgar.id,[[75,100],[60,74],[45,59],[0,44]]);
  aturRubrik(session,ketat.id,[[95,100],[85,94],[75,84],[0,74]]);
  assert.match(generateReportDescription(session,longgar.id,anak.id,{}).text,
    /^Ananda .+ menunjukkan capaian penguasaan yang sangat baik dalam /,'80 pada rubrik longgar');
  assert.match(generateReportDescription(session,ketat.id,anak.id,{}).text,
    /^Ananda .+ telah menunjukkan capaian pemahaman yang cukup mengenai /,'80 pada rubrik ketat');
  /* KKTP kedua mapel tidak tersentuh oleh perubahan rubrik. */
  assert.equal(getAssessmentSettings(session,longgar.id).kktp,75);
  assert.equal(getAssessmentSettings(session,ketat.id).kktp,75);
});

test('24. Empat kategori benar-benar muncul pada deskripsi rapor yang tersusun',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  aturRubrik(session,subject.id,[[88,100],[72,87],[56,71],[0,55]]);
  const harapan=[[100,'SANGAT BAIK'],[88,'SANGAT BAIK'],[87,'BAIK'],[72,'BAIK'],
    [71,'CUKUP'],[56,'CUKUP'],[55,'PERLU BIMBINGAN'],[0,'PERLU BIMBINGAN']];
  for(const [nilai,kategori] of harapan){
    nilaiPenuh(session,subject.id,anak.id,nilai,75);
    const teks=generateReportDescription(session,subject.id,anak.id).text;
    assert.equal(teks.startsWith(AWALAN_KATEGORI[kategori](anak.name)),true,
      `nilai ${nilai} pada rubrik 88/72/56 -> ${kategori}: ${teks}`);
  }
});

test('25. Kompetensi rapor berasal dari Butir CP mapel itu, untuk SETIAP mapel',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,anak);
  assert.ok(subjects.length>=3,'beberapa mapel sudah punya Butir CP');
  const kalimat=new Map();
  for(const subject of subjects){
    nilaiPenuh(session,subject.id,anak.id,88,75);
    const hasil=generateReportDescription(session,subject.id,anak.id,{});
    const butir=listCpButirForSemester(session,subject.id);
    assert.ok(hasil.text.includes(substansiButir(butir[0],'teori')),
      `${subject.name} memakai Butir CP-nya sendiri`);
    assert.equal(deskripsiBocorFase(hasil.text),false,`${subject.name}: bebas Fase, kode CP, dan TP`);
    assert.equal(deskripsiMengulangMapel(hasil.text,subject.name),false,
      `${subject.name}: nama mapel tidak ikut ke kalimat`);
    assert.equal(/mata pelajaran/i.test(hasil.text),false);
    kalimat.set(subject.id,hasil.text);
  }
  /* Tidak ada dua mapel yang berbagi kalimat yang sama. */
  assert.equal(new Set(kalimat.values()).size,subjects.length,
    'setiap mapel menghasilkan kalimat kompetensinya sendiri');
});

test('26. Deskripsi rapor tidak pernah sama dengan deskripsi Intrakurikuler',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  for(const subject of mapelBerButir(session,anak)){
    nilaiPenuh(session,subject.id,anak.id,92,75);
    const butir=listIntracurricularButir(session,subject.id).map(item=>item.id);
    const intra=saveStudentIntracurricularSelection(session,anak.id,
      {subjectId:subject.id,butirIds:butir,jenis:'teori',predicate:'Sangat Baik'});
    const rapor=generateReportDescription(session,subject.id,anak.id,{});
    assert.notEqual(intra.description,rapor.text,`${subject.name}: dua konteks, dua kalimat`);
    assert.match(rapor.text,/^Ananda .+ (menunjukkan capaian|telah menunjukkan capaian|perlu meningkatkan pemahaman|menempuh pembelajaran) /);
    assert.equal(/menunjukkan capaian|telah menunjukkan capaian pemahaman/.test(intra.description),
      false,`${subject.name}: Intrakurikuler tidak memakai bingkai rapor`);
  }
});

test('27. composeReportButirDescription memakai rubrik yang dikirim, bukan ambang bawaan',()=>{
  const butir=[{teori:'menganalisis pelaksanaan kewajiban warga negara'}];
  const nama='Siswa 1';
  const rubrik=nilai=>normalizeReportRubric([{category:'SANGAT BAIK',min:nilai,max:100},
    {category:'BAIK',min:nilai-10,max:nilai-1},{category:'CUKUP',min:nilai-20,max:nilai-11},
    {category:'PERLU BIMBINGAN',min:0,max:nilai-21}]);
  const susun=(finalScore,kktp)=>composeReportButirDescription({studentName:nama,butir,finalScore,rubric:rubrik(kktp)});
  assert.equal(susun(80,75),
    `Ananda ${nama} menunjukkan capaian penguasaan yang sangat baik dalam menganalisis pelaksanaan kewajiban warga negara.`);
  assert.equal(susun(80,85),
    `Ananda ${nama} menunjukkan capaian yang baik dalam menganalisis pelaksanaan kewajiban warga negara.`);
  assert.equal(susun(80,95),
    `Ananda ${nama} telah menunjukkan capaian pemahaman yang cukup mengenai menganalisis pelaksanaan kewajiban warga negara.`);
  assert.equal(susun(60,95),
    `Ananda ${nama} perlu meningkatkan pemahaman mengenai menganalisis pelaksanaan kewajiban warga negara melalui pendampingan dan latihan lebih lanjut.`);
  /* Tanpa Nilai Akhir, kategori tidak dikarang. */
  assert.match(composeReportButirDescription({studentName:nama,butir,finalScore:null,rubric:DEFAULT_REPORT_RUBRIC}),
    /^Ananda .+ menempuh pembelajaran /);
  assert.equal(composeReportButirDescription({studentName:nama,butir:[],finalScore:80,rubric:DEFAULT_REPORT_RUBRIC}),null);
  assert.equal(composeReportButirDescription({studentName:'',butir,finalScore:80,rubric:DEFAULT_REPORT_RUBRIC}),null,
    'tanpa nama murid tidak ada kalimat');
});

/* ============================== §8 GENERATE SEMUA SISWA DAN SIMPAN OTOMATIS SEMUA MAPEL */

/* Empat rujukan final, dinyatakan sebagai awalan kalimat lengkap beserta nama murid. */
const AWALAN_KATEGORI=Object.freeze({
  'SANGAT BAIK':nama=>`Ananda ${nama} menunjukkan capaian penguasaan yang sangat baik dalam `,
  'BAIK':nama=>`Ananda ${nama} menunjukkan capaian yang baik dalam `,
  'CUKUP':nama=>`Ananda ${nama} telah menunjukkan capaian pemahaman yang cukup mengenai `,
  'PERLU BIMBINGAN':nama=>`Ananda ${nama} perlu meningkatkan pemahaman mengenai `,
});

test('28. Simpan Otomatis Semua Mapel memakai rubrik dan Butir CP masing-masing mapel',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const murid=[1,2].map(index=>tambahSiswa(session,index));
  const subjects=mapelBerButir(session,murid[0]);
  /* Setiap mapel diberi RUBRIK yang berbeda, dengan Nilai Akhir yang sama persis. Kategori yang
     berbeda karena itu hanya dapat lahir dari rubrik mapel masing-masing. */
  const rubrikMapel=new Map();
  const pilihan=[[[70,100],[55,69],[40,54],[0,39]],[[95,100],[85,94],[75,84],[0,74]],
    [[81,100],[80,80],[60,79],[0,59]],[[90,100],[80,89],[70,79],[0,69]]];
  subjects.forEach((subject,index)=>{
    const batas=pilihan[index%pilihan.length];
    rubrikMapel.set(subject.id,batas);
    for(const anak of murid)nilaiPenuh(session,subject.id,anak.id,80,75);
    aturRubrik(session,subject.id,batas);
  });
  const hasil=saveAllAutomaticReports(session,{overwriteEdited:true});
  assert.equal(hasil.errors.length,0,'tidak ada mapel yang gagal');
  for(const subject of subjects){
    const batas=rubrikMapel.get(subject.id);
    const rubric=REPORT_CATEGORIES.map((category,index)=>
      ({category,min:batas[index][0],max:batas[index][1]}));
    const harapan=kategoriRapor(80,rubric);
    const butir=listCpButirForSemester(session,subject.id);
    for(const anak of murid){
      const catatan=getReportDescription(session,subject.id,anak.id);
      assert.ok(catatan,`${subject.name} punya deskripsi tersimpan`);
      assert.equal(catatan.text.startsWith(AWALAN_KATEGORI[harapan](anak.name)),true,
        `${subject.name} memakai kategori ${harapan} menurut rubriknya sendiri: ${catatan.text}`);
      assert.ok(catatan.text.includes(substansiButir(butir[0],'teori')),
        `${subject.name} memakai kompetensinya sendiri`);
    }
    /* Rubrik yang tersimpan memang milik mapel itu, pada scope tahun|semester|kelas|mapel. */
    assert.deepEqual(getAssessmentSettings(session,subject.id).rubric,rubric);
  }
  /* Empat rubrik berbeda menghasilkan lebih dari satu kategori untuk Nilai Akhir yang sama. */
  const kategori=new Set(subjects.map(subject=>{
    const batas=rubrikMapel.get(subject.id);
    return kategoriRapor(80,REPORT_CATEGORIES.map((category,index)=>
      ({category,min:batas[index][0],max:batas[index][1]})));
  }));
  assert.ok(kategori.size>=2,'rubrik yang berbeda benar-benar menghasilkan kategori yang berbeda');
});

test('28b. Generate Deskripsi berikutnya memakai rubrik terbaru',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  nilaiPenuh(session,subject.id,anak.id,80,75);
  aturRubrik(session,subject.id,[[90,100],[80,89],[70,79],[0,69]]);
  saveAllAutomaticReports(session,{overwriteEdited:true});
  assert.match(getReportDescription(session,subject.id,anak.id).text,
    /^Ananda .+ menunjukkan capaian yang baik dalam /);
  /* Rubrik diubah guru; deskripsi LAMA tidak dihapus, dan Generate berikutnya memakai yang baru. */
  aturRubrik(session,subject.id,[[75,100],[60,74],[45,59],[0,44]]);
  assert.match(getReportDescription(session,subject.id,anak.id).text,
    /^Ananda .+ menunjukkan capaian yang baik dalam /,'deskripsi tersimpan tidak berubah sendiri');
  saveAllAutomaticReports(session,{overwriteEdited:true});
  assert.match(getReportDescription(session,subject.id,anak.id).text,
    /^Ananda .+ menunjukkan capaian penguasaan yang sangat baik dalam /,'Generate berikutnya memakai rubrik terbaru');
});

test('28c. Menyimpan bobot atau KKTP tidak pernah membuang rubrik yang sudah disusun',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,anak);
  const subject=subjects[0];
  aturRubrik(session,subject.id,[[88,100],[72,87],[56,71],[0,55]]);
  const rubrik=getAssessmentSettings(session,subject.id).rubric;
  /* Simpan bobot dan KKTP TANPA menyertakan rubrik - persis seperti halaman bobot lama. */
  saveAssessmentSettings(session,subject.id,{formative:40,daily:15,practice:15,
    scopeSummative:15,semesterSummative:15,kktp:70});
  const sesudah=getAssessmentSettings(session,subject.id);
  assert.deepEqual(sesudah.rubric,rubrik,'rubrik bertahan');
  assert.equal(sesudah.kktp,70,'KKTP tetap dapat diubah');
  assert.equal(sesudah.formative,40);
  /* Begitu pula simpan semua mapel sekaligus. */
  saveAllAssessmentSettings(session,subjects.map(item=>({subjectId:item.id,formative:30,daily:20,
    practice:20,scopeSummative:15,semesterSummative:15,kktp:75})));
  assert.deepEqual(getAssessmentSettings(session,subject.id).rubric,rubrik,
    'Simpan Semua Bobot tidak membuang rubrik');
});

test('28d. Pengaturan lama tanpa rubrik dibaca sebagai default tanpa diubah',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subject=mapelBerButir(session,anak)[0];
  nilaiPenuh(session,subject.id,anak.id,95,75);
  /* Catatan versi lama: tidak punya kolom rubric sama sekali. */
  const kunci=`${ACADEMIC_YEAR}|${session.semester}|5B|${subject.id}`;
  const db=JSON.parse(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'));
  delete db.assessmentSettings[kunci].rubric;
  globalThis.localStorage.setItem('erapor_satria_jaya_01_v1',JSON.stringify(db));
  muatUlang();
  /* Rubrik bawaan diselaraskan dengan KKTP catatan itu: batas CUKUP berimpit dengan KKTP 75. */
  assert.deepEqual(getAssessmentSettings(session,subject.id).rubric,
    suggestReportRubricForKktp(DEFAULT_REPORT_RUBRIC,75),'dibaca sebagai bawaan yang selaras KKTP');
  /* Membacanya tidak menulis apa pun ke penyimpanan. */
  const sebelum=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');
  getAssessmentSettings(session,subject.id);
  generateReportDescription(session,subject.id,anak.id,{});
  assert.equal(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'),sebelum,
    'pembacaan tidak mengubah catatan lama');
  /* Dan deskripsinya tetap tersusun memakai default. */
  assert.match(generateReportDescription(session,subject.id,anak.id,{}).text,
    /^Ananda .+ menunjukkan capaian penguasaan yang sangat baik dalam /);
});

/* =================================================================== §9 TANDA TANGAN RAPOR */

test('29. NIP berdiri langsung di bawah nama, tiga kolom tetap sejajar',()=>{
  const css=read('src/styles/app.css');
  const nama=css.match(/\.report-signatures strong\{flex:1 1 auto;min-height:2\.5em;[^}]*\}/);
  assert.ok(nama,'kotak nama mengisi sisa tinggi kolom dan tetap punya dua baris minimum');
  assert.match(nama[0],/justify-content:flex-end/,'nama ditarik ke dasar kotaknya');
  assert.match(nama[0],/align-items:center/,'nama tetap rata tengah');
  assert.match(css,/\.report-signatures\{align-items:stretch\}/,'tiga kolom diregangkan setinggi baris');
  assert.match(css,/\.report-signatures small\{margin-top:0;white-space:nowrap\}/,
    'tidak ada jarak tambahan sebelum NIP, dan NIP tidak pernah dipatahkan dua baris');
  /* Struktur kolomnya tidak berubah: tanggal, jabatan, ruang tanda tangan, nama, NIP. */
  const sumber=read('src/pages/print.js');
  const blok=sumber.slice(sumber.indexOf('const barisTanggal='),
    sumber.indexOf('return `<section class="document-a4 document-sheet report-a4">'));
  assert.deepEqual([...blok.matchAll(/class="signature-role">([^<]+)</g)].map(item=>item[1]),
    ['Orang Tua Murid','Kepala Sekolah','Wali Kelas']);
  assert.equal((blok.match(/class="signature-col"/g)||[]).length,3);
  assert.equal((blok.match(/barisTanggal\(/g)||[]).length,3);
  assert.equal((blok.match(/class="signature-spacer"/g)||[]).length,3);
  assert.equal((blok.match(/barisNip\(/g)||[]).length,1,'kolom orang tua memakai baris NIP kosong');
  assert.equal((blok.match(/signatureBlock\(/g)||[]).length,2,'dua kolom lain memakai nama dan NIP');
  assert.match(sumber,/<small>NIP\. \$\{escapeHtml\(nip\)\}<\/small>/,'NIP tercetak di bawah nama');
  /* Ruang tanda tangan dan cetak A4 tidak diubah. */
  assert.match(css,/\.report-signatures \.signature-spacer\{height:52px\}/);
  assert.match(css,/@media print\{[\s\S]*@page\{size:A4 portrait;margin:10mm\}/);
});

/* ================================================ PENGATURAN RUBRIK PADA HALAMAN YANG SUDAH ADA */

test('29b. Rubrik diatur pada halaman Bobot Penilaian, bukan pada menu baru',()=>{
  const halaman=read('src/pages/weights.js');
  assert.match(halaman,/Rubrik Kategori Deskripsi Rapor/,'panel rubrik berada di halaman bobot');
  assert.match(halaman,/data-rubric-min/);
  assert.match(halaman,/data-rubric-max/);
  assert.match(halaman,/data-reset-rubric/,'rubrik dapat dikembalikan ke bawaan');
  /* Empat kategori dirender dari daftar aplikasi, bukan ditulis satu per satu. */
  assert.match(halaman,/settings\.rubric\.map\(/);
  assert.equal(/'SANGAT BAIK'|"SANGAT BAIK"/.test(halaman),false,
    'nama kategori tidak ditulis tangan di halaman');
  /* Rubrik ikut terkirim saat Simpan, dan Simpan tertutup bila rubriknya tidak sah. */
  assert.match(halaman,/rubric:rubricValue\(\)/);
  assert.match(halaman,/saveButton\.disabled=!valid\|\|!updateRubricStatus\(\)/);
  /* Pemeriksaannya memakai layanan yang sama dengan yang dipakai saat menyimpan. */
  assert.match(halaman,/normalizeReportRubric\(rubricValue\(\)\)/);
  /* Tidak ada rute atau menu baru yang ditambahkan untuk ini. */
  assert.equal(/rubrik|rubric/i.test(read('src/data/navigation.js')),false,'tidak ada menu baru');
  assert.equal(/rubrik|rubric/i.test(read('src/core/router.js')),false,'tidak ada rute baru');
});

test('29c. Rubrik tersimpan pada scope tahun | semester | kelas | subjectId',()=>{
  useMemoryStorage();
  const ganjil=guru('5B',`Ganjil ${ACADEMIC_YEAR}`);
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  const lain=guru('5C');
  for(const sesi of [ganjil,genap,lain])aktifkanSemuaMapel(sesi);
  const anak=tambahSiswa(ganjil,1);
  tambahSiswa(genap,2);tambahSiswa(lain,3);
  const subjects=mapelIntra(ganjil,anak);
  const [pertama,kedua]=subjects;
  aturRubrik(ganjil,pertama.id,[[85,100],[70,84],[55,69],[0,54]]);
  /* Mapel lain, semester lain, dan rombel lain tetap memakai default. */
  /* Bawaan kini selaras dengan KKTP mapel itu; yang diperiksa tetap sama: rubrik khusus satu
     mapel tidak menular ke mapel, semester, maupun rombel lain. */
  const bawaan=getAssessmentSettings(ganjil,kedua.id).rubric;
  assert.equal(bawaan[2].min,75,'bawaan berimpit dengan KKTP 75');
  assert.deepEqual(getAssessmentSettings(genap,pertama.id).rubric,bawaan,'semester lain tidak ikut');
  assert.deepEqual(getAssessmentSettings(lain,pertama.id).rubric,bawaan,'rombel lain tidak ikut');
  assert.equal(getAssessmentSettings(ganjil,pertama.id).rubric[0].min,85);
  /* Kuncinya memang memuat empat bagian itu. */
  const db=JSON.parse(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'));
  const kunci=Object.keys(db.assessmentSettings).find(key=>key.endsWith(`|${pertama.id}`));
  assert.deepEqual(kunci.split('|'),[ACADEMIC_YEAR,ganjil.semester,'5B',pertama.id]);
});

test('29d. Rubrik berlaku untuk SELURUH mapel aktif tanpa satu pun nama mapel di kode',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,anak);
  for(const subject of subjects){
    /* Setiap mapel dapat menyimpan rubriknya sendiri, apa pun subjectId-nya. */
    aturRubrik(session,subject.id,[[81,100],[61,80],[41,60],[0,40]]);
    assert.deepEqual(getAssessmentSettings(session,subject.id).rubric.map(item=>item.min),
      [81,61,41,0],`${subject.name} menyimpan rubriknya sendiri`);
  }
  /* Tidak ada nama atau id mapel yang ditanam pada modul rubrik maupun penyusun kalimat. */
  for(const berkas of ['src/services/report-rubric.js','src/services/cp-descriptions.js']){
    const isi=read(berkas);
    for(const subject of subjects)
      assert.equal(isi.includes(`'${subject.id}'`),false,`${berkas} tidak menyebut ${subject.id}`);
  }
});

/* ================================================================ §10 DATA LAMA TIDAK HILANG */

test('30. Perubahan ini tidak menghapus data yang sudah ada',()=>{
  useMemoryStorage();
  const session=guru('5B');
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1);
  const subjects=mapelBerButir(session,anak);
  for(const subject of subjects){
    nilaiPenuh(session,subject.id,anak.id,84,75);
    saveStudentIntracurricularSelection(session,anak.id,{subjectId:subject.id,butirIds:butirMapel(session,subject.id),predicate:'Baik'});
  }
  saveClassAttitudeBulk(session,ATTITUDE_DIMENSIONS.slice(0,3).map(item=>item.id),ATTITUDE_LEVELS[0]);
  saveAllAutomaticReports(session,{overwriteEdited:true});
  const sebelum=globalThis.localStorage.getItem('erapor_satria_jaya_01_v1');

  /* Membaca berkali-kali - termasuk membangun dokumen rapor - tidak mengubah apa pun. */
  muatUlang();
  getReportDocument(session,anak.id);
  listStudentIntracurricular(session,anak.id);
  listStudentAttitudes(session,anak.id);
  for(const subject of subjects)getReportDescription(session,subject.id,anak.id);
  assert.equal(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'),sebelum,
    'membaca data tidak pernah menuliskan perubahan');

  /* Dan tidak ada satu pun jalur baru yang menghapus koleksi. */
  for(const berkas of ['src/services/completeness.js','src/services/intracurricular.js',
    'src/services/documents.js','src/services/cp-descriptions.js']){
    const isi=read(berkas);
    assert.equal(/localStorage\.clear|removeItem/.test(isi),false,`${berkas} tidak menghapus penyimpanan`);
    /* Yang dilarang adalah membuang KOLEKSINYA. Memindahkan satu catatan lama ke kunci
       barunya - kunci yang memuat mata pelajaran - bukan penghapusan data: isinya tetap ada,
       hanya alamatnya yang menjadi benar. */
    assert.equal(/delete db\.(intracurricularScores|attitudeProfiles|reportScores|assessmentScores)\s*[;\n]/
      .test(isi),false,`${berkas} tidak membuang koleksi yang sudah ada`);
  }
});
