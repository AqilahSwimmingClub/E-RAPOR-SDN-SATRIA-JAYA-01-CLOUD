import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { cpElements } from '../src/data/curriculum-cp.js';
import { cpButirCoverage, defaultCpButir } from '../src/data/cp-butir-defaults.js';
import { CP_SUBJECTS } from '../src/data/curriculum-cp.js';
import { deactivateAllCpButir, getCpButir, listCpButir, listCpButirForSemester,
  setCpButirActive } from '../src/services/cp-butir.js';
import { capaianPembelajaranFor } from '../src/services/learning-objectives.js';
import { generateAllReportDescriptions, getReportDescription,
  saveReportDescription } from '../src/services/descriptions.js';
import { saveAllAutomaticReports } from '../src/services/report-bulk.js';
import { deskripsiBocorFase, deskripsiMengulangMapel } from '../src/services/cp-descriptions.js';
import { saveStudentIntracurricularSelection } from '../src/services/intracurricular.js';
import { saveAssessmentScores, saveAssessmentSettings, ASSESSMENT_TYPES } from '../src/services/assessment.js';
import { getReportScore, saveAutomaticReportScores } from '../src/services/report.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* MENU CP YANG RINGKAS, NONAKTIFKAN SEMUA, DAN DESKRIPSI RAPOR OTOMATIS.

   Tiga hal yang dijaga suite ini, dan ketiganya diuji sebagai perilaku - bukan sekadar sebagai
   teks pada berkas:

   1. Menu CP tidak lagi menampilkan struktur CP induk. Naskah "Pada akhir Fase ...", penomoran
      3/3.1/3.2, paragraf rujukan regulasi, dan deretan nama elemen dibuang dari LAYAR. Datanya
      tetap utuh di dalam aplikasi dan tetap dipakai - itu diuji terpisah, karena membuang data
      akan memutus rantai Butir CP -> Elemen -> CP resmi.
   2. "Nonaktifkan Semua" hanya menyentuh mata pelajaran yang sedang dipilih, dan tidak menghapus
      apa pun. Tidak ada pasangan "Aktifkan Semua".
   3. "Simpan Otomatis Semua Mapel" langsung menulis Deskripsi Rapor untuk setiap murid yang
      memang punya nilai - guru tidak perlu membuka Nilai Rapor dan menekan Generate satu per
      satu - tanpa membuatkan kalimat palsu bagi murid atau mapel yang belum dinilai. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const halamanCp=()=>read('src/pages/objectives.js');
/* Komentar dibuang lebih dulu supaya yang diperiksa benar-benar KODE yang dirender - bukan
   catatan yang justru menerangkan mengapa sesuatu dibuang. */
const buangKomentar=teks=>teks.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
const kodeCp=()=>buangKomentar(halamanCp());

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
    nisn:`7700${String(index).padStart(6,'0')}`,name:`Siswa ${index}`,gender:index%2?'L':'P',photo:''});
}
function beriNilai(session,subjectId,studentId,nilai=82){
  saveAssessmentSettings(session,subjectId,{formative:30,daily:20,practice:20,
    scopeSummative:15,semesterSummative:15,kktp:75});
  for(const jenis of ASSESSMENT_TYPES)saveAssessmentScores(session,subjectId,jenis.id,{[studentId]:nilai});
}
function siapkan({siswa=3,bernilai=MAPEL,semester=`Ganjil ${ACADEMIC_YEAR}`}={}){
  useMemoryStorage();
  const session=guru('5B',semester);
  aktifkanMapel(session);
  const murid=Array.from({length:siswa},(_,i)=>tambahSiswa(session,i+1));
  for(const mapel of bernilai)for(const anak of murid)beriNilai(session,mapel,anak.id);
  return {session,murid};
}

/* ============================================ 1-5. Menu CP tidak menampilkan struktur induk */

