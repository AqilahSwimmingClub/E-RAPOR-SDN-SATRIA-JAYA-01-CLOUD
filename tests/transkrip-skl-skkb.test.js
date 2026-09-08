import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveSchoolMaster } from '../src/services/master.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { saveGraduationStatus } from '../src/services/completeness.js';
import { saveTranscriptScores } from '../src/services/transcript.js';
import { saveDiplomaNumbers } from '../src/services/transcript-admin.js';
import { buildBackup, restoreBackup } from '../src/services/backup.js';
import { invalidateDbCache, loadDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { CONDUCT_PREDICATES, GRADUATION_DECISIONS, buildSklDocument, buildSkkbDocument,
  buildTranscriptDocument, commitDocumentImport, documentImportTemplate, getGraduationSettings,
  getStudentDocument, previewDocumentImport, saveGraduationSettings, saveStudentDocuments } from '../src/services/graduation-documents.js';
import { sklSheet, skkbSheet, transcriptSheet } from '../src/pages/graduation-print.js';
import { phaseForClassId } from '../src/data/learning-objective-defaults.js';
import { extractFunctionSource } from './helpers/report-markup.js';

/* MODUL TRANSKRIP - SKL - SKKB, DIUJI DARI LEMBAR YANG BENAR-BENAR DICETAK.

   Aplikasi ini diperjualbelikan, jadi janji terpentingnya bukan "dokumennya rapi" melainkan
   "dokumennya milik sekolah yang memakainya". Suite ini karena itu selalu menyusun dokumen dari
   Data Sekolah dan Data Siswa yang disimpan pada test itu sendiri, lalu memeriksa lembar HTML
   hasilnya - bukan sekadar memeriksa keberadaan fungsi. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();return values;}

const admin={role:'admin',classId:null,academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`};
const guru=(classId='6A')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`});

const SEKOLAH_A={name:'SD Negeri Melati Indah 03',npsn:'11112222',status:'Negeri',registrationNumber:'101010101010',
  phone:'0211111111',address:'Jalan Melati Nomor 3',village:'Melati',district:'Sukamaju',city:'Kabupaten Anggrek',
  province:'Provinsi Bunga',postalCode:'11111',website:'melati.sch.id',email:'admin@melati.sch.id',
  principalName:'Sri Wahyuni, S.Pd.',principalNip:'197001012000012001',
  regionLogo:'data:image/png;base64,AAAA'};
const SEKOLAH_B={name:'SD Swasta Cakrawala Nusantara',npsn:'99998888',status:'Swasta',registrationNumber:'202020202020',
  phone:'0312222222',address:'Jalan Cakrawala Nomor 88',village:'Cakrawala',district:'Bumi Raya',city:'Kota Samudra',
  province:'Provinsi Laut',postalCode:'99999',website:'cakrawala.sch.id',email:'admin@cakrawala.sch.id',
  principalName:'Bambang Prasetyo, M.Pd.',principalNip:'198505052010011002',
  regionLogo:'data:image/png;base64,BBBB'};

/* Empat mapel aktif sudah cukup untuk membuktikan urutan dan penomoran; yang diuji adalah
   aturannya, bukan panjang daftarnya. Mapel agama sengaja ikut satu supaya penyaringan agama
   siswa - yang memang berlaku pada Rapor - juga terbukti berlaku sama pada ketiga dokumen. */
const MAPEL_AKTIF=Object.freeze(['agama','pancasila','bindo','mtk']);
const NAMA_AKTIF=Object.freeze(MAPEL_AKTIF.map(id=>SUBJECTS_DEFAULT.find(item=>item.id===id).name));
function siapkan(identitas=SEKOLAH_A,{classId='6A',aktif=MAPEL_AKTIF}={}){
  useMemoryStorage();
  saveSchoolMaster(admin,identitas);
  const scope=guru(classId);
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:aktif.includes(item.id),order:index+1})));
  const siswa=createStudent(scope,{classId,nis:'202101019',nisn:'3135557402',name:'Tasa Sabilah',gender:'P',
    birthPlace:'Bekasi',birthDate:'2013-02-19',religion:'Islam',parentName:'Dasta',address:'Kp. Contoh'});
  return {scope,siswa};
}
function isiNilai(scope,studentId,nilai=[83.47,85.7,85.05,87.45]){
  const rows=listStudents(scope,{classId:scope.classId});
  void rows;
  const aktif=buildTranscriptDocument(admin,scope.classId,studentId).rows;
  const values={};
  aktif.forEach((row,index)=>{values[row.subjectId]=nilai[index%nilai.length];});
  saveTranscriptScores(scope,studentId,values);
  return values;
}

/* =============================================================== §35 TRANSKRIP NILAI */

test('T1. Transkrip menyusun identitas sekolah dan siswa dari data tersimpan',()=>{
  const {scope,siswa}=siapkan();
  saveGraduationSettings(admin,{graduationDate:'2026-05-02',documentDate:'2026-07-13',documentCity:'Kab. Anggrek'});
  saveStudentDocuments(admin,[{studentId:siswa.id,transcriptNumber:'400.3.11.1/278/SD/VI/2026'}]);
  saveDiplomaNumbers(admin,[{studentId:siswa.id,number:'111202664291709'}]);
  isiNilai(scope,siswa.id);
  const html=transcriptSheet(buildTranscriptDocument(admin,scope.classId,siswa.id));
  for(const potongan of ['SD Negeri Melati Indah 03','11112222','Tasa Sabilah','Bekasi, 19 Februari 2013',
    '3135557402','111202664291709','2 Mei 2026','400.3.11.1/278/SD/VI/2026','Sri Wahyuni, S.Pd.','197001012000012001'])
    assert.ok(html.includes(potongan),`transkrip memuat ${potongan}`);
  assert.ok(html.includes('TRANSKRIP NILAI'));
  assert.ok(html.includes('Kab. Anggrek, 13 Juli 2026'),'tanggal penerbitan surat memakai kota penerbitan');
});

