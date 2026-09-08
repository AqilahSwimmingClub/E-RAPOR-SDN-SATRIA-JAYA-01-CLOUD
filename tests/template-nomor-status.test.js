import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveSchoolMaster } from '../src/services/master.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { invalidateDbCache } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { createWorkbookBytes, readWorkbookRows, cellText } from '../src/services/excel.js';
import { getDiplomaNumber } from '../src/services/transcript-admin.js';
import { getGraduationStatus } from '../src/services/completeness.js';
import { NUMBER_STATUS_HEADERS, NUMBER_STATUS_TEXT_COLUMNS, buildSklDocument, buildSkkbDocument,
  buildTranscriptDocument, commitNumberStatusImport, getStudentDocument, numberStatusTemplate,
  previewNumberStatusImport } from '../src/services/graduation-documents.js';

/* TEMPLATE EXCEL NOMOR & STATUS DOKUMEN.

   Yang diuji di sini bukan sekadar bentuk templatenya, melainkan perjalanan datanya: berkas
   .xlsx sungguhan ditulis, dibaca kembali, diacak urutan barisnya, lalu diimport - persis
   yang dilakukan operator sekolah di laptop. Nomor dokumen diperlakukan sebagai TEKS di
   sepanjang jalur itu, sebab nol di depan dan notasi ilmiah merusak nomor ijazah tanpa
   memberi tanda apa pun kepada penggunanya. */

function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();return values;}

const admin={role:'admin',classId:null,academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`};
const guru=(classId='6A')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`});
const SEKOLAH={name:'SD Negeri Harapan Jaya 02',npsn:'20987654',status:'Negeri',registrationNumber:'101010101010',
  phone:'0215556666',address:'Jln. Kp. Melati Rt. 001/003',village:'Harapan Jaya',district:'Tambun Utara',
  city:'Kabupaten Contoh',province:'Jawa Barat',postalCode:'17510',email:'a@b.sch.id',
  principalName:'Hj. Siti Aminah, S.Pd.',principalNip:'196812311994032010'};
/* NISN sengaja berawalan nol dan berdigit banyak: dua bentuk yang paling mudah dirusak Excel. */
const SISWA=Object.freeze([
  {nis:'301',nisn:'0071234567',name:'Ayu Lestari'},
  {nis:'302',nisn:'0089999888',name:'Budi Santoso'},
  {nis:'303',nisn:'0093333222',name:'Citra Dewi'},
]);
function siapkan(classId='6A'){
  useMemoryStorage();
  saveSchoolMaster(admin,SEKOLAH);
  const scope=guru(classId);
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:['agama','mtk'].includes(item.id),order:index+1})));
  for(const item of SISWA)createStudent(scope,{classId,nis:item.nis,nisn:item.nisn,name:item.name,
    gender:'P',birthPlace:'Bekasi',birthDate:'2013-01-05',parentName:'Wali',religion:'Islam'});
  return {scope,siswa:listStudents(scope,{classId})};
}
const ISI=new Map([
  ['0071234567',{ijazah:'DN-11 D0-0011223344',tr:'400.3.11.1/278/SDN/VI/2026',skl:'400.3.5/337/Disdik/V/2026',skkb:'DK.02/414/SDN/VI/2026',uji:'12-0120-031-2',status:'LULUS',pred:'BAIK'}],
  ['0089999888',{ijazah:'DN-11 D1-0011223355',tr:'400.3.11.1/279/SDN/VI/2026',skl:'400.3.5/338/Disdik/V/2026',skkb:'DK.02/415/SDN/VI/2026',uji:'12-0120-032-3',status:'TIDAK LULUS',pred:'SANGAT BAIK'}],
  ['0093333222',{ijazah:'DN-11 D2-0011223366',tr:'400.3.11.1/280/SDN/VI/2026',skl:'400.3.5/339/Disdik/V/2026',skkb:'DK.02/416/SDN/VI/2026',uji:'12-0120-033-4',status:'LULUS',pred:'CUKUP'}],
]);
const H=[...NUMBER_STATUS_HEADERS];
function baris(nisn,nama,d={}){return [d.no??1,nisn,nama,d.ijazah??'',d.tr??'',d.skl??'',d.skkb??'',d.uji??'',d.status??'',d.pred??''];}
/* Menulis lalu membaca kembali berkas xlsx yang sesungguhnya, bukan menyalin array. */
function lewatExcel(rows,textColumns=NUMBER_STATUS_TEXT_COLUMNS){
  const bytes=createWorkbookBytes('UJI',rows,{textColumns:[...textColumns]});
  return readWorkbookRows(bytes.buffer?bytes.buffer:bytes);
}
const headerIndex=matrix=>matrix.findIndex(row=>row.some(cell=>String(cell??'').trim().toLowerCase()==='nis/nisn'));

