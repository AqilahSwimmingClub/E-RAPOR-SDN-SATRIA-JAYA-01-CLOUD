import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACADEMIC_YEAR, SUBJECTS_DEFAULT } from '../src/data/constants.js';
import { ATTITUDE_ACCEPTED_LEVELS, ATTITUDE_DEVELOPMENT_LEVELS, ATTITUDE_DIMENSIONS,
  ATTITUDE_EVIDENCE_BANK, ATTITUDE_LEVELS, attitudeEvidenceOptions, attitudeLevelCode,
  clearStudentAttitude, generateAttitudeDescription, isAttitudeEvidenceOf, isAttitudeLevel,
  listStudentAttitudes, saveClassAttitudeBulk, saveStudentAttitude } from '../src/services/attitudes.js';
import { getReportDocument } from '../src/services/documents.js';
import { createStudent } from '../src/services/students.js';
import { invalidateDbCache, loadDb, scopeKey, updateDb } from '../src/services/storage.js';
import { saveSubjectMapping } from './helpers/penugasan.js';

/* NILAI SIKAP PROFIL LULUSAN: TINGKAT PERKEMBANGAN, BUKTI PERILAKU, DAN DESKRIPSINYA.

   Deskripsi sikap dulu hanya menggabungkan nama, capaian, dan nama dimensi. Kalimatnya benar
   secara tata bahasa tetapi kosong isinya: orang tua tidak pernah tahu perilaku apa yang
   membuat anaknya dinilai begitu. Panduan resmi meminta empat tingkat perkembangan (MB, SB,
   BSH, BSB) dan satu bukti perilaku nyata di kelas untuk setiap dimensi.

   Yang dijaga suite ini bukan hanya bahwa fiturnya ada, melainkan bahwa ia tidak bisa berbohong:

     1. Bukti selalu milik dimensinya sendiri. "Dimensi Mandiri, ditunjukkan melalui kerelaannya
        berbagi tugas" adalah kalimat yang tidak boleh pernah tersimpan lewat jalur mana pun -
        bukan sekadar tidak muncul di dropdown.
     2. Hanya dimensi yang benar-benar dipilih guru yang tersimpan dan tercetak. Tidak ada
        pengisian cadangan ke enam dimensi.
     3. Catatan lama - yang belum punya bukti perilaku sama sekali - tetap terbaca dan tetap
        tercetak apa adanya. Tidak ada bukti yang dikarang untuknya, dan tidak ada migrasi yang
        menulis ulang isinya.

   Bug precedence pada Kokurikuler 1.2.6 - pilihan tersimpan mengambil alih pilihan baru guru
   setiap kali halaman digambar ulang - menjadi alasan pemeriksaan nomor 18 dan 27 di bawah. */

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

function useMemoryStorage(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()};
  invalidateDbCache();
}
function muatUlang(){invalidateDbCache();}
const guru=(classId='5B',semester=`Ganjil ${ACADEMIC_YEAR}`)=>
  ({role:'teacher',classId,academicYear:ACADEMIC_YEAR,semester});
function aktifkanSemuaMapel(session){
  saveSubjectMapping(session,SUBJECTS_DEFAULT.map((item,index)=>({...item,active:true,order:index+1})));
}
function tambahSiswa(session,index=1,nama){
  return createStudent(session,{classId:session.classId,nis:`${session.classId}-${index}`,
    nisn:`8811${String(index).padStart(6,'0')}`,name:nama||`Siswa ${index}`,gender:index%2?'L':'P',photo:''});
}
const terisi=(session,studentId)=>listStudentAttitudes(session,studentId).filter(item=>item.status!=='EMPTY');
const dimensi=id=>ATTITUDE_DIMENSIONS.find(item=>item.id===id);
const BSH='Berkembang Sesuai Harapan';
const BSB='Berkembang Sangat Baik';

/* ------------------------------------------------------- Dimensi dan tingkat perkembangan */