test('T2. Transkrip memakai Mapping aktif sebagai satu daftar, tanpa Kelompok A/B',()=>{
  const {scope,siswa}=siapkan();
  isiNilai(scope,siswa.id);
  const doc=buildTranscriptDocument(admin,scope.classId,siswa.id);
  const html=transcriptSheet(doc);
  assert.equal(doc.rows.length,4,'hanya mapel aktif yang tampil');
  assert.deepEqual(doc.rows.map(row=>row.number),[1,2,3,4],'satu sequence 1..N, tidak diulang per kelompok');
  for(const larangan of ['Kelompok A','Kelompok B','subject-group-row'])
    assert.equal(html.includes(larangan),false,`transkrip tidak memuat ${larangan}`);
  /* Urutan mapel harus sama persis dengan urutan Mapping aktif - urutan yang dipakai Rapor. */
  assert.deepEqual(doc.rows.map(row=>row.subjectId),[...MAPEL_AKTIF]);
});

test('T3. Mapel nonaktif tidak pernah muncul pada dokumen',()=>{
  const {scope,siswa}=siapkan(SEKOLAH_A,{aktif:['agama','pancasila']});
  const doc=buildTranscriptDocument(admin,scope.classId,siswa.id);
  assert.equal(doc.rows.length,2);
  assert.equal(transcriptSheet(doc).includes('Matematika'),false,'mapel yang dinonaktifkan hilang dari dokumen');
});

test('T4. Nilai dan rata-rata dihitung dari nilai yang tersimpan, bukan dikarang',()=>{
  const {scope,siswa}=siapkan();
  isiNilai(scope,siswa.id,[80,90,70,60]);
  const doc=buildTranscriptDocument(admin,scope.classId,siswa.id);
  assert.deepEqual(doc.rows.map(row=>row.score),[80,90,70,60]);
  assert.equal(doc.average,75);
  assert.ok(transcriptSheet(doc).includes('75,00'),'nilai ditulis dua desimal dengan koma');
  /* Mapel yang belum dinilai tidak menyeret rata-rata menjadi nol. */
  useMemoryStorage();
  const ulang=siapkan();
  isiNilai(ulang.scope,ulang.siswa.id,[100,50,null,null].map(value=>value??''));
  const sebagian=buildTranscriptDocument(admin,ulang.scope.classId,ulang.siswa.id);
  assert.equal(sebagian.average,75,'rata-rata hanya dari mapel yang sudah dinilai');
  assert.ok(transcriptSheet(sebagian).includes('—'),'mapel tanpa nilai ditulis apa adanya');
});

test('T5. Nomor transkrip, nomor ijazah, dan tanggal kelulusan tersimpan dan terbaca ulang',()=>{
  const {scope,siswa}=siapkan();
  saveStudentDocuments(admin,[{studentId:siswa.id,transcriptNumber:'TR-001'}]);
  saveGraduationSettings(admin,{graduationDate:'2026-05-02',documentDate:'2026-06-02',documentCity:'Kota Uji'});
  invalidateDbCache();
  assert.equal(getStudentDocument(admin,siswa.id).transcriptNumber,'TR-001');
  assert.equal(getGraduationSettings(admin).graduationDateLabel,'2 Mei 2026');
  assert.equal(buildTranscriptDocument(admin,scope.classId,siswa.id).number,'TR-001');
});

test('T6. Lembar dokumen memakai kertas A4 dan tidak membawa elemen antarmuka',()=>{
  const {scope,siswa}=siapkan();
  const html=transcriptSheet(buildTranscriptDocument(admin,scope.classId,siswa.id));
  assert.match(html,/class="document-a4 letter-a4/,'memakai lembar A4 yang sama dengan dokumen lain');
  for(const larangan of ['<button','data-print','class="btn','no-print'])
    assert.equal(html.includes(larangan),false,`lembar cetak tidak memuat ${larangan}`);
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/@page\{size:A4 portrait;margin:10mm\}/,'kertas tetap A4 potret');
});

/* ==================================================================== §36 SKL */

test('S1. SKL memakai identitas dinamis dan tahun ajaran aktif',()=>{
  const {scope,siswa}=siapkan();
  saveStudentDocuments(admin,[{studentId:siswa.id,sklNumber:'400.3.11.1/337/Disdik/V/2026'}]);
  saveGraduationStatus(scope,siswa.id,'GRADUATED');
  const html=sklSheet(buildSklDocument(admin,scope.classId,siswa.id));
  for(const potongan of ['SURAT KETERANGAN','LULUS','SD Negeri Melati Indah 03','Tasa Sabilah',
    '202101019','3135557402','400.3.11.1/337/Disdik/V/2026',ACADEMIC_YEAR])
    assert.ok(html.includes(potongan),`SKL memuat ${potongan}`);
});