test('1. Blok CP resmi yang panjang tidak lagi ditampilkan',()=>{
  const kode=kodeCp();
  for(const dibuang of ['"cp-card"','cp-naskah','cp-source','cp-elements','cp-empty','cp-badges',
    'drawCp','data-cp'])
    assert.equal(kode.includes(dibuang),false,`menu CP tidak lagi memuat ${dibuang}`);
  /* Naskah CP resmi memang tidak pernah dirender halaman ini lagi. */
  assert.equal(/cp\.naskah/.test(kode),false,'naskah CP tidak dirender');
});

test('2. Penomoran naskah CP seperti "3. Fase C", "3.1", "3.2" tidak tampil',()=>{
  const kode=kodeCp();
  /* Penomoran itu berasal dari naskah CP resmi. Halaman tidak membacanya sama sekali. */
  assert.equal(/naskahReason|cp\.naskah|curriculum-cp-naskah/.test(kode),false,
    'halaman tidak menyentuh naskah CP maupun alasannya');
  assert.equal(/Pada akhir Fase/i.test(kode),false,'paragraf "Pada akhir Fase" tidak ada');
  /* Naskahnya sendiri memang masih memuat penomoran itu - itulah yang dijauhkan dari layar. */
  const naskah=read('src/data/curriculum-cp-naskah.js');
  assert.ok(naskah.length>1000,'naskah CP resmi tetap ada di dalam aplikasi');
});

test('3. Paragraf rujukan dan penjelasan regulasi tidak tampil',()=>{
  const kode=kodeCp();
  for(const dibuang of ['Rujukan:','regulation','decision','kewenangan','Muatan Lokal'])
    assert.equal(kode.includes(dibuang),false,`paragraf ${dibuang} tidak lagi ditampilkan`);
});

test('4. Nama elemen tidak lagi menjadi pajangan pada daftar Butir CP',()=>{
  const halaman=kodeCp();
  assert.equal(halaman.includes('<th>Elemen CP</th>'),false,'kolom Elemen CP dibuang dari tabel');
  assert.equal(halaman.includes('cp-butir-elemen'),false,'chip elemen dibuang dari kartu');
  assert.equal(halaman.includes('Elemen CP: ${escapeHtml(item.elementName)}'),false,
    'tag elemen dibuang dari daftar pemilihan');
  /* SATU TEMPAT ELEMEN TETAP TAMPIL, dan itu memang kontrol yang diperlukan: form Tambah/Edit
     wajib menentukan elemen induk butir. Tanpa itu relasi Butir CP -> Elemen -> CP resmi putus. */
  const form=halaman.slice(halaman.indexOf('function openManualForm'),halaman.indexOf('function drawLegacy'));
  assert.match(form,/Elemen CP \*/,'form Tambah/Edit tetap memilih Elemen CP');
  assert.match(form,/name="elementId"/);
});

test('5. Elemen dan CP resmi tetap tersedia di dalam aplikasi',()=>{
  const {session}=siapkan({siswa:1});
  /* Dataset elemen resmi utuh. */
  const elemen=cpElements('agama','C');
  assert.ok(elemen.length>=4,`elemen CP Agama Fase C tetap ada: ${elemen.length}`);
  for(const nama of ['Al-Qur’an Hadis','Akidah','Akhlak','Fikih'])
    assert.ok(elemen.some(item=>item.name===nama),`elemen "${nama}" tetap tersimpan internal`);
  /* Rantai Butir CP -> Elemen -> CP resmi tidak putus. */
  const cp=capaianPembelajaranFor(session,'ipas');
  assert.ok(cp?.elements?.length,'CP resmi tetap terbaca layanan');
  for(const butir of listCpButir(session,'ipas')){
    assert.ok(butir.elementId,'butir tetap menunjuk elemen induknya');
    assert.ok(cp.elements.some(item=>item.id===butir.elementId),
      `elemen induk "${butir.elementId}" tetap dikenal CP resmi`);
  }
});

test('6. 291 Butir CP tetap ada dan substansinya tidak berubah',()=>{
  const berbutir=cpButirCoverage(CP_SUBJECTS).filter(item=>item.butir>0);
  const total=berbutir.reduce((jumlah,item)=>jumlah+item.butir,0);
  assert.equal(total,291,`jumlah Butir CP tetap 291, terbaca ${total}`);
  for(const item of berbutir.flatMap(entry=>defaultCpButir(entry.subjectId,entry.phase)))
    assert.ok(item.teori||item.praktik,`${item.code}: rumusan substansi utuh`);
});

