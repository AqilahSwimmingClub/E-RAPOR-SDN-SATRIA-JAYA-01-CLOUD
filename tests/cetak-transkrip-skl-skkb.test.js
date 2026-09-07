import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { saveSchoolMaster } from '../src/services/master.js';
import { createStudent, listStudents } from '../src/services/students.js';
import { saveGraduationStatus } from '../src/services/completeness.js';
import { saveTranscriptScores } from '../src/services/transcript.js';
import { saveDiplomaNumbers } from '../src/services/transcript-admin.js';
import { invalidateDbCache } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';
import { buildClassDocuments, saveGraduationSettings, saveStudentDocuments } from '../src/services/graduation-documents.js';
import { sklSheet, skkbSheet, transcriptSheet } from '../src/pages/graduation-print.js';

/* CETAK TRANSKRIP-SKL-SKKB: SATU SISWA DAN SATU ROMBEL PENUH.

   Bug yang paling mahal pada cetak massal bukan tata letak, melainkan KEBOCORAN STATE: siswa
   kedua menerima nilai, nomor, status, atau predikat milik siswa yang tadi dipratinjau. Suite
   ini karena itu sengaja memberi ketiga siswa data yang SELURUHNYA berbeda - nilai, nomor
   surat, status kelulusan, dan predikat - lalu memeriksa bahwa tak satu pun milik siswa lain
   muncul pada lembar seseorang. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
function useMemoryStorage(){const values=new Map();globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};invalidateDbCache();return values;}

const admin={role:'admin',classId:null,academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`};
const guru=(classId='6A')=>({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester:`Genap ${ACADEMIC_YEAR}`});
const MAPEL=Object.freeze(['agama','pancasila','bindo','mtk']);
const SEKOLAH={name:'SD Negeri Harapan Bangsa 09',npsn:'55556666',status:'Negeri',registrationNumber:'303030303030',
  phone:'0215556666',address:'Jalan Harapan Nomor 9',village:'Harapan',district:'Bangsa Jaya',city:'Kabupaten Harapan',
  province:'Provinsi Bangsa',postalCode:'12345',website:'harapan.sch.id',email:'admin@harapan.sch.id',
  principalName:'Ahmad Fauzi, S.Pd., M.M.',principalNip:'197505052000031003',
  regionLogo:'data:image/png;base64,HHHH'};

/* Tiga siswa dengan watak berbeda persis seperti yang diminta: nama pendek dengan LULUS/BAIK,
   nama panjang dengan TIDAK LULUS/SANGAT BAIK, dan satu lagi tanpa status dengan CUKUP. */
const SISWA=Object.freeze([
  {nis:'301',nisn:'3001',name:'Ayu Lestari',gender:'P',birthPlace:'Bekasi',birthDate:'2013-01-05',parentName:'Karim',religion:'Islam',
   nilai:[70,71,72,73],status:'GRADUATED',predikat:'Baik',ijazah:'IJZ-A-001',transkrip:'TR-A-001',skl:'SKL-A-001',skkb:'SKKB-A-001',ujian:'UJI-A-001'},
  {nis:'302',nisn:'3002',name:'Muhammad Rizky Ananda Pratama Wijayakusuma Nugroho',gender:'L',birthPlace:'Kabupaten Bandung Barat',birthDate:'2012-11-03',parentName:'Bambang Sutrisno Hadiwijaya',religion:'Islam',
   nilai:[80,81,82,83],status:'NOT_GRADUATED',predikat:'Sangat Baik',ijazah:'IJZ-B-002',transkrip:'TR-B-002',skl:'SKL-B-002',skkb:'SKKB-B-002',ujian:'UJI-B-002'},
  {nis:'303',nisn:'3003',name:'Citra Dewi',gender:'P',birthPlace:'Kota Administrasi Jakarta Selatan',birthDate:'2013-07-21',parentName:'Sutrisno Wibowo Hadinata',religion:'Islam',
   nilai:[90,91,92,93],status:'',predikat:'Cukup',ijazah:'IJZ-C-003',transkrip:'TR-C-003',skl:'SKL-C-003',skkb:'SKKB-C-003',ujian:'UJI-C-003'},
]);

/* listStudents mengurutkan siswa menurut abjad nama, dan itulah urutan yang dipakai seluruh
   halaman. Ekspektasi test karena itu diindeks per id siswa, bukan per urutan pembuatan. */
function berurut(scope,classId='6A'){return listStudents(scope,{classId}).map(item=>item.id);}
function siapkan({classId='6A'}={}){
  useMemoryStorage();
  saveSchoolMaster(admin,SEKOLAH);
  const scope=guru(classId);
  saveSubjectMapping(scope,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:MAPEL.includes(item.id),order:index+1})));
  saveGraduationSettings(admin,{graduationDate:'2026-05-02',documentDate:'2026-07-13',documentCity:'Kabupaten Harapan'});
  const dibuat=SISWA.map(item=>{
    const murid=createStudent(scope,{classId,nis:item.nis,nisn:item.nisn,name:item.name,gender:item.gender,
      birthPlace:item.birthPlace,birthDate:item.birthDate,parentName:item.parentName,religion:item.religion});
    const aktif=MAPEL.filter(id=>id!=='agama_kristen');
    const values={};aktif.forEach((id,index)=>{values[id]=item.nilai[index];});
    saveTranscriptScores(scope,murid.id,values,{partial:true});
    saveStudentDocuments(admin,[{studentId:murid.id,transcriptNumber:item.transkrip,sklNumber:item.skl,
      skkbNumber:item.skkb,examNumber:item.ujian,conductPredicate:item.predikat}]);
    saveDiplomaNumbers(admin,[{studentId:murid.id,number:item.ijazah}]);
    if(item.status)saveGraduationStatus(scope,murid.id,item.status);
    return {...item,id:murid.id};
  });
  return {scope,siswa:dibuat};
}

