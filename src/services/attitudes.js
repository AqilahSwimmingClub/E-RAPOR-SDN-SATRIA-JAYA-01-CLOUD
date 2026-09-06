import { listStudents } from './students.js';
import { loadDb, scopeKey, updateDb } from './storage.js';

export const ATTITUDE_DIMENSIONS=[
  {id:'faith',label:'Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia'},
  {id:'global-diversity',label:'Berkebinekaan Global'},
  {id:'mutual-cooperation',label:'Gotong Royong'},
  {id:'independent',label:'Mandiri'},
  {id:'critical-reasoning',label:'Bernalar Kritis'},
  {id:'creative',label:'Kreatif'},
];

/* EMPAT TINGKAT PERKEMBANGAN, DITULIS LENGKAP.
   Panduan resmi memakai MB, SB, BSH, dan BSB. Guru melihat label panjangnya di layar supaya
   tidak perlu menghafal singkatan, sedangkan kodenya disimpan hanya sebagai keterangan. */
export const ATTITUDE_DEVELOPMENT_LEVELS=Object.freeze([
  Object.freeze({code:'MB',label:'Mulai Berkembang'}),
  Object.freeze({code:'SB',label:'Sedang Berkembang'}),
  Object.freeze({code:'BSH',label:'Berkembang Sesuai Harapan'}),
  Object.freeze({code:'BSB',label:'Berkembang Sangat Baik'}),
]);

/* CAPAIAN VERSI LAMA TETAP SAH.
   Rapor yang sudah tercetak dan catatan yang sudah tersimpan memakai daftar ini. Menghapusnya
   akan membuat catatan lama gagal dibaca dan gagal disimpan ulang, jadi daftar ini dibiarkan
   apa adanya - urutannya pun tidak diubah - dan tetap diterima oleh penyimpanan. Yang baru
   hanya pilihan yang ditawarkan di layar. */
export const ATTITUDE_LEVELS=['Sangat Berkembang','Berkembang Sesuai Harapan','Mulai Berkembang'];
export const ATTITUDE_ACCEPTED_LEVELS=Object.freeze([
  ...ATTITUDE_DEVELOPMENT_LEVELS.map(item=>item.label),
  ...ATTITUDE_LEVELS.filter(level=>!ATTITUDE_DEVELOPMENT_LEVELS.some(item=>item.label===level)),
]);
export function isAttitudeLevel(level){return ATTITUDE_ACCEPTED_LEVELS.includes(String(level||'').trim());}
export function attitudeLevelCode(level){return ATTITUDE_DEVELOPMENT_LEVELS.find(item=>item.label===String(level||'').trim())?.code||'';}

/* BANK KALIMAT BUKTI PERILAKU - TIGA PILIHAN UNTUK TIAP DIMENSI.
   Terstruktur per dimensionId, bukan sekadar deretan teks di DOM, supaya dropdown Gotong Royong
   tidak pernah menawarkan bukti milik Kreatif. Kalimatnya sengaja dibiarkan berhuruf kecil di
   awal karena selalu menempel di tengah kalimat, setelah "yang ditunjukkan melalui". */