/* ============================================ 7-13. Nonaktifkan Semua */

test('7-8. Tombol Nonaktifkan Semua tersedia; tidak ada Aktifkan Semua',()=>{
  const halaman=halamanCp();
  assert.match(halaman,/data-nonaktif-semua/,'7. tombol tersedia');
  assert.match(halaman,/Nonaktifkan Semua/,'label tombol tersedia');
  assert.match(halaman,/confirmDialog\(\{title:'Nonaktifkan Semua Butir CP'/,'ada konfirmasi');
  /* 8. Tidak ada jalur massal untuk mengaktifkan kembali - diperiksa pada KODE, bukan pada
     komentar yang justru menerangkan mengapa tombol itu sengaja tidak ada. */
  assert.equal(/Aktifkan Semua/.test(kodeCp()),false,'8. tidak ada tombol Aktifkan Semua');
  /* `deactivateAllCpButir` memuat substring "activateAllCpButir", jadi yang dicari adalah nama
     fungsi yang berdiri sendiri - bukan sekadar potongan huruf di tengah nama lain. */
  assert.equal(/(^|[^a-zA-Z])activateAllCpButir/.test(kodeCp()+buangKomentar(read('src/services/cp-butir.js'))),false,
    'tidak ada layanan aktifkan-semua');
});

test('9-10. Nonaktifkan Semua hanya menyentuh mata pelajaran yang dipilih',()=>{
  const {session}=siapkan({siswa:1});
  const sebelum=Object.fromEntries(MAPEL.map(id=>[id,listCpButirForSemester(session,id).length]));
  assert.ok(sebelum.ipas>0&&sebelum.mtk>0&&sebelum.pancasila>0,'ketiganya punya butir aktif');

  const hasil=deactivateAllCpButir(session,'ipas');
  assert.equal(hasil.subjectId,'ipas');
  assert.equal(hasil.dinonaktifkan,sebelum.ipas,'seluruh butir IPAS dinonaktifkan');
  assert.equal(hasil.tersisaAktif,0);
  assert.equal(listCpButirForSemester(session,'ipas').length,0,'9. IPAS tidak punya butir aktif');
  for(const id of MAPEL.filter(item=>item!=='ipas'))
    assert.equal(listCpButirForSemester(session,id).length,sebelum[id],
      `10. ${id} tidak berubah sama sekali`);
});

test('11. Nonaktifkan Semua tidak menghapus satu pun data',()=>{
  const {session,murid}=siapkan({siswa:2});
  const butir=listCpButirForSemester(session,'ipas');
  saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:butir.slice(0,2).map(item=>item.id),jenis:'teori',predicate:'Baik'});
  /* Nilai Akhir dan deskripsinya benar-benar disimpan lebih dulu, supaya yang diuji adalah
     data nyata yang bisa hilang - bukan kekosongan yang memang tidak pernah ada. */
  saveAllAutomaticReports(session);
  const sebelum=loadDb();
  const cuplikan=Object.fromEntries(['students','assessmentScores','reportScores',
    'reportDescriptions','intracurricularScores','cpButir']
    .map(nama=>[nama,Object.keys(sebelum[nama]||{}).length]));
  const jumlahButir=listCpButir(session,'ipas').length;
  const deskripsi=getReportDescription(session,'ipas',murid[0].id).text;

  deactivateAllCpButir(session,'ipas');

  const sesudah=loadDb();
  for(const [nama,jumlah] of Object.entries(cuplikan))
    if(nama!=='cpButir')
      assert.equal(Object.keys(sesudah[nama]||{}).length,jumlah,`11. ${nama} tidak berkurang`);
  assert.equal(listCpButir(session,'ipas').length,jumlahButir,'jumlah Butir CP tetap - hanya statusnya berubah');
  assert.equal(getReportDescription(session,'ipas',murid[0].id).text,deskripsi,
    'deskripsi rapor yang sudah tersimpan tidak dihapus');
  assert.ok(getReportScore(session,'ipas',murid[0].id),'nilai rapor tidak dihapus');
  /* Layanannya memang tidak punya jalur penghapusan. */
  const sumber=read('src/services/cp-butir.js');
  const fungsi=sumber.slice(sumber.indexOf('export function deactivateAllCpButir'));
  assert.equal(/delete db\.|removeItem|clear\(\)/.test(fungsi.slice(0,600)),false,
    'tidak ada penghapusan di dalam deactivateAllCpButir');
});

