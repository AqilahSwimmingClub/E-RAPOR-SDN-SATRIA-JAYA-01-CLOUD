import { loadDb, scopeKey } from './storage.js';

/* PENYIMPANAN BUKTI (EVIDENCE) BUTIR CP.

   Sampai 4087ede seluruh keterangan kompetensi menumpang pada catatan NILAI KOMPONEN, yang
   kuncinya hanya `tahun|semester|rombel|mapel|komponen|siswa`. Satu komponen karena itu hanya
   punya SATU tempat, sehingga menilai Butir CP kedua pada komponen yang sama menimpa bukti
   Butir CP pertama. Dalam satu semester seorang guru wajar melakukan beberapa kegiatan
   Penilaian Harian untuk kompetensi yang berbeda-beda, jadi kehilangan itu bukan sekadar
   ketidaknyamanan: ia menghapus fakta penilaian yang sudah terjadi.

   Berkas ini memisahkan dua hal yang selama ini menumpang di satu tempat:

     NILAI KOMPONEN  - satu angka per siswa per komponen. Tetap tersimpan di `assessmentScores`
                       persis seperti sebelumnya, dan tetap menjadi SATU-SATUNYA masukan
                       formula Nilai Akhir beserta Bobotnya. Tidak ada yang berubah di sana.

     BUKTI BUTIR CP  - satu angka per siswa per komponen PER BUTIR CP, tersimpan di koleksi
                       `cpEvidenceScores` milik berkas ini. Inilah yang dibaca capaian
                       kompetensi, kekuatan, area penguatan, Intrakurikuler, dan deskripsi.

   Karena Bobot hanya pernah menyentuh koleksi yang pertama, menambah bukti sebanyak apa pun
   pada koleksi kedua tidak dapat membuat sebuah komponen dihitung dua kali di dalam Nilai
   Akhir. Kedua koleksi tidak pernah bertukar peran.

   IDENTITAS BUKTI, dan mengapa berbentuk seperti ini:

     tahun | semester | rombel | mapel | siswa | komponen | butir CP

   Ketujuhnya adalah persis yang membedakan satu kegiatan penilaian dari kegiatan lain. Tidak
   ada timestamp maupun angka acak di dalamnya - itu disengaja: identitas yang memuat waktu
   akan melahirkan catatan baru setiap kali tombol Simpan ditekan, dan daftar bukti seorang
   siswa akan menggelembung oleh salinan kegiatan yang sama. Dengan identitas ini, menyimpan
   ulang kombinasi yang sama selalu MEMPERBARUI catatan yang sama, sedangkan Butir CP yang
   berbeda selalu menjadi catatan tersendiri yang berdiri sendiri. */

export function cpEvidenceKey(session,subjectId,studentId,assessmentType,cpButirId){
  return `${scopeKey(session)}|${subjectId}|${studentId}|${assessmentType}|${cpButirId}`;
}
function subjectPrefix(session,subjectId){return `${scopeKey(session)}|${subjectId}|`;}

/* Seluruh bukti satu mata pelajaran pada scope yang sedang dibuka. Penyaringan memakai awalan
   kunci lalu diperiksa ulang lewat isi catatannya, sehingga id yang kebetulan memuat tanda
   pemisah tidak dapat menyeret bukti milik mapel atau rombel lain. */
function evidenceMapel(db,session,subjectId){
  const awalan=subjectPrefix(session,subjectId);
  return Object.entries(db?.cpEvidenceScores||{})
    .filter(([kunci,record])=>kunci.startsWith(awalan)&&record?.subjectId===subjectId)
    .map(([,record])=>record);
}

function angka(value){const number=Number(value);return Number.isFinite(number)?number:null;}