test('S2. SKL menyatakan LULUS dan TIDAK LULUS sesuai status tersimpan',()=>{
  const {scope,siswa}=siapkan();
  saveGraduationStatus(scope,siswa.id,'GRADUATED');
  assert.equal(buildSklDocument(admin,scope.classId,siswa.id).statusLabel,'LULUS');
  saveGraduationStatus(scope,siswa.id,'NOT_GRADUATED');
  const tidak=buildSklDocument(admin,scope.classId,siswa.id);
  assert.equal(tidak.statusLabel,'TIDAK LULUS');
  assert.ok(sklSheet(tidak).includes('TIDAK LULUS'));
});

test('S3. Tanpa status tersimpan SKL tidak pernah mengaku lulus',()=>{
  const {scope,siswa}=siapkan();
  const doc=buildSklDocument(admin,scope.classId,siswa.id);
  assert.equal(doc.status,'','status kosong selama Admin belum menetapkannya');
  const html=sklSheet(doc);
  /* Yang diperiksa adalah PERNYATAANNYA, bukan judul surat - judulnya memang berbunyi
     "SURAT KETERANGAN LULUS" pada blangko yang sama, apa pun keputusannya. */
  const putusan=/<p class="letter-verdict">([^<]*)<\/p>/.exec(html)?.[1]||'';
  assert.equal(putusan,'BELUM DITETAPKAN');
});

test('S4. SKL tidak memakai predikat SKKB, dan sebaliknya',()=>{
  const {scope,siswa}=siapkan();
  saveGraduationStatus(scope,siswa.id,'GRADUATED');
  saveStudentDocuments(admin,[{studentId:siswa.id,conductPredicate:'Sangat Baik'}]);
  const skl=sklSheet(buildSklDocument(admin,scope.classId,siswa.id));
  for(const predikat of CONDUCT_PREDICATES)
    assert.equal(skl.toUpperCase().includes(predikat.toUpperCase()),false,`SKL tidak memakai predikat ${predikat}`);
  const skkb=skkbSheet(buildSkkbDocument(admin,scope.classId,siswa.id));
  for(const keputusan of GRADUATION_DECISIONS)
    assert.equal(skkb.includes(keputusan.label),false,`SKKB tidak memakai ${keputusan.label}`);
});

test('S5. Tabel nilai SKL mengikuti Mapping yang sama dengan Transkrip',()=>{
  const {scope,siswa}=siapkan();
  isiNilai(scope,siswa.id,[81,82,83,84]);
  const transkrip=buildTranscriptDocument(admin,scope.classId,siswa.id);
  const skl=buildSklDocument(admin,scope.classId,siswa.id);
  assert.deepEqual(skl.rows,transkrip.rows,'mapel, urutan, nomor, dan nilai identik');
  assert.equal(skl.average,transkrip.average);
  const html=sklSheet(skl);
  for(const larangan of ['Kelompok A','Kelompok B'])
    assert.equal(html.includes(larangan),false,`SKL tidak memuat ${larangan}`);
  assert.deepEqual(skl.rows.map(row=>row.number),[1,2,3,4]);
});

/* =================================================================== §37 SKKB */

test('K1. SKKB memuat seluruh identitas yang diminta formatnya',()=>{
  const {scope,siswa}=siapkan();
  saveStudentDocuments(admin,[{studentId:siswa.id,skkbNumber:'DK.02/414/SD/VI/2026',
    examNumber:'12-0120-031-2',conductPredicate:'Baik'}]);
  const html=skkbSheet(buildSkkbDocument(admin,scope.classId,siswa.id));
  for(const potongan of ['SURAT KETERANGAN KELAKUAN','Tasa Sabilah','Bekasi, 19 Februari 2013','Perempuan',
    'Dasta','202101019','3135557402','12-0120-031-2','DK.02/414/SD/VI/2026',
    'SD Negeri Melati Indah 03','Kecamatan Sukamaju','Kabupaten Anggrek'])
    assert.ok(html.includes(potongan),`SKKB memuat ${potongan}`);
});

test('K2. Ketiga predikat SKKB tersimpan dan tercetak, selain itu ditolak',()=>{
  const {scope,siswa}=siapkan();
  for(const predikat of CONDUCT_PREDICATES){
    saveStudentDocuments(admin,[{studentId:siswa.id,conductPredicate:predikat}]);
    const doc=buildSkkbDocument(admin,scope.classId,siswa.id);
    assert.equal(doc.predicate,predikat);
    assert.ok(skkbSheet(doc).includes(predikat.toUpperCase()));
  }
  assert.deepEqual([...CONDUCT_PREDICATES],['Sangat Baik','Baik','Cukup']);
  assert.throws(()=>saveStudentDocuments(admin,[{studentId:siswa.id,conductPredicate:'Lulus'}]),/Predikat SKKB/);
});

test('K3. Tanpa predikat SKKB tidak mengarang kelakuan',()=>{
  const {scope,siswa}=siapkan();
  assert.ok(skkbSheet(buildSkkbDocument(admin,scope.classId,siswa.id)).includes('BELUM DITETAPKAN'));
});

/* ================================================ §4 LOGO DAERAH DINAMIS PADA TIGA DOKUMEN */