test('1. Enam dimensi Profil Pelajar Pancasila dengan identity yang tidak berubah',()=>{
  assert.deepEqual(ATTITUDE_DIMENSIONS.map(item=>item.id),
    ['faith','global-diversity','mutual-cooperation','independent','critical-reasoning','creative'],
    'id dimensi lama dipertahankan apa adanya');
  assert.equal(ATTITUDE_DIMENSIONS.length,6);
  for(const item of ATTITUDE_DIMENSIONS)assert.ok(item.label.trim().length>2,`dimensi ${item.id} punya label`);
});

test('2. Tidak ada dimensi kembar akibat perbedaan ejaan label',()=>{
  const id=ATTITUDE_DIMENSIONS.map(item=>item.id);
  const label=ATTITUDE_DIMENSIONS.map(item=>item.label.toLowerCase().replace(/[^a-z]/g,''));
  assert.equal(new Set(id).size,id.length,'id dimensi unik');
  assert.equal(new Set(label).size,label.length,'label dimensi unik walau tanda bacanya dilepas');
});

test('3. Empat tingkat perkembangan resmi memakai label lengkap, bukan singkatan',()=>{
  assert.deepEqual(ATTITUDE_DEVELOPMENT_LEVELS.map(item=>item.code),['MB','SB','BSH','BSB']);
  assert.deepEqual(ATTITUDE_DEVELOPMENT_LEVELS.map(item=>item.label),
    ['Mulai Berkembang','Sedang Berkembang','Berkembang Sesuai Harapan','Berkembang Sangat Baik']);
  for(const item of ATTITUDE_DEVELOPMENT_LEVELS)
    assert.ok(item.label.split(' ').length>=2,`${item.code} ditulis lengkap, bukan singkatannya saja`);
});

test('4. Kode singkatan dapat dibaca balik dari labelnya',()=>{
  for(const item of ATTITUDE_DEVELOPMENT_LEVELS)assert.equal(attitudeLevelCode(item.label),item.code);
  assert.equal(attitudeLevelCode('Sangat Berkembang'),'','capaian versi lama tidak dipaksa punya kode baru');
  assert.equal(attitudeLevelCode(''),'');
});

test('5. Capaian versi lama tetap sah sehingga catatan lama masih bisa disimpan ulang',()=>{
  useMemoryStorage();
  const session=guru();const anak=tambahSiswa(session,1);
  for(const level of ATTITUDE_LEVELS)assert.equal(isAttitudeLevel(level),true,`${level} tetap diterima`);
  const hasil=saveStudentAttitude(session,anak.id,'faith',{level:'Sangat Berkembang'});
  assert.equal(hasil.level,'Sangat Berkembang');
  assert.equal(isAttitudeLevel('Berkembang Luar Biasa'),false,'capaian karangan tetap ditolak');
  assert.throws(()=>saveStudentAttitude(session,anak.id,'faith',{level:'Berkembang Luar Biasa'}),/Capaian/);
});

test('6. Daftar capaian lama tidak digeser urutannya',()=>{
  assert.deepEqual(ATTITUDE_LEVELS,['Sangat Berkembang','Berkembang Sesuai Harapan','Mulai Berkembang'],
    'urutan lama dipertahankan agar pemanggil lama membaca capaian yang sama');
  for(const level of [...ATTITUDE_LEVELS,...ATTITUDE_DEVELOPMENT_LEVELS.map(item=>item.label)])
    assert.ok(ATTITUDE_ACCEPTED_LEVELS.includes(level),`${level} diterima penyimpanan`);
});

/* ------------------------------------------------------------- Bank kalimat bukti perilaku */

test('7. Bank bukti berisi 18 kalimat, tiga untuk setiap dimensi',()=>{
  const semua=ATTITUDE_DIMENSIONS.flatMap(item=>attitudeEvidenceOptions(item.id));
  assert.equal(semua.length,18,'tiga bukti untuk enam dimensi');
  for(const item of ATTITUDE_DIMENSIONS)
    assert.equal(attitudeEvidenceOptions(item.id).length,3,`dimensi ${item.label} punya tiga bukti`);
});