test('12-13. Aktivasi manual kembali bekerja dan bertahan setelah reload',()=>{
  const {session}=siapkan({siswa:1});
  const semua=listCpButir(session,'ipas');
  deactivateAllCpButir(session,'ipas');
  assert.equal(listCpButirForSemester(session,'ipas').length,0);

  /* 12. Satu per satu - tidak ada jalan pintas. */
  setCpButirActive(session,'ipas',semua[0].id,true);
  setCpButirActive(session,'ipas',semua[1].id,true);
  const aktif=listCpButirForSemester(session,'ipas').map(item=>item.id);
  assert.deepEqual(aktif.sort(),[semua[0].id,semua[1].id].sort(),'12. dua butir kembali aktif');

  /* 13. "Reload": cache dibuang, database dibaca ulang dari penyimpanan. */
  invalidateDbCache();
  assert.deepEqual(listCpButirForSemester(session,'ipas').map(item=>item.id).sort(),aktif.sort(),
    '13. status aktif bertahan setelah database dibaca ulang');
  assert.equal(getCpButir(session,'ipas',semua[2].id).active,false,
    'butir yang tidak diaktifkan tetap nonaktif');
});

/* ============================================ 14-24. Deskripsi Rapor otomatis */

test('14-16. Simpan Otomatis Semua Mapel menyimpan Nilai Akhir SEKALIGUS deskripsinya',()=>{
  const {session,murid}=siapkan({siswa:3});
  for(const mapel of MAPEL)for(const anak of murid)
    assert.equal(getReportDescription(session,mapel,anak.id),null,'awalnya belum ada deskripsi');

  const hasil=saveAllAutomaticReports(session);
  /* 14. Nilai Akhir tersimpan. */
  assert.ok(hasil.scoreCount>0,'14. Nilai Akhir tersimpan');
  for(const mapel of MAPEL)for(const anak of murid)
    assert.ok(getReportScore(session,mapel,anak.id)?.finalScore!==null,
      `14. Nilai Akhir ${mapel} tersimpan`);
  /* 15-16. Deskripsi dibuat DAN disimpan pada langkah yang sama - tanpa klik Generate. */
  assert.equal(hasil.descriptionCount,MAPEL.length*murid.length,'15. seluruh deskripsi dibuat');
  for(const mapel of MAPEL)for(const anak of murid){
    const catatan=getReportDescription(session,mapel,anak.id);
    assert.ok(catatan?.text,`16. deskripsi ${mapel} ${anak.name} tersimpan`);
    assert.equal(catatan.status,'AUTO','ditandai otomatis');
  }
});

test('17-18. Seluruh siswa dan seluruh mapel yang bernilai diproses',()=>{
  const {session,murid}=siapkan({siswa:5});
  const hasil=saveAllAutomaticReports(session);
  assert.equal(hasil.studentCount,5,'17. lima siswa');
  assert.equal(hasil.subjectCount,MAPEL.length,'18. seluruh mapel aktif');
  assert.deepEqual(hasil.subjectsWithDescription.slice().sort(),MAPEL.slice().sort(),
    '18. setiap mapel bernilai memperoleh deskripsi');
  for(const anak of murid)for(const mapel of MAPEL)
    assert.ok(getReportDescription(session,mapel,anak.id)?.text,
      `17. ${anak.name} punya deskripsi ${mapel}`);
});