test('L1. Lambang daerah pada tiga dokumen berasal dari unggahan Admin',()=>{
  const {scope,siswa}=siapkan();
  for(const lembar of [transcriptSheet(buildTranscriptDocument(admin,scope.classId,siswa.id)),
    sklSheet(buildSklDocument(admin,scope.classId,siswa.id)),
    skkbSheet(buildSkkbDocument(admin,scope.classId,siswa.id))]){
    assert.ok(lembar.includes('data:image/png;base64,AAAA'),'memakai lambang daerah yang diunggah');
    assert.match(lembar,/class="letter-crest"/);
  }
  /* Slot lambang tetap ada walau belum diunggah, sehingga kop tidak bergeser. */
  saveSchoolMaster(admin,{...SEKOLAH_A,regionLogo:''});
  const kosong=transcriptSheet(buildTranscriptDocument(admin,scope.classId,siswa.id));
  assert.match(kosong,/class="letter-crest"><\/div>/);
  assert.equal(kosong.includes('<img'),false);
});

test('L2. Lambang daerah dicetak proporsional, tidak gepeng dan tidak terpotong',()=>{
  const gaya=read('src/styles/app.css');
  /* HARAPAN LAMA DIPERBARUI, BUKAN DILONGGARKAN.

     Baris ini dulu mengunci `width:auto;height:auto` + max-*. Maksudnya benar - rasio lambang
     harus terjaga - tetapi caranya membuat UKURAN CETAK bergantung pada ukuran piksel berkas
     yang diunggah sekolah: lambang beresolusi kecil ikut tercetak kecil walau slotnya lapang.
     Itu bagian dari sebab lambang terbaca mungil, dan persyaratannya kemudian diubah resmi
     supaya ukurannya ditentukan tata letak.

     Sekarang gambar mengisi slot dan object-fit:contain yang menjaga rasionya. Yang dijaga
     test ini tetap sama - tidak gepeng, tidak terpotong - dan justru lebih ketat: bentuk lama
     yang membuat ukuran bergantung berkas ikut dilarang muncul kembali. */
  assert.match(gaya,/\.letter-crest img\{width:100%;height:100%;object-fit:contain;object-position:center\}/,
    'ukuran ditentukan slot, rasio dijaga contain');
  for(const perusak of ['cover','fill','scale-down'])
    assert.equal(new RegExp(`\\.letter-crest img\\{[^}]*object-fit:${perusak}`).test(gaya),false,
      `lambang tidak boleh object-fit:${perusak}`);
  assert.equal(/\.letter-crest img\{[^}]*width:auto/.test(gaya),false,
    'ukuran cetak tidak boleh kembali bergantung pada piksel berkas unggahan');
});

/* ============================================================ §39 MULTI-SEKOLAH */

test('M1. Dokumen sekolah B tidak membawa satu pun identitas sekolah A',()=>{
  const a=siapkan(SEKOLAH_A);
  const berkasA=transcriptSheet(buildTranscriptDocument(admin,a.scope.classId,a.siswa.id));
  assert.ok(berkasA.includes(SEKOLAH_A.name));

  const b=siapkan(SEKOLAH_B);
  saveStudentDocuments(admin,[{studentId:b.siswa.id,skkbNumber:'B-1',conductPredicate:'Cukup'}]);
  saveGraduationStatus(b.scope,b.siswa.id,'GRADUATED');
  const lembar=[transcriptSheet(buildTranscriptDocument(admin,b.scope.classId,b.siswa.id)),
    sklSheet(buildSklDocument(admin,b.scope.classId,b.siswa.id)),
    skkbSheet(buildSkkbDocument(admin,b.scope.classId,b.siswa.id))];
  for(const html of lembar){
    for(const jejak of [SEKOLAH_A.name,SEKOLAH_A.npsn,SEKOLAH_A.address,SEKOLAH_A.city,
      SEKOLAH_A.principalName,SEKOLAH_A.principalNip,'data:image/png;base64,AAAA'])
      assert.equal(html.includes(jejak),false,`dokumen sekolah B tidak membawa ${jejak}`);
    assert.ok(html.includes(SEKOLAH_B.name));
    assert.ok(html.includes(SEKOLAH_B.principalName));
    assert.ok(html.includes('data:image/png;base64,BBBB'));
  }
});

test('M2. Tidak ada identitas sekolah mana pun yang ditanam di kode modul',()=>{
  const berkas=['src/services/graduation-documents.js','src/pages/graduation-print.js',
    'src/pages/transcript.js','src/pages/transcript-admin.js'];
  const jejak=['Satria Jaya','20218098','Tambun Utara','Kabupaten Bekasi','Jawa Barat','Kp. Gebang',
    'MARPUAH','Dzaidah','Tasa Sabilah','400.3.11.1','DK.02/414','111202664291709'];
  for(const path of berkas){
    const isi=read(path);
    for(const kata of jejak)assert.equal(isi.includes(kata),false,`${path} tidak boleh memuat ${kata}`);
  }
});

/* ================================================================= §20-§24 IMPORT */