test('8. Bank terstruktur per dimensionId, bukan daftar teks lepas',()=>{
  assert.deepEqual(Object.keys(ATTITUDE_EVIDENCE_BANK).sort(),
    ATTITUDE_DIMENSIONS.map(item=>item.id).sort(),'kuncinya persis id dimensi yang ada');
  for(const daftar of Object.values(ATTITUDE_EVIDENCE_BANK))
    for(const kalimat of daftar)assert.ok(kalimat.trim().length>20&&!kalimat.endsWith('.'),
      'kalimat bukti menempel di tengah kalimat, jadi tidak berakhir titik');
});

test('9. Bukti satu dimensi tidak pernah muncul pada dimensi lain',()=>{
  for(const sumber of ATTITUDE_DIMENSIONS)
    for(const kalimat of attitudeEvidenceOptions(sumber.id))
      for(const lain of ATTITUDE_DIMENSIONS){
        if(lain.id===sumber.id)continue;
        assert.equal(attitudeEvidenceOptions(lain.id).includes(kalimat),false,
          `bukti ${sumber.label} bocor ke ${lain.label}`);
        assert.equal(isAttitudeEvidenceOf(lain.id,kalimat),false,
          `bukti ${sumber.label} tidak boleh dianggap milik ${lain.label}`);
      }
  /* Contoh yang paling sering keliru pada aplikasi sejenis. */
  assert.equal(attitudeEvidenceOptions('mutual-cooperation')
    .some(item=>attitudeEvidenceOptions('creative').includes(item)),false,
    'dropdown Gotong Royong tidak memuat bukti Kreatif');
});

test('10. Seluruh 18 kalimat bukti berbeda satu sama lain',()=>{
  const semua=ATTITUDE_DIMENSIONS.flatMap(item=>attitudeEvidenceOptions(item.id));
  assert.equal(new Set(semua).size,18,'tidak ada kalimat yang diulang');
});

test('11. Pembaca bank aman terhadap dimensi asing dan tidak bisa diubah dari luar',()=>{
  assert.deepEqual(attitudeEvidenceOptions('bukan-dimensi'),[],'dimensi asing tidak menghasilkan bukti');
  assert.deepEqual(attitudeEvidenceOptions(''),[]);
  const salinan=attitudeEvidenceOptions('creative');salinan.push('bukti karangan');
  assert.equal(attitudeEvidenceOptions('creative').length,3,'bank tidak ikut berubah');
  assert.equal(isAttitudeEvidenceOf('creative','bukti karangan'),false);
});

/* ------------------------------------------------------------------ Rumus deskripsi sikap */

test('12. Deskripsi mengikuti rumus resmi kata demi kata',()=>{
  const bukti=ATTITUDE_EVIDENCE_BANK['mutual-cooperation'][0];
  const teks=generateAttitudeDescription('Andi Saputra','mutual-cooperation',BSH,bukti);
  assert.equal(teks,`Ananda Andi Saputra ${BSH.toLowerCase()} dalam dimensi ${dimensi('mutual-cooperation').label}, yang ditunjukkan melalui ${bukti}.`);
  assert.match(teks,/ dalam dimensi /);
  assert.match(teks,/, yang ditunjukkan melalui /);
  assert.ok(teks.endsWith('.'));
});

test('13. Sapaan "Ananda" milik aplikasi ini dipertahankan',()=>{
  for(const item of ATTITUDE_DIMENSIONS){
    const teks=generateAttitudeDescription('Budi',item.id,BSB,attitudeEvidenceOptions(item.id)[1]);
    assert.match(teks,/^Ananda Budi /,`dimensi ${item.label} tetap dibuka dengan Ananda`);
  }
});

test('14. Nama yang sudah diawali Ananda tidak disapa dua kali',()=>{
  const teks=generateAttitudeDescription('Ananda Citra','creative','Mulai Berkembang');
  assert.match(teks,/^Ananda Citra /);
  assert.equal((teks.match(/Ananda/g)||[]).length,1,'tidak ada "Ananda Ananda"');
});