export const ATTITUDE_EVIDENCE_BANK=Object.freeze({
  'faith':Object.freeze([
    'konsistensinya dalam berdoa sebelum belajar serta menghormati perbedaan agama teman',
    'ketaatannya dalam menjalankan ibadah harian dan menjaga kebersihan lingkungan kelas',
    'tutur katanya yang santun terhadap guru serta sikap peduli pada sesama makhluk hidup',
  ]),
  'mutual-cooperation':Object.freeze([
    'kerelaannya berbagi tugas dan aktif membantu teman saat kegiatan diskusi kelompok',
    'inisiatifnya dalam menjaga kebersihan kelas bersama dan menyukseskan kegiatan sekolah',
    'kemampuannya bekerja sama secara harmonis dalam menyelesaikan tugas kelompok',
  ]),
  'independent':Object.freeze([
    'kesadarannya dalam menyiapkan peralatan belajar sendiri tanpa perlu diingatkan guru',
    'tanggung jawabnya untuk menyelesaikan tugas-tugas kelas tepat waktu secara mandiri',
    'kemampuannya mengatur waktu belajar dan mengelola emosi dengan baik saat menghadapi kesulitan',
  ]),
  'critical-reasoning':Object.freeze([
    'keberaniannya mengajukan pertanyaan kritis dan mengolah informasi menjadi gagasan baru',
    'kemampuannya menganalisis masalah sederhana di kelas dan memberikan solusi yang logis',
    'kebiasaannya mengidentifikasi fakta secara objektif sebelum mengambil keputusan belajar',
  ]),
  'creative':Object.freeze([
    'kemampuannya menghasilkan gagasan orisinal saat memecahkan masalah dalam tugas seni',
    'antusiasmenya dalam memodifikasi karya seni atau produk tugas menjadi lebih menarik',
    'keluwesannya dalam mencari alternatif solusi ketika rencana belajarnya mengalami hambatan',
  ]),
  'global-diversity':Object.freeze([
    'keterbukaannya dalam berteman dengan siapa saja tanpa membedakan suku maupun latar belakang',
    'minatnya yang besar untuk mempelajari ragam budaya daerah lain melalui materi pelajaran',
    'kemampuannya menyelesaikan perselisihan dengan teman secara damai dan toleran',
  ]),
});
export function attitudeEvidenceOptions(dimensionId){return [...(ATTITUDE_EVIDENCE_BANK[String(dimensionId||'')]||[])];}
function normalizeEvidence(value){return String(value??'').trim().replace(/\s+/g,' ').replace(/\.+$/,'');}

/* BUKTI TERIKAT PADA DIMENSINYA.
   Mengganti dimensi berarti bukti dimensi sebelumnya gugur. Penjagaannya diletakkan di layanan,
   bukan hanya di layar, sehingga "Dimensi Mandiri dengan bukti Gotong Royong" tidak pernah bisa
   tersimpan lewat jalur mana pun. Bukti kosong tetap boleh: deskripsinya cukup tanpa klausa
   bukti, dan catatan lama yang memang belum punya bukti tidak dipaksa mengarang. */
export function isAttitudeEvidenceOf(dimensionId,evidence){
  const bukti=normalizeEvidence(evidence);
  if(!bukti)return true;
  return attitudeEvidenceOptions(dimensionId).some(item=>normalizeEvidence(item)===bukti);
}

function clone(value){return JSON.parse(JSON.stringify(value));}
function assertTeacher(session){if(session?.role!=='teacher'||!session.classId)throw new Error('Session Guru tidak valid.');}
function requireStudent(session,studentId){assertTeacher(session);const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);if(!student)throw new Error('Siswa tidak ditemukan pada scope aktif.');return student;}
function key(session,studentId,dimensionId){return `${scopeKey(session)}|${studentId}|${dimensionId}`;}

/* CATATAN LAMA DIBACA APA ADANYA, TIDAK DIMIGRASI.
   Catatan sebelum versi ini tidak punya behaviorEvidence, dan developmentLevel-nya memang
   tersimpan pada field level sejak awal. Keduanya cukup diturunkan saat dibaca: tidak ada
   penulisan ulang database, tidak ada bukti yang dikarang untuk data lama, dan rapor tetap
   bisa mencetaknya. */
function hydrate(record){
  const level=String(record?.level||'');
  return {...record,level,developmentLevel:level,
    levelCode:attitudeLevelCode(level),
    behaviorEvidence:normalizeEvidence(record?.behaviorEvidence)};
}

/* RUMUS DESKRIPSI SIKAP.
   [Nama] + [Status Perkembangan] + " dalam dimensi " + [Dimensi] + ", yang ditunjukkan melalui "
   + [Bukti Perilaku] + ".", memakai sapaan "Ananda" seperti seluruh deskripsi lain di aplikasi
   ini. Statusnya ditulis huruf kecil karena berada di tengah kalimat, dan nama yang sudah
   diawali "Ananda" tidak disapa dua kali. */