test('I1. Template hanya meminta data yang belum ada, dengan kolom mapel dari Mapping',()=>{
  const {scope,siswa}=siapkan();
  void siswa;
  const template=documentImportTemplate(admin,scope.classId);
  const header=template.rows[2];
  assert.deepEqual(header.slice(0,10),['NISN','NIS','Nama Siswa','Nomor Ijazah','Nomor Transkrip',
    'Nomor SKL','Nomor SKKB','No. Peserta Ujian','Status SKL','Predikat SKKB']);
  assert.deepEqual(header.slice(10),[...NAMA_AKTIF],
    'kolom mapel dibangkitkan dari Mapping aktif, dalam urutannya');
  /* Identitas yang sudah ada di database tidak pernah diminta diketik ulang. */
  for(const dilarang of ['Tempat/Tanggal Lahir','Jenis Kelamin','Nama Orang Tua','Nama Sekolah','NPSN'])
    assert.equal(header.includes(dilarang),false,`template tidak meminta ${dilarang}`);
  assert.match(String(template.rows[0][0]),/^PETUNJUK:/,'template membawa petunjuk singkat');
  assert.equal(template.rows.length,4,'satu baris per siswa');
});

test('I2. Template menyesuaikan diri bila Mapping sekolah berbeda',()=>{
  const {scope}=siapkan(SEKOLAH_A,{aktif:['agama','mtk']});
  assert.deepEqual(documentImportTemplate(admin,scope.classId).rows[2].slice(10),
    ['Pendidikan Agama Islam dan Budi Pekerti','Matematika'],'template mengikuti Mapping sekolah ini');
});

test('I3. Import menyimpan nomor, status, predikat, dan nilai sekaligus',()=>{
  const {scope,siswa}=siapkan();
  const header=documentImportTemplate(admin,scope.classId).rows[2];
  const baris=[siswa.nisn,siswa.nis,siswa.name,'IJZ-1','TR-1','SKL-1','SKKB-1','UJI-1','LULUS','BAIK',81,82,83,84];
  const preview=previewDocumentImport(admin,scope.classId,[['PETUNJUK'],[],header,baris]);
  assert.equal(preview.canCommit,true,preview.rows[0]?.errors.join(' '));
  const ringkas=commitDocumentImport(admin,scope.classId,preview);
  assert.equal(ringkas.students,1);assert.equal(ringkas.scores,4);assert.equal(ringkas.diplomas,1);assert.equal(ringkas.statuses,1);
  const doc=buildTranscriptDocument(admin,scope.classId,siswa.id);
  assert.equal(doc.number,'TR-1');
  assert.equal(doc.diplomaNumber,'IJZ-1');
  assert.deepEqual(doc.rows.map(row=>row.score),[81,82,83,84]);
  assert.equal(buildSklDocument(admin,scope.classId,siswa.id).statusLabel,'LULUS');
  const skkb=buildSkkbDocument(admin,scope.classId,siswa.id);
  assert.equal(skkb.predicate,'Baik');
  assert.equal(skkb.examNumber,'UJI-1');
});

test('I4. Import menolak dan melaporkan baris bermasalah, tidak pernah melewatinya diam-diam',()=>{
  const {scope,siswa}=siapkan();
  const header=documentImportTemplate(admin,scope.classId).rows[2];
  const preview=previewDocumentImport(admin,scope.classId,[header,
    ['0000000000','0000','Siswa Asing','','','','','','','',80,80,80,80],
    [siswa.nisn,siswa.nis,siswa.name,'','','','','','MUNGKIN','',80,80,80,80],
    [siswa.nisn,siswa.nis,siswa.name,'','','','','','','ISTIMEWA',80,80,80,80],
    [siswa.nisn,siswa.nis,siswa.name,'','','','','','','',120,80,80,80]]);
  assert.equal(preview.canCommit,false);
  assert.equal(preview.invalidCount,4);
  assert.match(preview.rows[0].errors.join(' '),/Siswa tidak ditemukan/);
  assert.match(preview.rows[1].errors.join(' '),/Status SKL harus LULUS atau TIDAK LULUS/);
  assert.match(preview.rows[2].errors.join(' '),/Predikat SKKB/);
  assert.match(preview.rows[3].errors.join(' '),/0 sampai 100/);
  assert.throws(()=>commitDocumentImport(admin,scope.classId,preview),/tidak valid|tidak ditemukan/);
  /* Tidak ada data yang berubah selama import ditolak. */
  assert.equal(buildTranscriptDocument(admin,scope.classId,siswa.id).rows.every(row=>row.score===null),true);
});

test('I5. Import menolak siswa ganda, kolom asing, dan nomor surat kembar',()=>{
  const {scope,siswa}=siapkan();
  const header=documentImportTemplate(admin,scope.classId).rows[2];
  const ganda=previewDocumentImport(admin,scope.classId,[header,
    [siswa.nisn,siswa.nis,siswa.name,'','','','','','','',80,80,80,80],
    [siswa.nisn,siswa.nis,siswa.name,'','','','','','','',90,90,90,90]]);
  assert.equal(ganda.canCommit,false);
  assert.match(ganda.rows[1].errors.join(' '),/lebih dari satu kali/);
  assert.throws(()=>previewDocumentImport(admin,scope.classId,[[...header,'Mapel Karangan'],[]]),/tidak dikenali/);
  assert.throws(()=>previewDocumentImport(admin,scope.classId,[['Nama','Nilai'],[]]),/header tidak ditemukan/i);
  const kedua=createStudent(scope,{classId:scope.classId,nis:'202101020',nisn:'3135557403',name:'Siswa Kedua',
    gender:'L',birthPlace:'Bekasi',birthDate:'2013-03-01',religion:'Islam',parentName:'Wali'});
  saveStudentDocuments(admin,[{studentId:siswa.id,sklNumber:'SKL-SAMA'}]);
  const kembar=previewDocumentImport(admin,scope.classId,[header,
    [kedua.nisn,kedua.nis,kedua.name,'','','SKL-SAMA','','','','']]);
  assert.match(kembar.rows[0].errors.join(' '),/sudah dipakai siswa lain/);
});