test('15. Tanpa bukti perilaku, kalimatnya tetap utuh dan tidak menggantung',()=>{
  const teks=generateAttitudeDescription('Dewi','independent',BSB);
  assert.equal(teks,`Ananda Dewi ${BSB.toLowerCase()} dalam dimensi Mandiri.`);
  assert.doesNotMatch(teks,/ditunjukkan melalui\s*\.?$/,'klausa bukti tidak ditinggalkan setengah jadi');
  assert.doesNotMatch(teks,/\.\./,'tidak ada titik ganda');
});

test('16. Kapitalisasi wajar: hanya awal kalimat, tidak ada huruf besar di tengah',()=>{
  const bukti=ATTITUDE_EVIDENCE_BANK.faith[2];
  const teks=generateAttitudeDescription('Eka Putri','faith',BSH,bukti);
  const setelahNama=teks.slice('Ananda Eka Putri '.length);
  assert.match(setelahNama,/^berkembang sesuai harapan dalam dimensi /,'capaian ditulis huruf kecil di tengah kalimat');
  const klausa=teks.slice(teks.indexOf('yang ditunjukkan melalui '));
  assert.doesNotMatch(klausa.replace('yang ditunjukkan melalui ',''),/^[A-Z]/,'bukti tidak diawali huruf besar');
  assert.doesNotMatch(teks,/\s{2,}/,'tidak ada spasi ganda');
});

/* --------------------------------------------------- Bukti terikat pada dimensinya sendiri */

test('17. Menyimpan bukti milik dimensi lain ditolak oleh layanan, bukan hanya oleh layar',()=>{
  useMemoryStorage();
  const session=guru();const anak=tambahSiswa(session,1);
  const buktiGotongRoyong=ATTITUDE_EVIDENCE_BANK['mutual-cooperation'][0];
  assert.throws(()=>saveStudentAttitude(session,anak.id,'independent',
    {level:BSB,behaviorEvidence:buktiGotongRoyong}),/Bukti perilaku tidak sesuai dengan dimensi Mandiri/);
  assert.throws(()=>generateAttitudeDescription('Andi','independent',BSB,buktiGotongRoyong),/tidak sesuai/);
  assert.equal(terisi(session,anak.id).length,0,'tidak ada catatan yang terlanjur tersimpan');
});

test('18. Berpindah dimensi menggugurkan bukti dimensi sebelumnya',()=>{
  useMemoryStorage();
  const session=guru();const anak=tambahSiswa(session,1,'Fajar');
  const buktiC=ATTITUDE_EVIDENCE_BANK['mutual-cooperation'][2];
  const buktiA=ATTITUDE_EVIDENCE_BANK.independent[0];
  saveStudentAttitude(session,anak.id,'mutual-cooperation',{level:BSH,behaviorEvidence:buktiC});
  /* Guru berpindah: Gotong Royong dikosongkan, Mandiri diisi dengan bukti Mandiri. */
  clearStudentAttitude(session,anak.id,'mutual-cooperation');
  saveStudentAttitude(session,anak.id,'independent',{level:BSB,behaviorEvidence:buktiA});
  muatUlang();
  const tersimpan=terisi(session,anak.id);
  assert.equal(tersimpan.length,1,'hanya dimensi yang berlaku sekarang yang tersimpan');
  assert.equal(tersimpan[0].dimensionId,'independent');
  assert.equal(tersimpan[0].level,BSB,'capaian baru tidak diambil alih nilai tersimpan sebelumnya');
  assert.equal(tersimpan[0].behaviorEvidence,buktiA);
  assert.doesNotMatch(tersimpan[0].description,/Gotong Royong/,'jejak dimensi lama tidak tertinggal di kalimat');
  assert.doesNotMatch(tersimpan[0].description,new RegExp(buktiC.slice(0,24)),'bukti dimensi lama ikut gugur');
});