/* BUKTI SATU SISWA, dari koleksi bukti DAN dari catatan nilai lama yang sudah membawa
   keterangan kompetensi sejak 4087ede.

   Catatan 4087ede dibaca sebagai bukti supaya data yang sudah terlanjur tersimpan sebelum
   koleksi ini ada tidak hilang dari capaian - termasuk pada database yang dipulihkan dari
   backup lama. Bila sebuah kombinasi komponen+butir sudah punya catatan di koleksi bukti,
   catatan bukti itulah yang dipakai: ia yang paling mutakhir, dan nilai komponen dapat saja
   sudah ditimpa kegiatan penilaian berikutnya.

   Nilai lama TANPA `cpButirId` tidak pernah masuk ke sini. Tidak ada yang tahu kompetensi
   mana yang diukurnya, jadi menebaknya - ke butir pertama, ke seluruh butir aktif, atau ke
   mana pun - berarti mengarang. Nilai itu tetap utuh di tempatnya dan tetap dipakai Nilai
   Akhir seperti biasa. */
export function cpEvidenceSiswa(db,session,subjectId,studentId){
  const hasil=new Map();
  for(const record of evidenceMapel(db,session,subjectId)){
    if(record?.studentId!==studentId)continue;
    const butirId=String(record?.cpButirId||'').trim();
    const nilai=angka(record?.score);
    if(!butirId||nilai===null)continue;
    hasil.set(`${record.assessmentType}|${butirId}`,{assessmentType:record.assessmentType,cpButirId:butirId,score:nilai});
  }
  const awalan=subjectPrefix(session,subjectId);
  for(const [kunci,record] of Object.entries(db?.assessmentScores||{})){
    if(!kunci.startsWith(awalan))continue;
    if(record?.studentId!==studentId||record?.subjectId!==subjectId)continue;
    const butirId=String(record?.cpButirId||'').trim();
    const nilai=angka(record?.score);
    if(!butirId||nilai===null)continue;
    const kombinasi=`${record.assessmentType}|${butirId}`;
    if(hasil.has(kombinasi))continue;
    hasil.set(kombinasi,{assessmentType:record.assessmentType,cpButirId:butirId,score:nilai});
  }
  return [...hasil.values()];
}

/* Bukti satu komponen untuk satu Butir CP, seluruh siswa sekaligus - inilah yang membuat
   selector Butir CP pada halaman Penilaian menampilkan kembali angka yang memang milik butir
   itu, bukan angka komponen yang mungkin sudah ditimpa kegiatan berikutnya. Sama seperti di
   atas, catatan 4087ede dipakai sebagai cadangan bila koleksi bukti belum memuatnya. */
export function cpEvidenceKomponen(db,session,subjectId,assessmentType,cpButirId){
  const hasil=new Map();
  for(const record of evidenceMapel(db,session,subjectId)){
    if(record?.assessmentType!==assessmentType)continue;
    if(String(record?.cpButirId||'').trim()!==cpButirId)continue;
    if(angka(record?.score)===null)continue;
    hasil.set(record.studentId,record);
  }
  const awalan=subjectPrefix(session,subjectId);
  for(const [kunci,record] of Object.entries(db?.assessmentScores||{})){
    if(!kunci.startsWith(awalan))continue;
    if(record?.subjectId!==subjectId||record?.assessmentType!==assessmentType)continue;
    if(String(record?.cpButirId||'').trim()!==cpButirId)continue;
    if(angka(record?.score)===null)continue;
    if(hasil.has(record.studentId))continue;
    hasil.set(record.studentId,record);
  }
  return hasil;
}

/* Bukti lain milik satu siswa pada komponen yang sama, di luar satu butir tertentu. Dipakai
   saat guru MENGOSONGKAN nilai: yang dikosongkan hanyalah bukti butir yang sedang dibuka,
   sedangkan nilai komponen - yang dipakai Nilai Akhir - diisi kembali dari bukti yang masih
   tersisa. Tanpa ini, mengosongkan bukti satu butir akan ikut menghapus nilai komponen yang
   sebetulnya masih didukung kegiatan penilaian lain. */
export function cpEvidenceLain(db,session,subjectId,assessmentType,studentId,kecualiButirId){
  return evidenceMapel(db,session,subjectId)
    .filter(record=>record?.studentId===studentId&&record?.assessmentType===assessmentType)
    .filter(record=>String(record?.cpButirId||'').trim()&&record.cpButirId!==kecualiButirId)
    .filter(record=>angka(record?.score)!==null)
    /* Urutannya ditetapkan tegas - terbaru dulu, lalu id butir menaik - supaya penggantinya
       selalu sama setiap kali dijalankan pada data yang sama. */
    .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))
      ||String(a.cpButirId).localeCompare(String(b.cpButirId)));
}