test('19. Mapel dan siswa tanpa nilai tidak dibuatkan deskripsi palsu',()=>{
  /* Hanya IPAS dan Matematika yang dinilai, dan hanya untuk dua murid pertama. */
  useMemoryStorage();
  const session=guru();
  aktifkanMapel(session);
  const murid=[1,2,3].map(index=>tambahSiswa(session,index));
  for(const mapel of ['ipas','mtk'])for(const anak of murid.slice(0,2))
    beriNilai(session,mapel,anak.id);

  const hasil=saveAllAutomaticReports(session);
  for(const mapel of ['ipas','mtk']){
    assert.ok(getReportDescription(session,mapel,murid[0].id)?.text,`${mapel} murid bernilai terisi`);
    assert.ok(getReportDescription(session,mapel,murid[1].id)?.text);
    assert.equal(getReportDescription(session,mapel,murid[2].id),null,
      `19. murid tanpa nilai tidak dibuatkan deskripsi ${mapel}`);
  }
  for(const mapel of ['pancasila','bindo'])for(const anak of murid)
    assert.equal(getReportDescription(session,mapel,anak.id),null,
      `19. mapel ${mapel} yang belum dinilai tidak dibuatkan deskripsi`);
  assert.ok(hasil.skippedCount>0,'yang dilewati dilaporkan, bukan disembunyikan');
  assert.deepEqual(hasil.subjectsWithDescription.slice().sort(),['ipas','mtk'],
    'hanya mapel bernilai yang punya deskripsi');
});

test('20-21. Tidak ada data silang antar-mapel maupun antar-siswa',()=>{
  const {session,murid}=siapkan({siswa:3});
  saveAllAutomaticReports(session);
  /* 20. Tiap mapel punya kalimatnya sendiri. */
  const perMapel=MAPEL.map(mapel=>getReportDescription(session,mapel,murid[0].id).text);
  assert.equal(new Set(perMapel).size,MAPEL.length,'20. empat mapel, empat kalimat berbeda');
  /* Dan kuncinya memang memuat mapel serta siswa. */
  for(const kunci of Object.keys(loadDb().reportDescriptions)){
    const bagian=kunci.split('|');
    assert.equal(bagian.length,5,`kunci ${kunci} memuat tahun|semester|kelas|mapel|siswa`);
    assert.ok(MAPEL.includes(bagian[3]),'bagian keempat adalah mapel');
    assert.ok(murid.some(anak=>anak.id===bagian[4]),'bagian kelima adalah siswa');
  }
  /* 21. Nilai berbeda per siswa menghasilkan catatan yang berdiri sendiri. */
  beriNilai(session,'ipas',murid[0].id,95);
  beriNilai(session,'ipas',murid[1].id,60);
  saveAllAutomaticReports(session,{overwriteEdited:true});
  const tinggi=getReportDescription(session,'ipas',murid[0].id).text;
  const rendah=getReportDescription(session,'ipas',murid[1].id).text;
  assert.notEqual(tinggi,rendah,'21. dua siswa dengan nilai berbeda, dua kalimat berbeda');
  /* Bentuk kalimat rapor diubah atas permintaan resmi menjadi empat kategori terhadap KKTP. */
  assert.match(tinggi,/^Ananda .+ menunjukkan capaian penguasaan yang sangat baik dalam /);
  assert.match(rendah,/^Ananda .+ (telah menunjukkan capaian pemahaman yang cukup|perlu meningkatkan pemahaman) mengenai /);
});

test('22. Deskripsi otomatis bertahan setelah database dibaca ulang',()=>{
  const {session,murid}=siapkan({siswa:2});
  saveAllAutomaticReports(session);
  const sebelum=MAPEL.map(mapel=>murid.map(anak=>getReportDescription(session,mapel,anak.id).text));
  invalidateDbCache();
  const sesudah=MAPEL.map(mapel=>murid.map(anak=>getReportDescription(session,mapel,anak.id)?.text));
  assert.deepEqual(sesudah,sebelum,'22. seluruh deskripsi bertahan');
});