/* ============================================================== §32 BACKUP / RESTORE */

test('B1. Nomor surat, predikat, dan tanggal kelulusan ikut backup dan pulih saat restore',()=>{
  const {scope,siswa}=siapkan();
  void scope;
  saveStudentDocuments(admin,[{studentId:siswa.id,transcriptNumber:'TR-9',sklNumber:'SKL-9',
    skkbNumber:'SKKB-9',examNumber:'UJI-9',conductPredicate:'Sangat Baik'}]);
  saveGraduationSettings(admin,{graduationDate:'2026-05-02',documentDate:'2026-06-02',documentCity:'Kota Uji'});
  const backup=buildBackup(admin);
  assert.ok(backup.data.graduationDocuments,'koleksi dokumen ikut ke dalam berkas backup');
  assert.ok(backup.data.graduationSettings,'pengaturan tanggal ikut ke dalam berkas backup');

  useMemoryStorage();
  saveSchoolMaster(admin,SEKOLAH_A);
  restoreBackup(backup,admin);
  const pulih=getStudentDocument(admin,siswa.id);
  assert.equal(pulih.transcriptNumber,'TR-9');
  assert.equal(pulih.skkbNumber,'SKKB-9');
  assert.equal(pulih.conductPredicate,'Sangat Baik');
  assert.equal(getGraduationSettings(admin).graduationDate,'2026-05-02');
});

test('B2. Restore berkas lama tanpa koleksi dokumen tetap berhasil',()=>{
  siapkan();
  const backup=buildBackup(admin);
  delete backup.data.graduationDocuments;
  delete backup.data.graduationSettings;
  useMemoryStorage();
  saveSchoolMaster(admin,SEKOLAH_A);
  restoreBackup(backup,admin);
  assert.deepEqual(loadDb().graduationDocuments,{},'koleksi kosong, bukan galat');
});

/* ================================================================= §33 OTORISASI */

test('O1. Hanya Admin yang dapat menyimpan pengaturan dan dokumen kelulusan',()=>{
  const {scope,siswa}=siapkan();
  assert.throws(()=>saveGraduationSettings(scope,{graduationDate:'2026-05-02'}),/Hanya Admin/);
  assert.throws(()=>saveStudentDocuments(scope,[{studentId:siswa.id,sklNumber:'X'}]),/Hanya Admin/);
  assert.throws(()=>documentImportTemplate(scope,scope.classId),/Hanya Admin/);
  assert.throws(()=>previewDocumentImport(scope,scope.classId,[]),/Hanya Admin/);
  /* Grup menunya pun tetap milik Admin saja. */
  const navigasi=read('src/data/navigation.js');
  const guruBlok=navigasi.slice(navigasi.indexOf('teacher:Object.freeze'));
  assert.equal(guruBlok.includes('admin-transcript'),false,'Guru tidak melihat menu TRANSKRIP-SKL-SKKB');
});

/* ==================================================================== §1 NAMA MENU */