/* Tulis atau perbarui satu bukti. Dipanggil DI DALAM updateDb, jadi ia mengubah draft database
   dan tidak menyimpan apa pun sendiri. Kombinasi yang sama selalu menemui kunci yang sama,
   sehingga Simpan berulang memperbarui - tidak pernah menambah salinan. */
export function tulisCpEvidence(db,session,{subjectId,studentId,assessmentType,cpButirId,score,parts=null,now}){
  const kunci=cpEvidenceKey(session,subjectId,studentId,assessmentType,cpButirId);
  const lama=db.cpEvidenceScores?.[kunci]||null;
  if(!db.cpEvidenceScores)db.cpEvidenceScores={};
  db.cpEvidenceScores[kunci]={
    academicYear:session.academicYear,semester:session.semester,classId:session.classId,
    subjectId,studentId,assessmentType,cpButirId,score,
    ...(parts&&Object.keys(parts).length?{parts}:{}),
    createdAt:lama?.createdAt||now,updatedAt:now,
  };
  return db.cpEvidenceScores[kunci];
}

export function hapusCpEvidence(db,session,{subjectId,studentId,assessmentType,cpButirId}){
  if(!db.cpEvidenceScores)return;
  delete db.cpEvidenceScores[cpEvidenceKey(session,subjectId,studentId,assessmentType,cpButirId)];
}

/* PEMINDAHAN DATA 4087ede KE KOLEKSI BUKTI.

   Non-destruktif: catatan nilai aslinya tidak disentuh sama sekali - tidak dihapus, tidak
   diubah, dan `cpButirId`-nya tetap di tempatnya. Yang terjadi hanyalah bukti yang BELUM ada
   disalin ke koleksi bukti.

   Idempotent: kombinasi yang sudah punya catatan bukti dilewati, jadi menjalankannya berulang
   kali tidak pernah menghasilkan salinan kedua maupun menimpa nilai yang sudah diperbarui
   guru.

   Dijalankan tepat sebelum sebuah penyimpanan ber-Butir CP menulis nilai komponen, yaitu
   satu-satunya saat bukti 4087ede dapat tertimpa. Nilai lama tanpa `cpButirId` tidak ikut,
   karena kompetensinya memang tidak diketahui. */
export function pindahkanEvidenceLama(db,session,subjectId){
  const awalan=subjectPrefix(session,subjectId);
  let dipindahkan=0;
  for(const [kunci,record] of Object.entries(db?.assessmentScores||{})){
    if(!kunci.startsWith(awalan))continue;
    if(record?.subjectId!==subjectId)continue;
    const butirId=String(record?.cpButirId||'').trim();
    const nilai=angka(record?.score);
    if(!butirId||nilai===null||!record?.studentId||!record?.assessmentType)continue;
    const kunciBukti=cpEvidenceKey(session,subjectId,record.studentId,record.assessmentType,butirId);
    if(db.cpEvidenceScores?.[kunciBukti])continue;
    tulisCpEvidence(db,session,{subjectId,studentId:record.studentId,assessmentType:record.assessmentType,
      cpButirId:butirId,score:nilai,parts:record.parts||null,
      now:record.updatedAt||record.createdAt||new Date().toISOString()});
    /* Tanggal dibuat mengikuti catatan asalnya supaya riwayatnya tidak berubah karena pindah. */
    db.cpEvidenceScores[kunciBukti].createdAt=record.createdAt||db.cpEvidenceScores[kunciBukti].createdAt;
    db.cpEvidenceScores[kunciBukti].updatedAt=record.updatedAt||db.cpEvidenceScores[kunciBukti].updatedAt;
    dipindahkan+=1;
  }
  return dipindahkan;
}

/* Pembacaan untuk pemanggil di luar updateDb. */
export function daftarCpEvidence(session,subjectId){return evidenceMapel(loadDb(),session,subjectId);}