test('23. Ganjil dan Genap tetap terpisah',()=>{
  const {session,murid}=siapkan({siswa:1});
  saveAllAutomaticReports(session);
  const ganjil=getReportDescription(session,'ipas',murid[0].id).text;

  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  aktifkanMapel(genap);
  const anakGenap=tambahSiswa(genap,1);
  beriNilai(genap,'ipas',anakGenap.id,60);
  saveAllAutomaticReports(genap);

  assert.equal(getReportDescription(session,'ipas',murid[0].id).text,ganjil,
    '23. catatan Ganjil tidak tertimpa Genap');
  assert.notEqual(getReportDescription(genap,'ipas',anakGenap.id).text,ganjil,
    'Genap punya catatannya sendiri');
  const kunci=Object.keys(loadDb().reportDescriptions);
  assert.ok(kunci.some(key=>key.startsWith(`${ACADEMIC_YEAR}|Ganjil ${ACADEMIC_YEAR}|`)));
  assert.ok(kunci.some(key=>key.startsWith(`${ACADEMIC_YEAR}|Genap ${ACADEMIC_YEAR}|`)));
});

test('24. Generate Semua manual tetap bekerja sebagai regenerate',()=>{
  const {session,murid}=siapkan({siswa:3});
  saveAllAutomaticReports(session);
  const awal=getReportDescription(session,'ipas',murid[0].id).text;

  /* Nilai diubah dan Nilai Akhir disimpan ulang - persis alur guru: Simpan Hasil Otomatis,
     lalu Generate Semua Siswa untuk menyusun ulang kalimatnya. */
  beriNilai(session,'ipas',murid[0].id,60);
  saveAutomaticReportScores(session,'ipas');
  const hasil=generateAllReportDescriptions(session,'ipas',{overwriteEdited:true});
  assert.equal(hasil.terisi,3,'24. seluruh siswa disusun ulang');
  assert.notEqual(getReportDescription(session,'ipas',murid[0].id).text,awal,
    'kalimatnya mengikuti nilai yang baru');
  /* Tombolnya memang masih ada di halaman, dengan fungsi regenerate. */
  const halaman=read('src/pages/reports.js');
  assert.match(halaman,/data-generate-all/,'tombol Generate Semua Siswa tetap ada');
  assert.match(halaman,/generateAllReportDescriptions\(session,mapelDiproses\)/,
    'tombol manual memakai mapel yang sedang dipilih');
  /* Jalur otomatisnya berbeda: ia menuntut nilai, jalur manual tidak. */
  assert.match(read('src/services/report-bulk.js'),/requireScore:true/,
    'jalur otomatis hanya memproses siswa yang bernilai');
});

test('Deskripsi otomatis tunduk pada aturan deskripsi yang sudah berlaku',()=>{
  const {session,murid}=siapkan({siswa:2});
  saveAllAutomaticReports(session);
  const nama={pancasila:'Pendidikan Pancasila',mtk:'Matematika',ipas:'IPAS',bindo:'Bahasa Indonesia'};
  for(const mapel of MAPEL)for(const anak of murid){
    const teks=getReportDescription(session,mapel,anak.id).text;
    assert.equal(deskripsiBocorFase(teks),false,`${mapel}: bebas Fase, kode CP, dan TP`);
    assert.equal(deskripsiMengulangMapel(teks,nama[mapel]),false,`${mapel}: nama mapel tidak diulang`);
    assert.equal(/mata pelajaran/i.test(teks),false);
  /* Bentuk kalimat diubah atas permintaan resmi: Deskripsi Rapor memakai empat rujukan final
     yang seluruhnya dibuka dengan nama murid. */
    assert.match(teks,/^Ananda .+ (menunjukkan capaian|telah menunjukkan capaian|perlu meningkatkan pemahaman|menempuh pembelajaran) /,
      'memakai bingkai capaian rapor');
  }
  /* Dan tetap berbeda dari deskripsi Intrakurikuler. */
  const butir=listCpButirForSemester(session,'ipas').slice(0,2).map(item=>item.id);
  const intra=saveStudentIntracurricularSelection(session,murid[0].id,{subjectId:'ipas',
    butirIds:butir,jenis:'teori',predicate:'Baik'});
  assert.notEqual(intra.description,getReportDescription(session,'ipas',murid[0].id).text);
});