test('T1. Identitas template diambil dari Data Sekolah, rombel, dan tahun aktif',()=>{
  siapkan();
  const t=numberStatusTemplate(admin,'6A');
  assert.deepEqual(t.identity,[['Satuan Pendidikan',SEKOLAH.name],['NPSN',SEKOLAH.npsn],
    ['Rombel','6A'],['Tahun Pelajaran',ACADEMIC_YEAR]]);
  /* Sekolah lain mendapat identitasnya sendiri - tidak ada yang ditanam di kode. */
  saveSchoolMaster(admin,{...SEKOLAH,name:'SD Negeri Melati 07',npsn:'99998888'});
  const lain=numberStatusTemplate(admin,'6A');
  assert.deepEqual(lain.identity.slice(0,2),[['Satuan Pendidikan','SD Negeri Melati 07'],['NPSN','99998888']]);
  const kode=[t,lain].map(item=>JSON.stringify(item.rows)).join(' ');
  assert.equal(/Satria Jaya|20218098/.test(kode),false,'tidak ada identitas sekolah tertentu yang ditanam');
});

test('T2. Template tepat 10 kolom dengan urutan yang ditetapkan, tanpa kolom mata pelajaran',()=>{
  siapkan();
  const t=numberStatusTemplate(admin,'6A');
  assert.deepEqual(NUMBER_STATUS_HEADERS,['No','NIS/NISN','Nama Siswa','No. Ijazah','No. Transkrip',
    'No. SKL','No. SKKB','No. Peserta Ujian','Status SKL','Predikat SKKB']);
  const header=t.rows[headerIndex(t.rows)];
  assert.equal(header.length,10,'tepat sepuluh kolom');
  assert.deepEqual(header,[...NUMBER_STATUS_HEADERS]);
  /* Tidak boleh ada kolom nilai mata pelajaran seperti pada template Import Data & Nilai. */
  for(const mapel of ['Matematika','Pendidikan Agama Islam dan Budi Pekerti','Bahasa Indonesia'])
    assert.equal(header.includes(mapel),false,`kolom ${mapel} tidak boleh ada`);
  for(const row of t.rows.slice(headerIndex(t.rows)+1))assert.equal(row.length,10);
});

test('T3. No, NIS/NISN, dan Nama Siswa terisi otomatis dari Data Siswa rombel terpilih',()=>{
  const {siswa}=siapkan();
  const t=numberStatusTemplate(admin,'6A');
  const rows=t.rows.slice(headerIndex(t.rows)+1);
  assert.equal(rows.length,siswa.length);
  rows.forEach((row,index)=>{
    assert.equal(row[0],index+1,'No berurutan 1..N');
    assert.equal(row[1],siswa[index].nisn||siswa[index].nis);
    assert.equal(row[2],siswa[index].name);
  });
  /* Rombel lain menghasilkan daftar siswanya sendiri. */
  siapkan('5B');
  const lain=numberStatusTemplate(admin,'5B');
  assert.equal(lain.classId,'5B');
  assert.equal(lain.identity[2][1],'5B');
});