const hitungLembar=html=>(html.match(/class="document-a4 letter-a4/g)||[]).length;

/* ============================================================ §32 CETAK TRANSKRIP */

test('C1. Transkrip satu siswa hanya memuat siswa itu',()=>{
  const {siswa}=siapkan();
  const doc=buildClassDocuments(admin,'6A','TRANSKRIP')[0];
  const diri=siswa.find(item=>item.id===doc.student.id);
  const html=transcriptSheet(doc);
  assert.equal(hitungLembar(html),1,'tepat satu lembar');
  assert.ok(html.includes(diri.name));
  assert.ok(html.includes(diri.transkrip)&&html.includes(diri.ijazah));
  for(const lain of siswa.filter(item=>item.id!==diri.id))
    for(const jejak of [lain.name,lain.transkrip,lain.ijazah,lain.skkb])
      assert.equal(html.includes(jejak),false,`lembar satu siswa tidak boleh memuat ${jejak}`);
  /* Nilai siswa lain juga tidak boleh menyusup. */
  assert.deepEqual(doc.rows.map(row=>row.score),diri.nilai);
});

test('C2. Cetak Semua Transkrip: satu dokumen per siswa, urut, tanpa data tertukar',()=>{
  const {scope,siswa}=siapkan();
  const docs=buildClassDocuments(admin,'6A','TRANSKRIP');
  const olehId=new Map(siswa.map(item=>[item.id,item]));
  assert.equal(docs.length,siswa.length,'jumlah dokumen sama dengan jumlah siswa aktif');
  assert.deepEqual(docs.map(doc=>doc.student.id),berurut(scope),'urutan siswa mengikuti urutan aplikasi');
  for(const doc of docs){
    const diri=olehId.get(doc.student.id);
    assert.equal(doc.student.name,diri.name);
    assert.equal(doc.number,diri.transkrip);
    assert.equal(doc.diplomaNumber,diri.ijazah);
    assert.deepEqual(doc.rows.map(row=>row.score),diri.nilai,'nilai diambil dari siswa yang sedang dirender');
  }
  const html=docs.map(transcriptSheet).join('');
  assert.equal(hitungLembar(html),3,'tiga lembar terpisah');
  /* Setiap potongan lembar hanya boleh memuat identitas dan nomor miliknya sendiri. */
  const potongan=html.split('<section class="document-a4 letter-a4').slice(1);
  potongan.forEach((bagian,index)=>{
    const diri=olehId.get(docs[index].student.id);
    assert.ok(bagian.includes(diri.name)&&bagian.includes(diri.transkrip));
    for(const lain of siswa.filter(item=>item.id!==diri.id))
      for(const jejak of [lain.name,lain.transkrip,lain.ijazah])
        assert.equal(bagian.includes(jejak),false,`lembar ${index+1} membawa ${jejak} milik siswa lain`);
  });
});

test('C3. Cetak Semua Transkrip tetap satu daftar tanpa Kelompok A/B dan urut Mapping',()=>{
  siapkan();
  const html=buildClassDocuments(admin,'6A','TRANSKRIP').map(transcriptSheet).join('');
  for(const larangan of ['Kelompok A','Kelompok B','subject-group-row'])
    assert.equal(html.includes(larangan),false,`cetak semua tidak memuat ${larangan}`);
  for(const doc of buildClassDocuments(admin,'6A','TRANSKRIP')){
    assert.deepEqual(doc.rows.map(row=>row.number),[1,2,3,4]);
    assert.deepEqual(doc.rows.map(row=>row.subjectId),[...MAPEL]);
  }
});

/* ================================================================= §33 CETAK SKL */

test('C4. SKL satu siswa dan cetak semua: status per siswa tidak tertukar',()=>{
  const {siswa}=siapkan();
  const docs=buildClassDocuments(admin,'6A','SKL');
  const olehId=new Map(siswa.map(item=>[item.id,item]));
  const label={GRADUATED:'LULUS',NOT_GRADUATED:'TIDAK LULUS','':''};
  assert.equal(docs.length,3);
  assert.deepEqual(docs.map(doc=>doc.statusLabel),docs.map(doc=>label[olehId.get(doc.student.id).status]));
  const potongan=docs.map(sklSheet);
  assert.equal(hitungLembar(potongan.join('')),3);
  const putusan=potongan.map(html=>/<p class="letter-verdict">([^<]*)<\/p>/.exec(html)?.[1]||'');
  assert.deepEqual(putusan,docs.map(doc=>label[olehId.get(doc.student.id).status]||'BELUM DITETAPKAN'),
    'siswa tanpa status tidak pernah ikut dinyatakan lulus hanya karena siswa lain lulus');
  assert.deepEqual([...putusan].sort(),['BELUM DITETAPKAN','LULUS','TIDAK LULUS'],'ketiga keadaan benar-benar terwakili');
  for(const doc of docs){
    const diri=olehId.get(doc.student.id);
    assert.equal(doc.number,diri.skl);
    assert.deepEqual(doc.rows.map(row=>row.score),diri.nilai);
  }
  for(const html of potongan)
    for(const larangan of ['Kelompok A','Kelompok B'])
      assert.equal(html.includes(larangan),false);
});

/* ================================================================ §34 CETAK SKKB */

test('C5. SKKB satu siswa dan cetak semua: predikat dan nomor per siswa',()=>{
  const {siswa}=siapkan();
  const docs=buildClassDocuments(admin,'6A','SKKB');
  const olehId=new Map(siswa.map(item=>[item.id,item]));
  assert.equal(docs.length,3);
  assert.deepEqual(docs.map(doc=>doc.predicate),docs.map(doc=>olehId.get(doc.student.id).predikat));
  assert.deepEqual(docs.map(doc=>doc.number),docs.map(doc=>olehId.get(doc.student.id).skkb));
  assert.deepEqual(docs.map(doc=>doc.examNumber),docs.map(doc=>olehId.get(doc.student.id).ujian));
  const potongan=docs.map(skkbSheet);
  assert.equal(hitungLembar(potongan.join('')),3);
  const predikat=potongan.map(html=>/<p class="letter-verdict">([^<]*)<\/p>/.exec(html)?.[1]||'');
  assert.deepEqual(predikat,docs.map(doc=>olehId.get(doc.student.id).predikat.toUpperCase()));
  assert.deepEqual([...predikat].sort(),['BAIK','CUKUP','SANGAT BAIK'],'ketiga predikat benar-benar terwakili');
  /* SKKB tidak pernah memakai domain SKL, walau dicetak berbarengan. */
  for(const html of potongan)
    for(const larangan of ['LULUS','TIDAK LULUS'])
      assert.equal(html.includes(larangan),false,`SKKB tidak memakai ${larangan}`);
});

/* =========================================================== §35 A4 DAN §36 PAGE BREAK */

test('C6. Ketiga dokumen memakai A4 potret dengan mekanisme yang sama dengan Cetak Rapor',()=>{
  const gaya=read('src/styles/app.css');
  assert.match(gaya,/@page\{size:A4 portrait;margin:10mm\}/,'kertas bawaan A4 potret');
  /* Halaman cetak memakai setPrintPageSize milik Cetak Rapor, bukan mekanisme kedua. */
  const halaman=read('src/pages/transcript.js');
  assert.match(halaman,/import \{ setPrintPageSize \} from '\.\/print\.js';/);
  assert.match(halaman,/setPrintPageSize\('portrait','10mm 0'\)/,'A4 potret ditetapkan saat halaman cetak dibuka');
  assert.match(halaman,/setPrintPageSize\(null\)/,'aturan dilepas saat meninggalkan halaman');
  const cetakRapor=read('src/pages/print.js');
  assert.match(cetakRapor,/size:A4 \$\{orientation\};margin:\$\{margin\}/,'sumber aturan @page tetap satu');
  /* Margin kiri-kanan dibawa lembar, seperti Rapor, supaya cetak Android tidak menempel tepi. */
  assert.match(gaya,/\.letter-a4\{padding:0 13mm!important/);
});

test('C7. Setiap siswa mulai di halaman baru, tanpa halaman kosong di awal maupun akhir',()=>{
  const gaya=read('src/styles/app.css');
  /* break-before pada lembar KEDUA dan seterusnya: siswa pertama tidak didahului halaman
     kosong, dan siswa terakhir tidak diikuti halaman kosong karena tidak ada break-after. */
  assert.match(gaya,/\.letter-a4\+\.letter-a4\{break-before:page\}/);
  /* Aturan yang menyebut `.letter-a4` TANPA didahului `+` tidak boleh memaksa halaman baru:
     itulah yang akan menyisipkan halaman kosong sebelum siswa pertama. */
  assert.equal(/(^|[^+])\.letter-a4\{[^}]*break-before:page/m.test(gaya),false,'lembar pertama tidak memaksa halaman baru');
  assert.equal(/\.letter-a4[^{]*\{[^}]*break-after:page/.test(gaya),false,'tidak ada halaman kosong setelah lembar terakhir');
  /* Isi satu dokumen tidak boleh terbelah sembarangan. */
  assert.match(gaya,/\.letter-a4 \.letter-table tr\{break-inside:avoid\}/);
  assert.match(gaya,/\.letter-a4 \.letter-sign\{break-inside:avoid\}/);
  siapkan();
  const html=buildClassDocuments(admin,'6A','SKKB').map(skkbSheet).join('');
  assert.equal(hitungLembar(html),3,'tiga wadah lembar untuk tiga siswa');
  assert.equal(html.trim().startsWith('<section class="document-a4 letter-a4'),true,'tidak ada elemen sebelum lembar pertama');
  assert.equal(html.trim().endsWith('</section>'),true,'tidak ada elemen setelah lembar terakhir');
});

test('C8. Lembar cetak tidak pernah membawa elemen antarmuka aplikasi',()=>{
  siapkan();
  for(const [jenis,penyaji] of [['TRANSKRIP',transcriptSheet],['SKL',sklSheet],['SKKB',skkbSheet]]){
    const html=buildClassDocuments(admin,'6A',jenis).map(penyaji).join('');
    for(const larangan of ['<button','class="btn','data-print','data-student','no-print','print-tabs'])
      assert.equal(html.includes(larangan),false,`${jenis} tidak memuat ${larangan}`);
  }
  /* Kontrol cetak pada halaman memang ditandai no-print sehingga tidak ikut ke kertas. */
  const halaman=read('src/pages/transcript.js');
  assert.match(halaman,/report-print-control bulk-print-control no-print/);
  assert.match(halaman,/nav class="print-tabs no-print"/);
});

/* ===================================================== §17-§18, §23-§25 SETIAP LEMBAR UTUH */

test('C9. Setiap lembar membawa kop, lambang daerah, dan tanda tangan sendiri',()=>{
  siapkan();
  for(const [jenis,penyaji] of [['TRANSKRIP',transcriptSheet],['SKL',sklSheet],['SKKB',skkbSheet]]){
    const potongan=buildClassDocuments(admin,'6A',jenis).map(penyaji);
    assert.equal(potongan.length,3);
    for(const html of potongan){
      assert.equal((html.match(/class="letter-head"/g)||[]).length,1,`${jenis}: satu kop per lembar`);
      assert.equal((html.match(/class="letter-sign"/g)||[]).length,1,`${jenis}: satu tanda tangan per lembar`);
      assert.ok(html.includes('data:image/png;base64,HHHH'),`${jenis}: lambang daerah tampil pada setiap lembar`);
      assert.ok(html.includes(SEKOLAH.name)&&html.includes(SEKOLAH.principalName)&&html.includes(SEKOLAH.principalNip));
      assert.ok(html.includes('Kabupaten Harapan, 13 Juli 2026'),`${jenis}: tempat dan tanggal dari pengaturan`);
    }
  }
});

test('C10. Mengubah Data Sekolah langsung mengubah seluruh lembar cetak semua',()=>{
  siapkan();
  saveSchoolMaster(admin,{...SEKOLAH,name:'SD Swasta Cakrawala Baru',principalName:'Rina Marlina, M.Pd.',
    principalNip:'198009092005012004',regionLogo:'data:image/png;base64,ZZZZ'});
  for(const [jenis,penyaji] of [['TRANSKRIP',transcriptSheet],['SKL',sklSheet],['SKKB',skkbSheet]]){
    for(const html of buildClassDocuments(admin,'6A',jenis).map(penyaji)){
      assert.ok(html.includes('SD Swasta Cakrawala Baru')&&html.includes('Rina Marlina, M.Pd.'));
      assert.ok(html.includes('data:image/png;base64,ZZZZ'));
      for(const lama of [SEKOLAH.name,SEKOLAH.principalName,SEKOLAH.principalNip,'data:image/png;base64,HHHH'])
        assert.equal(html.includes(lama),false,`${jenis} masih membawa ${lama} milik sekolah lama`);
    }
  }
});

test('C11. Cetak Semua rombel lain tidak membawa siswa rombel ini',()=>{
  const {siswa}=siapkan();
  const lain=guru('6B');
  saveSubjectMapping(lain,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:MAPEL.includes(item.id),order:index+1})));
  const murid=createStudent(lain,{classId:'6B',nis:'401',nisn:'4001',name:'Bagas Pratama',gender:'L',
    birthPlace:'Bogor',birthDate:'2013-04-04',parentName:'Slamet',religion:'Islam'});
  saveStudentDocuments(admin,[{studentId:murid.id,transcriptNumber:'TR-6B-001'}]);
  const docs6b=buildClassDocuments(admin,'6B','TRANSKRIP');
  assert.equal(docs6b.length,1);
  assert.equal(docs6b[0].student.name,'Bagas Pratama');
  const html=docs6b.map(transcriptSheet).join('');
  for(const item of siswa)
    for(const jejak of [item.name,item.transkrip,item.ijazah])
      assert.equal(html.includes(jejak),false,`dokumen 6B membawa ${jejak} milik 6A`);
});

test('C12. Jenis dokumen yang tidak dikenal ditolak, bukan menghasilkan lembar kosong',()=>{
  siapkan();
  assert.throws(()=>buildClassDocuments(admin,'6A','IJAZAH'),/tidak dikenal/);
});

/* ===================================================== HURUF DOKUMEN RESMI: TIMES NEW ROMAN

   Surat dinas sekolah ditulis dengan huruf berkait, bukan dengan huruf antarmuka aplikasi.
   Yang dijaga di sini bukan sekadar "aturannya tertulis", melainkan tiga hal yang mudah
   rusak diam-diam: aturannya mencakup elemen bersarang, ukurannya dinyatakan dalam POINT
   (satuan kertas, bukan satuan layar), dan lembar Rapor tidak ikut terbawa. */

const gayaAplikasi=()=>read('src/styles/app.css');
/* Ambil isi satu blok aturan berdasarkan selektornya, apa adanya. */
function deklarasi(css,selektor){
  const pola=new RegExp(`(?:^|[};])\\s*${selektor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\{([^}]*)\\}`,'m');
  return pola.exec(css)?.[1]||null;
}
/* Blok @media print milik lembar surat - yang benar-benar berlaku saat mencetak. */
function blokCetakSurat(css){
  const kunci='.letter-a4{padding:0 13mm!important';
  const mulai=css.lastIndexOf('@media print{',css.indexOf(kunci));
  return css.slice(mulai,css.indexOf('\n}',mulai));
}

test('C13. Dokumen memakai Times New Roman, termasuk seluruh elemen bersarangnya',()=>{
  const gaya=gayaAplikasi();
  assert.match(gaya,/\.letter-a4,\.letter-a4 \*\{font-family:"Times New Roman",Times,serif\}/,
    'aturan berlaku untuk lembar DAN turunannya, sehingga span, strong, p, th, dan td tidak dapat kembali ke huruf aplikasi');
  /* Tidak boleh ada aturan lain yang mengembalikan lembar surat ke huruf tanpa kait. */
  for(const cocok of gaya.matchAll(/([^{}]*\.letter-[^{}]*)\{([^}]*font-family:[^};]*)/g))
    assert.match(cocok[2],/Times/,`aturan "${cocok[1].trim()}" tidak boleh memakai huruf selain Times`);
});