test('19. Menyimpan ulang kunci yang sama memperbarui catatan, bukan menggandakannya',()=>{
  useMemoryStorage();
  const session=guru();const anak=tambahSiswa(session,1);
  saveStudentAttitude(session,anak.id,'creative',{level:BSH,behaviorEvidence:ATTITUDE_EVIDENCE_BANK.creative[0]});
  const pertama=loadDb().attitudeProfiles;
  saveStudentAttitude(session,anak.id,'creative',{level:BSB,behaviorEvidence:ATTITUDE_EVIDENCE_BANK.creative[2]});
  const kedua=loadDb().attitudeProfiles;
  assert.equal(Object.keys(pertama).length,1);
  assert.equal(Object.keys(kedua).length,1,'satu kunci, satu catatan');
  const kunci=`${scopeKey(session)}|${anak.id}|creative`;
  assert.equal(kedua[kunci].level,BSB);
  assert.equal(kedua[kunci].behaviorEvidence,ATTITUDE_EVIDENCE_BANK.creative[2]);
  assert.equal(kedua[kunci].createdAt,pertama[kunci].createdAt,'catatan yang sama, bukan catatan baru');
});

/* ---------------------------------------------------------- Pilihan guru bersifat persis */

test('20. Hanya dimensi yang dipilih guru yang tersimpan: 1 dari 6, 3 dari 6, 6 dari 6',()=>{
  useMemoryStorage();
  const session=guru();const anak=tambahSiswa(session,1);
  const id=ATTITUDE_DIMENSIONS.map(item=>item.id);
  for(const jumlah of [1,3,6]){
    saveClassAttitudeBulk(session,id.slice(0,jumlah),BSH);
    muatUlang();
    assert.equal(terisi(session,anak.id).length,jumlah,`${jumlah} dari 6 dimensi tersimpan`);
  }
  /* Turun kembali dari enam ke satu benar-benar mengosongkan lima sisanya. */
  saveClassAttitudeBulk(session,[id[2]],BSB);
  muatUlang();
  assert.deepEqual(terisi(session,anak.id).map(item=>item.dimensionId),[id[2]]);
});

test('21. Isi Semua Siswa memakai bukti per dimensi dan nama setiap siswa',()=>{
  useMemoryStorage();
  const session=guru();
  const andi=tambahSiswa(session,1,'Andi Saputra');
  const bunga=tambahSiswa(session,2,'Bunga Lestari');
  const bukti={'mutual-cooperation':ATTITUDE_EVIDENCE_BANK['mutual-cooperation'][1],
    'creative':ATTITUDE_EVIDENCE_BANK.creative[0]};
  saveClassAttitudeBulk(session,['mutual-cooperation','creative'],BSH,bukti);
  muatUlang();
  for(const anak of [andi,bunga]){
    const catatan=terisi(session,anak.id);
    assert.equal(catatan.length,2);
    for(const item of catatan){
      assert.equal(item.behaviorEvidence,bukti[item.dimensionId],`bukti ${item.dimensionLabel} sesuai dimensinya`);
      assert.match(item.description,new RegExp(`^Ananda ${anak.name} `),'kalimat memakai nama siswa itu sendiri');
      assert.match(item.description,new RegExp(`dalam dimensi ${dimensi(item.dimensionId).label}`));
    }
  }
  /* Tanpa peta bukti, pengisian massal tetap berjalan dan tidak mengarang bukti apa pun. */
  saveClassAttitudeBulk(session,['independent'],BSB);
  muatUlang();
  const mandiri=terisi(session,andi.id).find(item=>item.dimensionId==='independent');
  assert.equal(mandiri.behaviorEvidence,'');
  assert.doesNotMatch(mandiri.description,/ditunjukkan melalui/);
});

test('22. Isi Semua Siswa menolak bukti yang bukan milik dimensinya',()=>{
  useMemoryStorage();
  const session=guru();const anak=tambahSiswa(session,1);
  assert.throws(()=>saveClassAttitudeBulk(session,['independent'],BSH,
    {'independent':ATTITUDE_EVIDENCE_BANK['mutual-cooperation'][0]}),/tidak sesuai dengan dimensi Mandiri/);
  assert.equal(terisi(session,anak.id).length,0,'tidak ada satu pun catatan yang tertulis sebagian');
});