test('T4. Nomor bertahan sebagai teks melewati berkas Excel yang sesungguhnya',()=>{
  siapkan();
  const t=numberStatusTemplate(admin,'6A');
  const kembali=lewatExcel(t.rows,t.textColumns);
  const hi=headerIndex(kembali);
  const nisn=kembali.slice(hi+1).map(row=>String(row[1]));
  assert.deepEqual(nisn,SISWA.map(item=>item.nisn),'nol di depan tetap utuh setelah melewati Excel');
  for(const nilai of nisn)assert.ok(nilai.startsWith('0'),`NISN ${nilai} kehilangan nol di depan`);
  /* Nomor panjang dan nomor bertanda / . - tetap utuh melewati Excel. */
  const panjang='1234567890123456';
  const uji=lewatExcel([[...H],baris('0071234567','Ayu Lestari',{ijazah:panjang,skl:'400.3.5/337/Disdik/V/2026',uji:'12-0120-031-2'})],t.textColumns);
  const isi=uji[headerIndex(uji)+1];
  assert.equal(String(isi[3]),panjang,'nomor panjang tidak berubah menjadi notasi ilmiah');
  assert.equal(String(isi[5]),'400.3.5/337/Disdik/V/2026','garis miring dan titik utuh');
  assert.equal(String(isi[7]),'12-0120-031-2','tanda hubung utuh');
  /* Bila Excel terlanjur menyimpan nomor sebagai bilangan, pembacaannya tetap teks penuh. */
  assert.equal(cellText(1.2345678901234e21),'1234567890123400000000');
  assert.equal(cellText(12345678901234),'12345678901234');
});

test('T5. Round-trip: isi template, acak urutan baris, import - data tetap ke siswa yang benar',()=>{
  const {scope,siswa}=siapkan();
  const t=numberStatusTemplate(admin,'6A');
  const kembali=lewatExcel(t.rows,t.textColumns);
  const hi=headerIndex(kembali);
  const terisi=kembali.slice(hi+1).map(row=>{const d=ISI.get(String(row[1]));
    return [row[0],row[1],row[2],d.ijazah,d.tr,d.skl,d.skkb,d.uji,d.status,d.pred];});
  /* URUTAN DIBALIK - pencocokan tidak boleh bergantung pada nomor baris. */
  const diacak=[terisi[2],terisi[0],terisi[1]];
  assert.notDeepEqual(diacak.map(row=>row[1]),terisi.map(row=>row[1]),'urutan benar-benar berubah');
  const matrix=lewatExcel([...kembali.slice(0,hi+1),...diacak],t.textColumns);
  const preview=previewNumberStatusImport(admin,'6A',matrix);
  assert.equal(preview.invalidCount,0,JSON.stringify(preview.rows.flatMap(row=>row.errors)));
  assert.equal(preview.canCommit,true);
  const ringkas=commitNumberStatusImport(admin,'6A',preview);
  assert.deepEqual(ringkas,{students:3,diplomas:3,statuses:3,classId:'6A'});
  for(const student of siswa){
    const harap=ISI.get(String(student.nisn));
    const record=getStudentDocument(admin,student.id);
    assert.equal(getDiplomaNumber(admin,student.id)?.number,harap.ijazah,`ijazah ${student.name}`);
    assert.equal(record.transcriptNumber,harap.tr);
    assert.equal(record.sklNumber,harap.skl);
    assert.equal(record.skkbNumber,harap.skkb);
    assert.equal(record.examNumber,harap.uji);
    assert.equal(record.conductPredicate.toUpperCase(),harap.pred);
    const status=getGraduationStatus(scope,student.id)?.status||'';
    assert.equal(status==='GRADUATED'?'LULUS':'TIDAK LULUS',harap.status);
  }
});