export function generateAttitudeDescription(studentName,dimensionId,level,behaviorEvidence=''){
  const dimension=ATTITUDE_DIMENSIONS.find(item=>item.id===dimensionId);
  if(!dimension)throw new Error('Dimensi sikap tidak valid.');
  const capaian=String(level||'').trim();
  if(!isAttitudeLevel(capaian))throw new Error('Capaian sikap tidak valid.');
  const bukti=normalizeEvidence(behaviorEvidence);
  if(!isAttitudeEvidenceOf(dimensionId,bukti))throw new Error(`Bukti perilaku tidak sesuai dengan dimensi ${dimension.label}.`);
  const nama=String(studentName??'').trim();
  const sapaan=/^ananda\b/i.test(nama)?nama:`Ananda ${nama}`.trim();
  const inti=`${sapaan} ${capaian.toLowerCase()} dalam dimensi ${dimension.label}`;
  return bukti?`${inti}, yang ditunjukkan melalui ${bukti}.`:`${inti}.`;
}

export function listStudentAttitudes(session,studentId){
  const student=requireStudent(session,studentId);
  const db=loadDb();
  return ATTITUDE_DIMENSIONS.map(dimension=>{
    const record=db.attitudeProfiles?.[key(session,studentId,dimension.id)];
    return record
      ?hydrate(clone(record))
      :hydrate({studentId,dimensionId:dimension.id,dimensionLabel:dimension.label,level:'',description:'',
        status:'EMPTY',classId:session.classId,semester:session.semester,academicYear:session.academicYear,
        studentName:student.name});
  });
}

export function saveStudentAttitude(session,studentId,dimensionId,input){
  const student=requireStudent(session,studentId);
  const dimension=ATTITUDE_DIMENSIONS.find(item=>item.id===dimensionId);
  if(!dimension)throw new Error('Dimensi sikap tidak valid.');
  const level=String(input?.level||'').trim();
  if(!isAttitudeLevel(level))throw new Error('Capaian sikap wajib dipilih.');
  const behaviorEvidence=normalizeEvidence(input?.behaviorEvidence);
  if(!isAttitudeEvidenceOf(dimensionId,behaviorEvidence))throw new Error(`Bukti perilaku tidak sesuai dengan dimensi ${dimension.label}.`);
  const automatic=generateAttitudeDescription(student.name,dimensionId,level,behaviorEvidence);
  const description=String(input?.description||automatic).trim().slice(0,1200);
  if(!description)throw new Error('Deskripsi sikap wajib diisi.');
  let saved;
  updateDb(db=>{
    const recordKey=key(session,studentId,dimensionId);
    const existing=db.attitudeProfiles[recordKey];
    const now=new Date().toISOString();
    saved={studentId,studentName:student.name,dimensionId,dimensionLabel:dimension.label,level,behaviorEvidence,
      description,status:description===automatic?'AUTO':'EDITED',classId:session.classId,semester:session.semester,
      academicYear:session.academicYear,createdAt:existing?.createdAt||now,updatedAt:now};
    db.attitudeProfiles[recordKey]=saved;
    return db;
  });
  return hydrate(clone(saved));
}

export function getClassAttitudes(session){assertTeacher(session);return listStudents(session,{classId:session.classId}).map(student=>({student,dimensions:listStudentAttitudes(session,student.id)}));}

/* Mengosongkan satu dimensi sikap. Catatannya dihapus, bukan disimpan dengan capaian kosong,
   sehingga dimensi itu kembali berstatus EMPTY dan tidak muncul di rapor.

   Guru butuh jalan keluar. Tanpa ini, satu dimensi yang pernah terisi - termasuk oleh versi
   lama yang mengisi keenamnya sekaligus - tidak akan pernah bisa dikosongkan lagi. */