test('N1. Menu dan submenu memakai nomenklatur TRANSKRIP-SKL-SKKB',()=>{
  const navigasi=read('src/data/navigation.js');
  assert.match(navigasi,/group\('admin-transcript','TRANSKRIP-SKL-SKKB'/);
  for(const label of ['Pengaturan TRANSKRIP-SKL-SKKB','Nomor & Status Dokumen',
    'Input Nilai TRANSKRIP-SKL','Import Data & Nilai','Cetak TRANSKRIP-SKL-SKKB'])
    assert.ok(navigasi.includes(label),`submenu ${label} tersedia`);
  assert.equal(navigasi.includes('TRANSKRIP IJAZAH'),false,'nama lama tidak tersisa');
  assert.equal(navigasi.includes('Import Nomor Ijazah'),false);
});

/* ============================================================ §28-§30, §38 FASE RAPOR */

test('F1. Fase diturunkan dari tingkat kelas, bukan dari huruf rombel',()=>{
  for(const [classId,fase] of [['1A','A'],['1D','A'],['2A','A'],['2D','A'],
    ['3A','B'],['3B','B'],['4A','B'],['4C','B'],
    ['5A','C'],['5B','C'],['6A','C'],['6D','C']])
    assert.equal(phaseForClassId(classId),fase,`Kelas ${classId} berada pada Fase ${fase}`);
});

test('F2. Fase tercetak tepat setelah Kelas pada identitas Rapor',()=>{
  const sumber=read('src/pages/print.js');
  const fungsi=extractFunctionSource(sumber,'reportA4');
  const mulai=fungsi.indexOf('<table class="report-head-table">');
  const tabel=fungsi.slice(mulai,fungsi.indexOf('</table>',mulai));
  const urutan=[...tabel.matchAll(/<td>(Nama Murid|Kelas|NIS\/NISN|Fase|Sekolah|Semester|Alamat|Tahun Ajaran)<\/td>/g)].map(item=>item[1]);
  assert.deepEqual(urutan,['Nama Murid','Kelas','NIS/NISN','Fase','Sekolah','Semester','Alamat','Tahun Ajaran'],
    'Fase berada pada kolom kanan tepat di bawah Kelas');
  assert.match(tabel,/<td>Fase<\/td><td>:<\/td><td>\$\{blank\(phaseForClassId\(doc\.classId\)\)\}<\/td>/,
    'Fase dihitung otomatis, tidak pernah diketik atau dipilih guru');
  assert.match(sumber,/import \{ phaseForClassId \} from '\.\.\/data\/learning-objective-defaults\.js';/,
    'memakai kembali penentu fase yang sudah dipakai CP dan Butir CP');
});

test('F3. Guru tidak pernah diminta memilih Fase',()=>{
  for(const path of ['src/pages/print.js','src/pages/reports.js','src/services/print-settings.js']){
    const isi=read(path);
    assert.equal(/name="phase"|data-phase|Pilih Fase/.test(isi),false,`${path} tidak menyediakan pilihan Fase manual`);
  }
});

/* =============================================== §30-§31 NOMOR IJAZAH IKUT BACKUP/RESTORE

   TEMUAN AUDIT YANG PERLU DICATAT APA ADANYA. Laporan sebelumnya menyebut Nomor Ijazah tidak
   ikut backup. Pengujian langsung membuktikan sebaliknya untuk BACKUP ADMIN: ia memang ikut
   dan pulih utuh, karena backup Admin membawa seluruh database tanpa penyaringan scope. Yang
   memang tidak membawanya adalah backup GURU, dan itu benar - Nomor Ijazah hanya dapat ditulis
   Admin, sehingga restore Guru tidak boleh dapat menimpanya.

   Keadaan itu sebelumnya tidak pernah diuji sama sekali, dan `settings` masih terdaftar sebagai
   koleksi rombel padahal isinya global. Suite ini mengunci perilakunya supaya tidak dapat
   berubah diam-diam. */

const IJAZAH=Object.freeze({a:'DN-01 Dx-1112026001',b:'DN-01 Dx-1112026002',c:'DN-01 Dx-1112026003'});

function siapkanDuaRombel(){
  useMemoryStorage();
  saveSchoolMaster(admin,SEKOLAH_A);
  const enamA=guru('6A'),enamB=guru('6B');
  for(const scope of [enamA,enamB])
    saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:MAPEL_AKTIF.includes(item.id),order:index+1})));
  const a1=createStudent(enamA,{classId:'6A',nis:'601',nisn:'6001',name:'Siswa 6A Satu',gender:'P',birthPlace:'Bekasi',birthDate:'2013-01-01',religion:'Islam',parentName:'Wali A1'});
  const a2=createStudent(enamA,{classId:'6A',nis:'602',nisn:'6002',name:'Siswa 6A Dua',gender:'L',birthPlace:'Bekasi',birthDate:'2013-02-02',religion:'Islam',parentName:'Wali A2'});
  const b1=createStudent(enamB,{classId:'6B',nis:'603',nisn:'6003',name:'Siswa 6B Satu',gender:'P',birthPlace:'Bogor',birthDate:'2013-03-03',religion:'Islam',parentName:'Wali B1'});
  saveDiplomaNumbers(admin,[{studentId:a1.id,number:IJAZAH.a},{studentId:a2.id,number:IJAZAH.b},{studentId:b1.id,number:IJAZAH.c}]);
  return {enamA,enamB,a1,a2,b1};
}
const nomorIjazah=studentId=>loadDb().settings?.diplomaNumbers?.[`${ACADEMIC_YEAR}|${studentId}`]?.number||null;

test('J1. TEST A: Nomor Ijazah kembali identik setelah backup lalu restore pada state kosong',()=>{
  const {a1,a2,b1}=siapkanDuaRombel();
  const backup=buildBackup(admin);
  assert.equal(Object.keys(backup.data.settings.diplomaNumbers).length,3,'ketiga nomor ikut ke berkas backup');

  useMemoryStorage();
  assert.equal(nomorIjazah(a1.id),null,'state benar-benar kosong sebelum restore');
  restoreBackup(backup,admin);
  assert.equal(nomorIjazah(a1.id),IJAZAH.a);
  assert.equal(nomorIjazah(a2.id),IJAZAH.b);
  assert.equal(nomorIjazah(b1.id),IJAZAH.c);
  assert.equal(Object.keys(loadDb().settings.diplomaNumbers).length,3,'tidak ada nomor yang hilang maupun berlipat');
});

test('J2. TEST B: dua rombel, Nomor Ijazah tidak tertukar dan tidak berpindah rombel',()=>{
  const {enamA,enamB,a1,a2,b1}=siapkanDuaRombel();
  const backup=buildBackup(admin);
  useMemoryStorage();
  restoreBackup(backup,admin);
  /* Setiap nomor tetap melekat pada siswanya, dan siswanya tetap pada rombelnya. */
  const di6A=listStudents(enamA,{classId:'6A'}).map(item=>item.id);
  const di6B=listStudents(enamB,{classId:'6B'}).map(item=>item.id);
  assert.deepEqual([...di6A].sort(),[a1.id,a2.id].sort());
  assert.deepEqual(di6B,[b1.id]);
  assert.equal(nomorIjazah(a1.id),IJAZAH.a);
  assert.equal(nomorIjazah(a2.id),IJAZAH.b);
  assert.equal(nomorIjazah(b1.id),IJAZAH.c);
  /* Tidak ada satu nomor pun yang dipegang dua siswa. */
  const nomor=Object.values(loadDb().settings.diplomaNumbers).map(item=>item.number);
  assert.equal(new Set(nomor).size,nomor.length,'tidak ada nomor ijazah duplikat setelah restore');
  /* Dan nomor rombel B benar-benar milik siswa rombel B. */
  const pemilik=Object.values(loadDb().settings.diplomaNumbers).find(item=>item.number===IJAZAH.c);
  assert.equal(pemilik.studentId,b1.id);
});