test('T6. Hasil import langsung dipakai Transkrip, SKL, dan SKKB',()=>{
  const {siswa}=siapkan();
  const t=numberStatusTemplate(admin,'6A');
  const kembali=lewatExcel(t.rows,t.textColumns);const hi=headerIndex(kembali);
  const terisi=kembali.slice(hi+1).map(row=>{const d=ISI.get(String(row[1]));
    return [row[0],row[1],row[2],d.ijazah,d.tr,d.skl,d.skkb,d.uji,d.status,d.pred];});
  commitNumberStatusImport(admin,'6A',previewNumberStatusImport(admin,'6A',[...kembali.slice(0,hi+1),...terisi]));
  const student=siswa.find(item=>item.nisn==='0071234567');
  const harap=ISI.get('0071234567');
  const transkrip=buildTranscriptDocument(admin,'6A',student.id);
  assert.equal(transkrip.number,harap.tr);
  assert.equal(transkrip.diplomaNumber,harap.ijazah);
  const skl=buildSklDocument(admin,'6A',student.id);
  assert.equal(skl.number,harap.skl);
  assert.equal(skl.statusLabel,'LULUS');
  const skkb=buildSkkbDocument(admin,'6A',student.id);
  assert.equal(skkb.number,harap.skkb);
  assert.equal(skkb.examNumber,harap.uji);
  assert.equal(skkb.predicate,'Baik');
});

test('T7. Baris bermasalah ditolak: siswa asing, duplikat, dan domain yang salah',()=>{
  siapkan();
  const kasus=[
    ['siswa asing',[baris('9999999999','Orang Luar',{ijazah:'IJZ-2'})],'tidak ada pada rombel'],
    ['duplikat',[baris('0071234567','Ayu Lestari',{ijazah:'A'}),baris('0071234567','Ayu Lestari',{ijazah:'B'})],'lebih dari satu kali'],
    ['Status SKL asing',[baris('0071234567','Ayu Lestari',{status:'LULUS BERSYARAT'})],'LULUS atau TIDAK LULUS'],
    ['Predikat SKKB asing',[baris('0071234567','Ayu Lestari',{pred:'ISTIMEWA'})],'Sangat Baik, Baik, Cukup'],
    ['NIS/NISN kosong',[baris('','Tanpa Nomor',{ijazah:'X'})],'NIS/NISN kosong'],
    ['nama salah tempel',[baris('0071234567','Nama Lain',{ijazah:'X'})],'tidak cocok'],
  ];
  for(const [nama,rows,penggalan] of kasus){
    const preview=previewNumberStatusImport(admin,'6A',[[...H],...rows]);
    assert.equal(preview.canCommit,false,`${nama} seharusnya ditolak`);
    assert.ok(preview.rows.flatMap(row=>row.errors).some(pesan=>pesan.includes(penggalan)),
      `${nama}: pesan menjelaskan sebabnya`);
  }
});

test('T8. Domain SKL dan SKKB tidak pernah tertukar',()=>{
  siapkan();
  /* Predikat diisi nilai milik Status, dan sebaliknya - keduanya harus ditolak. */
  const silang=previewNumberStatusImport(admin,'6A',[[...H],baris('0071234567','Ayu Lestari',{pred:'LULUS'})]);
  assert.equal(silang.canCommit,false,'LULUS bukan predikat kelakuan');
  const balik=previewNumberStatusImport(admin,'6A',[[...H],baris('0071234567','Ayu Lestari',{status:'SANGAT BAIK'})]);
  assert.equal(balik.canCommit,false,'SANGAT BAIK bukan status kelulusan');
  /* Ketiga predikat sah tetap diterima, ditulis huruf besar maupun campuran. */
  for(const pred of ['CUKUP','Baik','sangat baik']){
    const ok=previewNumberStatusImport(admin,'6A',[[...H],baris('0071234567','Ayu Lestari',{pred})]);
    assert.equal(ok.canCommit,true,`${pred} seharusnya diterima`);
  }
  for(const status of ['LULUS','TIDAK LULUS']){
    const ok=previewNumberStatusImport(admin,'6A',[[...H],baris('0071234567','Ayu Lestari',{status})]);
    assert.equal(ok.canCommit,true,`${status} seharusnya diterima`);
  }
});