export function clearStudentAttitude(session,studentId,dimensionId){
  requireStudent(session,studentId);
  const dimension=ATTITUDE_DIMENSIONS.find(item=>item.id===dimensionId);
  if(!dimension)throw new Error('Dimensi sikap tidak valid.');
  let removed=false;
  updateDb(db=>{
    const recordKey=key(session,studentId,dimensionId);
    if(db.attitudeProfiles?.[recordKey]){delete db.attitudeProfiles[recordKey];removed=true;}
    return db;
  });
  return removed;
}

/* ISI SEMUA SISWA MENYALIN PILIHAN GURU PERSIS SEPERTI ADANYA.

   Yang dicentang diisi; yang TIDAK dicentang dikosongkan. Guru yang memilih tiga dimensi
   mendapat tiga dimensi - bukan tiga yang baru ditambah tiga sisa dari pengisian sebelumnya.

   Dulu fungsi ini hanya menulis dimensi terpilih dan membiarkan sisanya apa adanya. Akibatnya
   catatan lama - misalnya dari versi yang mengisi keenam dimensi sekaligus - tetap hidup, dan
   guru yang memilih tiga tetap melihat enam tersimpan tanpa ada cara membatalkannya. Menilai
   dimensi yang tidak pernah dipilih berarti mengarang penilaian sikap yang tidak pernah
   dilakukan guru, dan itulah yang diperbaiki di sini.

   Batasnya tetap sempit: hanya dimensi sikap, hanya murid rombel aktif, hanya pada tahun,
   semester, dan kelas yang sedang dibuka. Nilai, kehadiran, Intrakurikuler, dan data rombel
   maupun semester lain tidak tersentuh sama sekali.

   Menerima satu id (bentuk lama) maupun daftar id, sehingga pemanggil lama tetap berjalan.

   BUKTI PERILAKU BERSIFAT PER DIMENSI, jadi diterima sebagai peta dimensionId -> bukti dan
   bukan satu bukti untuk semua. Argumen keempat boleh dilewatkan: pemanggil lama yang hanya
   mengirim capaian tetap menghasilkan deskripsi tanpa klausa bukti, bukan bukti yang dikarang.
   Deskripsi tiap murid tetap dibuat ulang dengan namanya sendiri, dan guru masih bebas
   menyunting satu per satu sesudahnya. */
export function saveClassAttitudeBulk(session,dimensionIds,level,evidenceByDimension={}){
  assertTeacher(session);
  const daftar=[...new Set((Array.isArray(dimensionIds)?dimensionIds:[dimensionIds])
    .map(id=>String(id||'').trim()).filter(Boolean))];
  if(!daftar.length)throw new Error('Pilih minimal satu dimensi sikap yang akan diisi.');
  const tidakDikenal=daftar.filter(id=>!ATTITUDE_DIMENSIONS.some(item=>item.id===id));
  if(tidakDikenal.length)throw new Error('Dimensi sikap tidak valid.');
  const bukti=new Map(daftar.map(id=>{
    const nilai=normalizeEvidence(evidenceByDimension?.[id]);
    if(!isAttitudeEvidenceOf(id,nilai))throw new Error(`Bukti perilaku tidak sesuai dengan dimensi ${ATTITUDE_DIMENSIONS.find(item=>item.id===id).label}.`);
    return [id,nilai];
  }));
  const terpilih=new Set(daftar);
  const dibersihkan=ATTITUDE_DIMENSIONS.map(item=>item.id).filter(id=>!terpilih.has(id));
  const students=listStudents(session,{classId:session.classId});
  const hasil=[];
  for(const student of students){
    for(const dimensionId of daftar)
      hasil.push(saveStudentAttitude(session,student.id,dimensionId,{level,behaviorEvidence:bukti.get(dimensionId)}));
    for(const dimensionId of dibersihkan)
      clearStudentAttitude(session,student.id,dimensionId);
  }
  return hasil;
}