test('23. Guru masih bisa menyunting satu siswa setelah pengisian massal',()=>{
  useMemoryStorage();
  const session=guru();
  const andi=tambahSiswa(session,1,'Andi Saputra');
  const bunga=tambahSiswa(session,2,'Bunga Lestari');
  saveClassAttitudeBulk(session,['faith'],BSH,{faith:ATTITUDE_EVIDENCE_BANK.faith[0]});
  saveStudentAttitude(session,andi.id,'faith',{level:BSB,behaviorEvidence:ATTITUDE_EVIDENCE_BANK.faith[2],
    description:'Ananda Andi Saputra menunjukkan kemajuan yang khas menurut catatan wali kelas.'});
  muatUlang();
  const catatanAndi=terisi(session,andi.id)[0];
  const catatanBunga=terisi(session,bunga.id)[0];
  assert.equal(catatanAndi.status,'EDITED');
  assert.equal(catatanAndi.level,BSB);
  assert.equal(catatanBunga.status,'AUTO','siswa lain tidak ikut berubah');
  assert.equal(catatanBunga.level,BSH);
  assert.equal(catatanBunga.behaviorEvidence,ATTITUDE_EVIDENCE_BANK.faith[0]);
});

/* ------------------------------------------------------------------- Catatan versi lama */