test('C14. Lembar Rapor tidak ikut berubah huruf',()=>{
  const gaya=gayaAplikasi();
  const dokumen=deklarasi(gaya,'.document-a4');
  assert.match(dokumen,/font-family:Arial,"Liberation Sans"/,'Rapor tetap memakai hurufnya sendiri');
  assert.equal(dokumen.includes('Times'),false);
  /* Aturan Times dipatok pada kelas surat, bukan pada wadah A4 yang dipakai bersama. */
  assert.equal(/\.document-a4[^{,]*\{[^}]*Times/.test(gaya),false,
    'huruf Times tidak boleh dipasang pada wadah A4 yang juga dipakai Rapor');
});

test('C15. Ukuran isi dokumen dinyatakan dalam point: 12pt, tabel 11pt',()=>{
  const gaya=gayaAplikasi();
  const cetak=blokCetakSurat(gaya);
  /* Layar lebar dan media cetak sama-sama diperiksa: keduanya yang dilihat dan dicetak. */
  for(const [nama,sumber] of [['layar',gaya],['cetak',cetak]]){
    assert.match(deklarasi(sumber,'.letter-a4'),/font-size:12pt/,`${nama}: isi surat 12pt`);
    assert.match(deklarasi(sumber,'.letter-table th,.letter-table td'),/font-size:11pt/,`${nama}: tabel nilai 11pt`);
    assert.match(deklarasi(sumber,'.letter-title h1'),/font-size:14pt/,`${nama}: judul lebih besar sesuai hierarki`);
  }
  /* Identitas, nomor surat, dan tanda tangan ikut 12pt lewat satu aturan bersama. */
  assert.match(cetak,/\.letter-title p,\.letter-identity td,\.letter-sign-block,\.letter-sign-block small\{font-size:12pt\}/);
  /* Tidak ada bagian isi yang diam-diam turun di bawah 11pt saat mencetak. */
  const ukuranCetak=[...cetak.matchAll(/font-size:([\d.]+)pt/g)].map(item=>Number(item[1]));
  assert.ok(ukuranCetak.length>=6,'ukuran cetak memang dinyatakan ulang, bukan diwarisi aturan layar sempit');
  const isi=ukuranCetak.filter(nilai=>nilai<14);
  assert.ok(Math.min(...isi)>=9,`bagian terkecil pada kertas ${Math.min(...isi)}pt masih wajar untuk alamat kop`);
  assert.ok(isi.filter(nilai=>nilai>=11).length>=4,'bagian isi utama berada pada 11-12pt');
  /* Tidak ada satu pun ukuran piksel tersisa pada aturan huruf lembar surat. */
  assert.equal(/\.letter-[a-z-]*[^{}]*\{[^}]*font-size:[\d.]+px/.test(gaya),false,
    'ukuran huruf surat seluruhnya dalam point, bukan piksel');
});

test('C16. Spacing tetap rapat setelah pergantian huruf',()=>{
  const gaya=gayaAplikasi();
  assert.match(deklarasi(gaya,'.letter-a4'),/line-height:1\.32/,'jarak antarbaris tetap rapat');
  assert.match(deklarasi(gaya,'.letter-identity td'),/padding:0/,'baris identitas tidak diberi jarak tambahan');
  assert.match(deklarasi(gaya,'.letter-body'),/margin:0 0 6px/,'jarak antarparagraf tetap kecil');
  assert.match(deklarasi(gaya,'.letter-sign'),/margin-top:12px/,'tanda tangan tidak dijauhkan dari isi');
  assert.match(deklarasi(gaya,'.letter-sign-block strong'),/margin-top:50px/,'ruang bubuh tanda tangan tetap secukupnya');
  /* Tidak ada tinggi minimum besar yang dipakai sekadar memenuhi halaman. */
  assert.equal(/\.letter-[a-z-]*[^{}]*\{[^}]*min-height:\s*[2-9]\d\dpx/.test(gaya),false);
});

/* ============================================ BARIS REKAP NILAI RATA-RATA (SKL DAN TRANSKRIP)

   Sebelumnya labelnya rata kanan sehingga menempel ke garis kolom Nilai dan terbaca seperti
   catatan kecil. Sekarang ia baris rekap tersendiri: label di TENGAH area No + Mata Pelajaran,
   angka di TENGAH kolom Nilai.

   Yang dijaga di sini bukan sekadar "aturannya tertulis" melainkan NILAI YANG MENANG pada
   cascade - sebab bentuk lama pun punya aturan `.letter-average`, hanya isinya `right`. Test
   ini karena itu gagal bila implementasi kembali ke model lama, walau selektornya sama. */

import { nilaiMenang } from './helpers/cascade.js';

const KONTEKS_LABEL={tag:'th',kelas:['letter-average'],nthChild:1,lastChild:false,
  leluhur:['document-a4','letter-a4','letter-table','letter-average-row'],leluhurTag:['section','table','tfoot','tr']};
const KONTEKS_ANGKA={tag:'th',kelas:['letter-score','letter-average-score'],nthChild:2,lastChild:true,
  leluhur:['document-a4','letter-a4','letter-table','letter-average-row'],leluhurTag:['section','table','tfoot','tr']};
const CETAK=query=>/(^|\s|\()print(\)|\s|$)/.test(query);

function barisRekap(html){
  return /<tfoot><tr class="letter-average-row">(.*?)<\/tr><\/tfoot>/s.exec(html)?.[1]||'';
}

test('C17. Nilai Rata-rata adalah baris rekap tersendiri setelah mapel terakhir',()=>{
  const {siswa}=siapkan();
  void siswa;
  for(const [jenis,penyaji] of [['TRANSKRIP',transcriptSheet],['SKL',sklSheet]]){
    const doc=buildClassDocuments(admin,'6A',jenis)[0];
    const html=penyaji(doc);
    const rekap=barisRekap(html);
    assert.ok(rekap,`${jenis}: baris rekap ada dan berdiri sendiri di dalam tfoot`);
    /* Berada SESUDAH mata pelajaran terakhir, bukan di antara baris mapel. */
    const akhirTbody=html.indexOf('</tbody>');
    assert.ok(html.indexOf('letter-average-row')>akhirTbody,`${jenis}: rekap sesudah mapel terakhir`);
    assert.equal((html.match(/letter-average-row/g)||[]).length,1,`${jenis}: hanya satu baris rekap`);
    /* Dua sel saja: label bergabung, angka berdiri sendiri di kolom Nilai. */
    assert.equal((rekap.match(/<th/g)||[]).length,2,`${jenis}: baris rekap terdiri dari dua sel`);
    assert.match(rekap,/<th class="letter-average" colspan="2">NILAI RATA-RATA<\/th>/,
      `${jenis}: label menggabungkan kolom No dan Mata Pelajaran`);
    assert.match(rekap,/<th class="letter-score letter-average-score">/,`${jenis}: angka tetap pada kolom Nilai`);
  }
});

test('C18. Label dan angka rekap sama-sama di tengah, mendatar maupun tegak',()=>{
  const gaya=read('src/styles/app.css');
  for(const keadaan of [{nama:'layar',mediaAktif:null},{nama:'cetak',mediaAktif:CETAK}])
    for(const [label,konteks] of [['label',KONTEKS_LABEL],['angka',KONTEKS_ANGKA]]){
      const mendatar=nilaiMenang(gaya,konteks,'text-align',{mediaAktif:keadaan.mediaAktif});
      const tegak=nilaiMenang(gaya,konteks,'vertical-align',{mediaAktif:keadaan.mediaAktif});
      assert.equal(mendatar?.nilai,'center',
        `${keadaan.nama}: ${label} harus rata tengah, tetapi dimenangkan "${mendatar?.selektor}" dengan "${mendatar?.nilai}"`);
      assert.equal(tegak?.nilai,'middle',`${keadaan.nama}: ${label} harus di tengah secara tegak`);
    }
});

test('C19. Model lama - label rata kanan yang menempel kolom Nilai - tidak boleh kembali',()=>{
  const gaya=read('src/styles/app.css');
  for(const keadaan of [null,CETAK])
    assert.notEqual(nilaiMenang(gaya,KONTEKS_LABEL,'text-align',{mediaAktif:keadaan})?.nilai,'right',
      'label rekap tidak boleh rata kanan');
  const html=transcriptSheet(buildClassDocuments(admin,'6A','TRANSKRIP')[0]);
  void html;
  siapkan();
  const rekap=barisRekap(transcriptSheet(buildClassDocuments(admin,'6A','TRANSKRIP')[0]));
  /* Bentuk lama menaruh label di dalam sel Mata Pelajaran biasa, atau menyisakan sel No kosong. */
  assert.equal(/letter-subject/.test(rekap),false,'label rekap bukan sel Mata Pelajaran biasa');
  assert.equal(/<th class="letter-no"><\/th>|<td class="letter-no"><\/td>/.test(rekap),false,
    'tidak ada sel No kosong yang disisakan');
});

test('C20. Bingkai baris rekap menyatu dengan tabel',()=>{
  const gaya=read('src/styles/app.css');
  /* Bingkai datang dari aturan sel tabel yang sama; tidak ada aturan yang membuangnya. */
  assert.match(gaya,/\.letter-table th,\.letter-table td\{border:1px solid #333/);
  assert.equal(/\.letter-average[^{]*\{[^}]*border:\s*(0|none)/.test(gaya),false,
    'baris rekap tidak boleh menghapus bingkainya sendiri');
  assert.equal(/\.letter-table\{[^}]*border-collapse:separate/.test(gaya),false,'garis tabel tetap menyatu');
  assert.match(gaya,/\.letter-table\{[^}]*border-collapse:collapse/);
});

test('C21. Angka rata-rata tidak berubah oleh perubahan tata letak',()=>{
  const {siswa}=siapkan();
  const olehId=new Map(siswa.map(item=>[item.id,item]));
  for(const jenis of ['TRANSKRIP','SKL'])
    for(const doc of buildClassDocuments(admin,'6A',jenis)){
      const diri=olehId.get(doc.student.id);
      /* Dihitung ulang dari nilai siswa itu sendiri, lalu dibandingkan dengan yang dicetak. */
      const harusnya=Math.round((diri.nilai.reduce((sum,value)=>sum+value,0)/diri.nilai.length+Number.EPSILON)*100)/100;
      assert.equal(doc.average,harusnya,`${jenis}: rata-rata ${diri.name} tetap dihitung dari nilainya sendiri`);
    }
  /* Dan angka yang tercetak sama persis dengan yang dihitung, dua desimal berkoma. */
  const doc=buildClassDocuments(admin,'6A','TRANSKRIP')[0];
  const tercetak=/<th class="letter-score letter-average-score">([^<]*)<\/th>/.exec(transcriptSheet(doc))?.[1];
  assert.equal(tercetak,doc.average.toFixed(2).replace('.',','));
});

test('C22. SKKB tidak ikut menerima baris rekap',()=>{
  siapkan();
  for(const html of buildClassDocuments(admin,'6A','SKKB').map(skkbSheet)){
    assert.equal(html.includes('letter-average-row'),false,'SKKB tidak punya tabel nilai');
    assert.equal(html.includes('NILAI RATA-RATA'),false);
    assert.equal(html.includes('letter-table'),false);
  }
});

test('C23. Baris rekap ikut pada cetak semua siswa, satu per dokumen',()=>{
  const {siswa}=siapkan();
  for(const [jenis,penyaji] of [['TRANSKRIP',transcriptSheet],['SKL',sklSheet]]){
    const potongan=buildClassDocuments(admin,'6A',jenis).map(penyaji);
    assert.equal(potongan.length,siswa.length);
    for(const html of potongan)
      assert.equal((html.match(/letter-average-row/g)||[]).length,1,`${jenis}: setiap lembar punya satu baris rekap`);
    /* Angka rekap tiap lembar berbeda karena nilai ketiga siswa memang berbeda. */
    const angka=potongan.map(html=>/<th class="letter-score letter-average-score">([^<]*)<\/th>/.exec(html)?.[1]);
    assert.equal(new Set(angka).size,3,`${jenis}: rekap tidak tertukar antar siswa`);
  }
});

/* ================================================== JUDUL SKL: SATU BARIS, BUKAN DUA

   Penyebabnya dulu bukan aturan tata letak melainkan <br/> yang ditanam di dalam h1, sehingga
   "LULUS" selalu turun ke baris kedua berapa pun lebar kertasnya. Test ini menjaga judulnya
   tetap satu simpul teks utuh, dan gagal bila pemenggalan itu kembali dalam bentuk apa pun -
   <br>, dua heading, maupun span terpisah. */

function judulSkl(html){return /<div class="letter-title"><h1>(.*?)<\/h1>/s.exec(html)?.[1]||'';}

test('C24. Judul SKL berisi tepat "SURAT KETERANGAN LULUS" dalam satu baris markup',()=>{
  siapkan();
  for(const doc of buildClassDocuments(admin,'6A','SKL')){
    const html=sklSheet(doc);
    assert.equal(judulSkl(html),'SURAT KETERANGAN LULUS','judul utuh tanpa pemenggalan');
    assert.equal((html.match(/<h1>/g)||[]).length,1,'hanya satu heading pada lembar SKL');
  }
});

test('C25. Tidak ada pemenggalan apa pun di dalam judul SKL',()=>{
  siapkan();
  const html=sklSheet(buildClassDocuments(admin,'6A','SKL')[0]);
  const judul=judulSkl(html);
  for(const pemisah of ['<br>','<br/>','<br />','</h1>','<span','<div','\n'])
    assert.equal(judul.includes(pemisah),false,`judul SKL tidak boleh memuat ${pemisah.trim()||'baris baru'}`);
  /* Bentuk lama yang persis: "SURAT KETERANGAN" lalu <br/> lalu "LULUS". */
  assert.equal(/SURAT KETERANGAN\s*<br\s*\/?>\s*LULUS/i.test(html),false,
    'pemenggalan lama tidak boleh kembali');
  /* Sumbernya pun tidak boleh lagi memuat pola itu. */
  assert.equal(/SURAT KETERANGAN<br\/>LULUS/.test(read('src/pages/graduation-print.js')),false);
});

test('C26. Judul satu baris berlaku pada setiap siswa saat Cetak Semua',()=>{
  const {siswa}=siapkan();
  const potongan=buildClassDocuments(admin,'6A','SKL').map(sklSheet);
  assert.equal(potongan.length,siswa.length);
  for(const html of potongan)
    assert.equal(judulSkl(html),'SURAT KETERANGAN LULUS','setiap lembar memakai judul yang sama');
  /* Preview satu siswa memakai penyusun yang sama persis, jadi tidak mungkin berbeda. */
  const satu=sklSheet(buildClassDocuments(admin,'6A','SKL')[0]);
  assert.equal(judulSkl(satu),judulSkl(potongan[0]));
});

test('C27. Kata LULUS pada judul tidak mengubah status kelulusan siswa',()=>{
  const {siswa}=siapkan();
  const olehId=new Map(siswa.map(item=>[item.id,item]));
  const label={GRADUATED:'LULUS',NOT_GRADUATED:'TIDAK LULUS','':''};
  for(const doc of buildClassDocuments(admin,'6A','SKL')){
    const diri=olehId.get(doc.student.id);
    assert.equal(doc.statusLabel,label[diri.status],'status tetap dibaca dari graduationStatus');
    const putusan=/<p class="letter-verdict">([^<]*)<\/p>/.exec(sklSheet(doc))?.[1];
    assert.equal(putusan,label[diri.status]||'BELUM DITETAPKAN');
  }
});

test('C28. Judul SKL tetap tengah, tebal, Times, dan mengikuti hierarki ukuran existing',()=>{
  const gaya=read('src/styles/app.css');
  const konteks={tag:'h1',kelas:[],nthChild:1,lastChild:false,
    leluhur:['document-a4','letter-a4','skl-letter','letter-title'],leluhurTag:['section','div']};
  for(const keadaan of [null,CETAK]){
    assert.equal(nilaiMenang(gaya,konteks,'font-size',{mediaAktif:keadaan})?.nilai,'14pt','ukuran judul tidak berubah');
    assert.equal(nilaiMenang(gaya,konteks,'font-weight',{mediaAktif:keadaan})?.nilai,'700','judul tetap tebal');
  }
  assert.match(gaya,/\.letter-title\{text-align:center/,'judul tetap rata tengah');
  assert.match(gaya,/\.letter-a4,\.letter-a4 \*\{font-family:"Times New Roman",Times,serif\}/);
  /* Tidak ada aturan yang memaksa judul membungkus. */
  assert.equal(/\.letter-title h1\{[^}]*(white-space:pre|max-width)/.test(gaya),false);
});

/* Penjelasan perubahan harus tinggal di SUMBER, bukan di dalam lembar. Komentar HTML yang
   ditulis di dalam template ikut terbawa ke dokumen yang dicetak: ia menambah teks yang tidak
   diminta ke berkas resmi, dan kata apa pun di dalamnya - "cukup", "baik", "lulus" - membuat
   pemindaian isi dokumen membaca sesuatu yang tidak pernah ditetapkan siapa pun. Test ini
   gagal jika ada komentar HTML kembali masuk ke salah satu dari tiga lembar. */
test('C30. Tiga lembar resmi tidak memuat komentar HTML apa pun',()=>{
  siapkan();
  const lembar=[
    ['TRANSKRIP',transcriptSheet,buildClassDocuments(admin,'6A','TRANSKRIP')],
    ['SKL',sklSheet,buildClassDocuments(admin,'6A','SKL')],
    ['SKKB',skkbSheet,buildClassDocuments(admin,'6A','SKKB')],
  ];
  for(const [nama,susun,daftar] of lembar)
    for(const doc of daftar){
      const html=susun(doc);
      assert.equal(html.includes('<!--'),false,`${nama} tidak boleh memuat komentar HTML`);
      assert.equal(html.includes('-->'),false,`${nama} tidak boleh memuat penutup komentar HTML`);
    }
  /* Sumbernya pun tidak boleh menaruh komentar HTML di dalam template literal. */
  const kode=read('src/pages/graduation-print.js');
  assert.equal(kode.includes('<!--'),false,'komentar HTML tidak ditulis di renderer lembar');
});

test('C29. SKKB dan Transkrip tidak ikut terpengaruh',()=>{
  siapkan();
  /* SKKB memang punya pemenggalan sendiri dan sengaja TIDAK diubah pada pekerjaan ini. */
  const skkb=skkbSheet(buildClassDocuments(admin,'6A','SKKB')[0]);
  assert.match(skkb,/<h1>SURAT KETERANGAN KELAKUAN<br\/>BAIK<\/h1>/,'SKKB tetap seperti sebelumnya');
  const transkrip=transcriptSheet(buildClassDocuments(admin,'6A','TRANSKRIP')[0]);
  assert.match(transkrip,/<h1>TRANSKRIP NILAI<\/h1>/,'judul Transkrip tetap dari doc.title');
  /* Baris rekap Nilai Rata-rata tetap utuh pada keduanya yang memilikinya. */
  for(const html of [transkrip,sklSheet(buildClassDocuments(admin,'6A','SKL')[0])])
    assert.match(html,/<th class="letter-average" colspan="2">NILAI RATA-RATA<\/th>/);
});