test('J3. TEST C: backup lama tanpa diplomaNumbers tetap dapat direstore',()=>{
  const {a1}=siapkanDuaRombel();
  const backup=buildBackup(admin);
  /* Berkas rilis lama tidak mengenal koleksi ini sama sekali. */
  delete backup.data.settings;
  useMemoryStorage();
  restoreBackup(backup,admin);
  assert.deepEqual(loadDb().settings,{},'restore berhasil dan koleksinya kosong, bukan galat');
  assert.equal(nomorIjazah(a1.id),null);
  assert.ok(listStudents(guru('6A'),{classId:'6A'}).length,'data lain tetap pulih seperti biasa');
});

test('J4. TEST D: payload tanpa diplomaNumbers tidak menghapus data di luar semantics restore',()=>{
  /* Restore Admin memang mengganti seluruh database - itulah semantics-nya, dan berkas tanpa
     settings tidak boleh membuatnya gagal. Yang diperiksa di sini: restore GURU, yang memang
     bersifat menimpa sebagian, TIDAK BOLEH menyentuh Nomor Ijazah milik Admin sama sekali. */
  const {enamA,a1,a2,b1}=siapkanDuaRombel();
  const backupGuru=buildBackup(enamA);
  assert.deepEqual(backupGuru.data.settings,{},'backup Guru tidak membawa data Admin');
  restoreBackup(backupGuru,enamA);
  assert.equal(nomorIjazah(a1.id),IJAZAH.a,'nomor rombel yang direstore tetap utuh');
  assert.equal(nomorIjazah(a2.id),IJAZAH.b);
  assert.equal(nomorIjazah(b1.id),IJAZAH.c,'nomor rombel lain sama sekali tidak tersentuh');
});

test('J5. settings adalah koleksi global, dan backup Guru dilarang membawanya',()=>{
  const sumber=read('src/services/backup.js');
  assert.match(sumber,/const GLOBAL_COLLECTIONS=\[[^\]]*'settings'/,'settings terdaftar sebagai koleksi global');
  assert.equal(/const SCOPED_COLLECTIONS=\[\n\s*'settings'/.test(sumber),false,'settings tidak lagi dianggap koleksi rombel');
  assert.match(sumber,/const LATER_COLLECTIONS=\['settings'/,'berkas backup lama tanpa settings tetap diterima');
  /* Penjaga yang membuat larangan itu berlaku juga untuk settings. */
  const {enamA}=siapkanDuaRombel();
  const backupGuru=buildBackup(enamA);
  backupGuru.data.settings={diplomaNumbers:{[`${ACADEMIC_YEAR}|palsu`]:{studentId:'palsu',number:'X',academicYear:ACADEMIC_YEAR}}};
  assert.throws(()=>restoreBackup(backupGuru,enamA),/tidak boleh memuat data global settings/i,
    'Guru tidak dapat menyelundupkan Nomor Ijazah lewat berkas backup yang disunting');
});

test('J6. Empat koleksi TRANSKRIP-SKL-SKKB lain tetap terlindungi backup dan restore',()=>{
  const {enamA,a1}=siapkanDuaRombel();
  saveTranscriptScores(enamA,a1.id,{[MAPEL_AKTIF[0]]:88},{partial:true});
  saveGraduationStatus(enamA,a1.id,'GRADUATED');
  saveStudentDocuments(admin,[{studentId:a1.id,transcriptNumber:'TR-J6',sklNumber:'SKL-J6',
    skkbNumber:'SKKB-J6',examNumber:'UJI-J6',conductPredicate:'Baik'}]);
  saveGraduationSettings(admin,{graduationDate:'2026-05-02',documentDate:'2026-06-02',documentCity:'Kota J6'});

  const backup=buildBackup(admin);
  for(const koleksi of ['teacherAssignments','graduationDocuments','graduationSettings','transcriptScores','graduationStatus','settings'])
    assert.ok(Object.keys(backup.data[koleksi]||{}).length,`${koleksi} ikut ke dalam berkas backup`);

  useMemoryStorage();
  restoreBackup(backup,admin);
  const db=loadDb();
  assert.ok(Object.keys(db.teacherAssignments).length,'penugasan Guru pulih');
  assert.equal(getStudentDocument(admin,a1.id).transcriptNumber,'TR-J6');
  assert.equal(getStudentDocument(admin,a1.id).conductPredicate,'Baik');
  assert.equal(getGraduationSettings(admin).documentCity,'Kota J6');
  assert.equal(nomorIjazah(a1.id),IJAZAH.a);
  assert.equal(buildTranscriptDocument(admin,'6A',a1.id).rows[0].score,88);
  assert.equal(buildSklDocument(admin,'6A',a1.id).statusLabel,'LULUS');
});