test('24. Catatan lama tanpa bukti perilaku tetap terbaca dan rapor tidak gagal mencetak',()=>{
  useMemoryStorage();
  const session=guru();
  aktifkanSemuaMapel(session);
  const anak=tambahSiswa(session,1,'Gilang');
  /* Bentuk persis catatan versi sebelumnya: tanpa behaviorEvidence, tanpa developmentLevel. */
  updateDb(db=>{db.attitudeProfiles[`${scopeKey(session)}|${anak.id}|faith`]={
    studentId:anak.id,studentName:'Gilang',dimensionId:'faith',dimensionLabel:dimensi('faith').label,
    level:'Sangat Berkembang',description:'Gilang sangat berkembang dalam dimensi Beriman.',
    status:'AUTO',classId:'5B',semester:session.semester,academicYear:ACADEMIC_YEAR,
    createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z'};return db;});
  muatUlang();
  const catatan=terisi(session,anak.id)[0];
  assert.equal(catatan.level,'Sangat Berkembang');
  assert.equal(catatan.developmentLevel,'Sangat Berkembang','capaian lama terbaca sebagai tingkat perkembangan');
  assert.equal(catatan.behaviorEvidence,'','bukti kosong, bukan undefined yang bisa meledak');
  assert.equal(catatan.description,'Gilang sangat berkembang dalam dimensi Beriman.','kalimat lama utuh');
  const doc=getReportDocument(session,anak.id);
  assert.equal(doc.attitudes.length,1);
  assert.equal(doc.attitudes[0].description,'Gilang sangat berkembang dalam dimensi Beriman.');
});

test('25. Tidak ada bukti yang dikarang, dan penyimpanan tidak menulis ulang catatan lama',()=>{
  useMemoryStorage();
  const session=guru();const anak=tambahSiswa(session,1,'Hana');
  const kunci=`${scopeKey(session)}|${anak.id}|creative`;
  updateDb(db=>{db.attitudeProfiles[kunci]={studentId:anak.id,studentName:'Hana',dimensionId:'creative',
    dimensionLabel:'Kreatif',level:'Mulai Berkembang',description:'Kalimat lama.',status:'EDITED',
    classId:'5B',semester:session.semester,academicYear:ACADEMIC_YEAR,
    createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z'};return db;});
  muatUlang();
  /* Membaca saja tidak boleh mengubah apa pun di database. */
  listStudentAttitudes(session,anak.id);
  muatUlang();
  const mentah=loadDb().attitudeProfiles[kunci];
  assert.equal(Object.hasOwn(mentah,'behaviorEvidence'),false,'tidak ada field baru yang disuntikkan diam-diam');
  assert.equal(mentah.updatedAt,'2025-01-01T00:00:00.000Z','catatan lama tidak disentuh');
  assert.equal(mentah.description,'Kalimat lama.');
});

test('26. Catatan terpisah per siswa, rombel, semester, dan tahun ajaran',()=>{
  useMemoryStorage();
  const ganjil=guru('5B',`Ganjil ${ACADEMIC_YEAR}`);
  const genap=guru('5B',`Genap ${ACADEMIC_YEAR}`);
  const lainRombel=guru('5A',`Ganjil ${ACADEMIC_YEAR}`);
  const a=tambahSiswa(ganjil,1,'Ika');
  const b=tambahSiswa(ganjil,2,'Joko');
  const c=tambahSiswa(genap,3,'Kiki');
  const d=tambahSiswa(lainRombel,4,'Lina');
  saveStudentAttitude(ganjil,a.id,'faith',{level:BSH,behaviorEvidence:ATTITUDE_EVIDENCE_BANK.faith[0]});
  muatUlang();
  assert.equal(terisi(ganjil,a.id).length,1);
  assert.equal(terisi(ganjil,b.id).length,0,'siswa lain di rombel yang sama tidak ikut terisi');
  assert.equal(terisi(genap,c.id).length,0,'semester lain tidak tersentuh');
  assert.equal(terisi(lainRombel,d.id).length,0,'rombel lain tidak tersentuh');
  /* Membuka kembali scope yang sama membaca catatan yang benar, bukan catatan scope terakhir. */
  saveStudentAttitude(genap,c.id,'faith',{level:BSB,behaviorEvidence:ATTITUDE_EVIDENCE_BANK.faith[2]});
  muatUlang();
  assert.equal(terisi(ganjil,a.id)[0].level,BSH);
  assert.equal(terisi(genap,c.id)[0].level,BSB);
});

test('27. Halaman Sikap: bukti diambil dari bank dimensi barisnya sendiri',()=>{
  const halaman=read('src/pages/attitudes.js');
  /* Pilihan bukti disusun dari bank dimensi baris itu, bukan dari satu daftar bersama. */
  assert.match(halaman,/function evidenceOptions\(dimensionId,current\)\{/);
  assert.match(halaman,/const bank=attitudeEvidenceOptions\(dimensionId\);/);
  assert.match(halaman,/const nilai=bank\.includes\(String\(current\|\|''\)\)\?String\(current\):'';/,
    'nilai tersimpan hanya terpilih bila memang milik dimensi ini');
  assert.match(halaman,/evidenceOptions\(record\.dimensionId,record\.behaviorEvidence\)/,
    'setiap baris memakai dimensinya sendiri');
  /* Tingkat perkembangan yang ditawarkan adalah empat pilihan resmi, dengan label lengkap. */
  assert.match(halaman,/ATTITUDE_DEVELOPMENT_LEVELS\.map\(item=>\(\{value:item\.label,text:`\$\{item\.label\} \(\$\{item\.code\}\)`\}\)\)/);
  /* Simpan mengirim capaian, bukti, dan deskripsi dari baris yang sedang tampil. */
  assert.match(halaman,/saveStudentAttitude\(session,studentId,row\.dataset\.dimension,\{level,behaviorEvidence:row\.querySelector\('\[data-evidence\]'\)\.value/);
  assert.match(halaman,/clearStudentAttitude\(session,studentId,row\.dataset\.dimension\)/,
    'dimensi yang dikembalikan ke Tidak diisi tetap dikosongkan');
  /* Isi Semua Siswa mengirim bukti sebagai peta per dimensi. */
  assert.match(halaman,/saveClassAttitudeBulk\(session,dipilih,form\.elements\.level\.value,bukti\)/);
  assert.match(halaman,/data-bulk="\$\{id\}"\] \[data-bulk-evidence\]/);
});