test('Tulisan tangan guru tidak ditimpa oleh Simpan Otomatis Semua Mapel',()=>{
  const {session,murid}=siapkan({siswa:2});
  saveReportDescription(session,'ipas',murid[0].id,{text:'Kalimat tulisan tangan guru.'});
  const hasil=saveAllAutomaticReports(session);
  assert.equal(getReportDescription(session,'ipas',murid[0].id).text,'Kalimat tulisan tangan guru.',
    'deskripsi yang disunting guru dipertahankan');
  assert.ok(hasil.skippedCount>=1,'dilaporkan sebagai dilewati, bukan kegagalan');
  assert.equal(hasil.errors.length,0,'bukan kegagalan');
});

/* ============================================ 25-30. Blok tanda tangan */

test('25-27. Tiga blok tanda tangan sejajar: peran, nama, dan NIP',()=>{
  const sumber=read('src/pages/print.js');
  const blok=sumber.slice(sumber.indexOf('const barisTanggal='),
    sumber.indexOf('return `<section class="document-a4 document-sheet report-a4">'));
  /* 25. Tetap tiga kolom. */
  assert.equal((blok.match(/class="signature-col"/g)||[]).length,3,'25. tiga blok tanda tangan');
  const peran=[...blok.matchAll(/class="signature-role">([^<]+)</g)].map(item=>item[1]);
  assert.deepEqual(peran,['Orang Tua Murid','Kepala Sekolah','Wali Kelas']);
  /* 26-27. Struktur baris identik, sehingga nama dan NIP berdiri pada garis yang sama. */
  assert.equal((blok.match(/barisTanggal\(/g)||[]).length,3,'setiap kolom punya baris tanggal');
  assert.equal((blok.match(/class="signature-spacer"/g)||[]).length,3,'setiap kolom punya area tanda tangan');
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/\.report-signatures \.signature-col\{display:flex;flex-direction:column\}/,
    '26. kolom disusun sebagai baris yang seragam');
  assert.match(gaya,/\.report-signatures \.signature-date,\.report-signatures \.signature-role\{min-height:1\.4em/,
    '26-27. baris tanggal dan peran bertinggi sama di ketiga kolom');
  assert.match(gaya,/\.report-signatures \.signature-nip-empty\{visibility:hidden\}/,
    '27. baris NIP tetap ada meski kosong, agar NIP sejajar');
  /* Nama diberi tinggi minimum dua baris. Tanpa ini, nama Kepala Sekolah yang membungkus ke
     baris kedua sementara nama Wali Kelas tidak akan menurunkan NIP-nya sendiri dan merusak
     kesejajaran lagi - hal yang benar-benar terjadi pada kolom sempit.

     Sejak perbaikan jarak Nama-NIP, kotak nama juga MENGISI sisa tinggi kolom (flex:1) di
     dalam kolom yang diregangkan setinggi baris, sehingga baris nama terakhir ketiga kolom
     berhenti pada garis yang sama berapa pun baris yang dipakai masing-masing. */
  assert.match(gaya,/\.report-signatures strong\{flex:1 1 auto;min-height:2\.5em/,
    '27. nama menempati tinggi yang sama meski panjangnya berbeda');
});

test('28. Baris "Kab. Bekasi, ..." tetap ada tanpa merusak kesejajaran',()=>{
  const sumber=read('src/pages/print.js');
  const blok=sumber.slice(sumber.indexOf('const barisTanggal='),
    sumber.indexOf('return `<section class="document-a4 document-sheet report-a4">'));
  assert.match(blok,/settings\.printDateLabel\|\|`\$\{settings\.city\|\|'Bekasi'\}, \$\{DOTS\.slice\(0,18\)\}`/,
    '28. baris tanggal Wali Kelas dipertahankan');
  /* Ia berada di kolom Wali Kelas, dan dua kolom lain menyediakan baris kosong yang sama
     tingginya - itulah yang membuatnya tidak lagi menurunkan seluruh kolom. */
  const wali=blok.slice(blok.indexOf('barisTanggal(tanggalCetak)'));
  assert.match(wali,/signature-role">Wali Kelas/);
  assert.equal((blok.match(/barisTanggal\(''\)/g)||[]).length,2,
    'dua kolom lain tetap menyediakan baris tanggal kosong');
});

test('29. Footer identitas siswa tetap miring dan isinya tidak diubah',()=>{
  const sumber=read('src/pages/print.js');
  assert.match(sumber,/<div class="document-foot">\$\{escapeHtml\(doc\.classLabel\)\} \| \$\{escapeHtml\(student\.name\)\} \| \$\{escapeHtml\(student\.nis\)\}<\/div>/,
    '29. isi footer identitas siswa tidak berubah');
  const gaya=read('src/styles/app.css');
  const aturan=gaya.slice(gaya.indexOf('.document-foot{'),gaya.indexOf('.document-foot{')+200);
  assert.match(aturan,/font-style:italic/,'29. footer tetap miring');
});

test('30. Cetak tetap tiga kolom dan blok tanda tangan tidak terbelah halaman',()=>{
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/\.report-a4 \.report-signatures\{margin-top:30px/,'aturan cetak rapor tetap ada');
  assert.match(gaya,/\.report-a4 \.report-signatures\{grid-template-columns:repeat\(3,1fr\)/,
    '30. cetak tetap tiga kolom');
  assert.match(gaya,/\.report-a4 \.report-lower-grid,\.report-a4 \.response-box,\.report-a4 \.report-signatures\{break-inside:avoid\}/,
    '30. blok tanda tangan tidak terbelah antar halaman');
  assert.match(gaya,/\.document-box,\.report-signatures,\.equipment-sign,\.report-head-table\{break-inside:avoid\}/,
    'aturan cetak umum tetap menjaga blok tanda tangan');
  /* PADA LAYAR HP blok tanda tangan sengaja DITUMPUK menjadi satu kolom - tiga kolom selebar
     120px tidak terbaca. Itu perilaku lama yang dipertahankan, dan hanya berlaku pada layar:
     aturan cetak di atas tetap tiga kolom, sehingga rapor yang dicetak tetap sejajar berapa pun
     lebar layar yang dipakai guru saat mempratinjaunya. */
  assert.match(gaya,/@media\(max-width:767px\)[\s\S]{0,400}\.report-signatures\{grid-template-columns:1fr;gap:22px\}/,
    'penumpukan hanya berlaku pada layar sempit');
  const cetak=gaya.slice(gaya.indexOf('.report-a4 .report-signatures{grid-template-columns'));
  assert.match(cetak.slice(0,120),/repeat\(3,1fr\)/,'aturan cetak tetap tiga kolom');
});

/* ============================================ Portrait Menu CP tetap nyaman */

test('Portrait: Nonaktifkan Semua dan aksi butir berada di dalam kartu',()=>{
  const halaman=halamanCp();
  /* Tombol massal berada di kepala kartu, bersama Tambah CP - satu baris aksi yang sama. */
  const kepala=halaman.slice(halaman.indexOf('const kepala='),halaman.indexOf('if(!daftar.length)'));
  for(const aksi of ['data-tambah','data-manual','data-nonaktif-semua'])
    assert.ok(kepala.includes(aksi),`${aksi} berada di kepala daftar`);
  /* Aksi per butir tetap ikut di dalam kartu, bukan di kolom kanan tabel. */
  assert.match(halaman,/cp-butir-actions/,'kartu membawa aksinya sendiri');
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/@media \(max-width:1000px\)\{[\s\S]{0,240}\.cp-table-wrap\{display:none\}/,
    'di layar sempit tabel diganti kartu');
  assert.match(gaya,/@media \(max-width:520px\)\{[\s\S]{0,120}\.cp-butir-actions \.btn\{flex:1 1 100%\}/,
    'pada HP tombol aksi selebar kartu');
});