test('T9. Satu baris fatal membatalkan seluruh import - nol penyimpanan sebagian',()=>{
  const {siswa}=siapkan();
  const campur=[[...H],
    baris('0071234567','Ayu Lestari',{ijazah:'IJZ-VALID',tr:'TR-1',pred:'BAIK'}),
    baris('0089999888','Budi Santoso',{ijazah:'IJZ-X',pred:'PREDIKAT TIDAK ADA'})];
  const preview=previewNumberStatusImport(admin,'6A',campur);
  assert.equal(preview.validCount,1,'baris pertama memang valid');
  assert.equal(preview.canCommit,false);
  assert.throws(()=>commitNumberStatusImport(admin,'6A',preview),/Predikat SKKB/);
  /* Termasuk baris yang tadinya valid: tidak satu pun boleh tersimpan. */
  for(const student of siswa){
    const record=getStudentDocument(admin,student.id);
    assert.equal(getDiplomaNumber(admin,student.id)?.number||'','',`ijazah ${student.name} tidak tersimpan`);
    assert.equal(record.transcriptNumber,'');
    assert.equal(record.conductPredicate,'');
  }
});

test('T10. Import memakai penyimpanan yang sudah ada, bukan database kedua',()=>{
  const {siswa}=siapkan();
  const t=numberStatusTemplate(admin,'6A');
  const kembali=lewatExcel(t.rows,t.textColumns);const hi=headerIndex(kembali);
  const terisi=kembali.slice(hi+1).map(row=>{const d=ISI.get(String(row[1]));
    return [row[0],row[1],row[2],d.ijazah,d.tr,d.skl,d.skkb,d.uji,d.status,d.pred];});
  commitNumberStatusImport(admin,'6A',previewNumberStatusImport(admin,'6A',[...kembali.slice(0,hi+1),...terisi]));
  const db=JSON.parse(globalThis.localStorage.getItem('erapor_satria_jaya_01_v1'));
  /* Nomor ijazah tetap di settings.diplomaNumbers; sisanya di graduationDocuments; status di
     graduationStatus. Tidak ada koleksi baru yang lahir dari import ini. */
  assert.ok(db.settings?.diplomaNumbers,'nomor ijazah tetap pada settings.diplomaNumbers');
  assert.ok(db.graduationDocuments,'nomor surat tetap pada graduationDocuments');
  assert.ok(db.graduationStatus,'status kelulusan tetap pada graduationStatus');
  for(const kunci of Object.keys(db))
    assert.equal(/numberStatus|nomorStatus|documentImport/i.test(kunci),false,
      `koleksi ${kunci} tidak boleh dibuat oleh import Nomor & Status`);
  const student=siswa.find(item=>item.nisn==='0071234567');
  assert.equal(Object.values(db.settings.diplomaNumbers).some(item=>item.studentId===student.id&&item.number===ISI.get('0071234567').ijazah),true);
});

test('T11. Status SKL hanya diterima pada rombel kelas 6',()=>{
  siapkan('5B');
  const preview=previewNumberStatusImport(admin,'5B',[[...H],baris('0071234567','Ayu Lestari',{status:'LULUS'})]);
  assert.equal(preview.canCommit,false,'kelas 5 tidak mengenal status kelulusan');
  assert.ok(preview.rows.flatMap(row=>row.errors).some(pesan=>pesan.includes('kelas 6')));
  /* Tanpa Status SKL, rombel non-kelas-6 tetap boleh menerima nomor dokumennya. */
  const tanpa=previewNumberStatusImport(admin,'5B',[[...H],baris('0071234567','Ayu Lestari',{ijazah:'IJZ-5'})]);
  assert.equal(tanpa.canCommit,true);
});

test('T12. Header yang diubah atau berkas asing ditolak dengan pesan yang jelas',()=>{
  siapkan();
  assert.throws(()=>previewNumberStatusImport(admin,'6A',[['Nama','Nilai'],['Ayu',80]]),/header tidak ditemukan/i);
  assert.throws(()=>previewNumberStatusImport(admin,'6A',[[...H,'Matematika'],[...baris('0071234567','Ayu Lestari'),90]]),
    /tidak dikenali/i,'kolom mata pelajaran bukan bagian template ini');
  /* Hanya Admin yang boleh mengunduh maupun mengimport. */
  assert.throws(()=>numberStatusTemplate(guru(),'6A'),/Hanya Admin/);
  assert.throws(()=>previewNumberStatusImport(guru(),'6A',[[...H]]),/Hanya Admin/);
});
