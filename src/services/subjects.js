import { RELIGION_SUBJECTS, SUBJECTS_DEFAULT, isReligionSubject, religionMatches, religionOfSubject } from '../data/constants.js';
import { getSubjectMapping } from './storage.js';
import { assignedSubjectIds, PESAN_BELUM_DITUGASKAN, PESAN_DI_LUAR_PENUGASAN,
  teacherAssignmentState } from './teacher-assignments.js';

function assertTeacherSession(session){
  if(!session || session.role!=='teacher' || !session.classId) throw new Error('Session Guru tidak valid.');
}

/* URUTAN TUNGGAL. Sampai 1.3.1 fungsi ini mendahulukan Kelompok A lalu Kelompok B, sehingga
   urutan mapel milik Guru bisa berbeda dari urutan yang diatur Admin pada Mapping. Sejak 1.3.2
   nomor urut Mapping sudah tunggal 1..N, jadi ia satu-satunya penentu urutan di sini. */
function bySubjectOrder(a,b){return (Number(a.order)||0)-(Number(b.order)||0);}

/* SATU-SATUNYA PINTU MASUK daftar mapel milik Guru, sehingga penugasan Admin ikut berlaku pada
   penilaian, deskripsi, rapor, dan leger sekaligus — bukan sekadar menyembunyikan menu. Guru
   yang mengetik subjectId sendiri, memanggil layanan langsung, atau mengubah rute tetap
   melewati gerbang yang sama.

   BELUM DITUGASKAN BERARTI DAFTARNYA KOSONG. Tidak ada hak akses bawaan bagi rombel yang belum
   diatur Admin: Admin adalah sumber otorisasi, dan diamnya Admin bukan izin. */
export function listActiveSubjects(session){
  assertTeacherSession(session);
  const izin=assignedSubjectIds(session);
  return getSubjectMapping(session)
    .filter(subject=>subject.active)
    .filter(subject=>izin===null||izin.includes(subject.id))
    .sort(bySubjectOrder)
    .map(subject=>({...subject}));
}

export function requireActiveSubject(session,subjectId){
  const subject=listActiveSubjects(session).find(item=>item.id===subjectId);
  if(!subject){
    /* Alasannya dibedakan supaya guru tahu harus berbuat apa: belum ditugaskan sama sekali,
       ditugaskan tetapi bukan mapel ini, atau mapelnya memang tidak aktif pada Mapping. */
    const keadaan=teacherAssignmentState(session);
    if(keadaan.applies&&!keadaan.allowed)throw new Error(PESAN_BELUM_DITUGASKAN);
    const izin=assignedSubjectIds(session);
    if(izin!==null&&!izin.includes(String(subjectId)))throw new Error(PESAN_DI_LUAR_PENUGASAN);
    throw new Error('Mata pelajaran tidak aktif pada Mapping Mata Pelajaran scope ini.');
  }
  return subject;
}

/* Agama siswa tidak pernah ditebak. Selama Data Siswa belum diisi, tidak ada mapel agama yang
   dipilihkan untuk siswa tersebut. Pemetaan agama ke mapel diambil dari RELIGION_SUBJECTS,
   sehingga menambah mapel agama baru cukup dengan menambah satu entri di sana. */
export function religionSubjectIdFor(student){
  const religion=String(student?.religion||'').trim();
  if(!religion)return null;
  return Object.keys(RELIGION_SUBJECTS).find(id=>religionMatches(RELIGION_SUBJECTS[id],religion))||null;
}

/* Status pengisian agama siswa, dipakai Cek Kelengkapan untuk menuntun guru ke Data Siswa. */
export function hasStudentReligion(student){return Boolean(String(student?.religion||'').trim());}

/* Mapel agama milik satu siswa dicari berlapis: mapel aktif lebih dulu, lalu seluruh Mapping
   walau statusnya nonaktif, terakhir master mapel bawaan. Mapel agama memang bersifat per
   siswa, bukan per rombel, sehingga tidak boleh hilang dari rapor hanya karena guru belum
   mengaktifkannya di Mapping atau memakai id yang berbeda. */
export function religionSubjectForStudent(session,student){
  const religion=String(student?.religion||'').trim();
  if(!religion)return null;
  const mapping=getSubjectMapping(session);
  const sumber=[
    ...mapping.filter(subject=>subject.active),
    ...mapping,
    ...SUBJECTS_DEFAULT,
  ];
  const cocok=sumber.find(subject=>religionMatches(religionOfSubject(subject),religion));
  return cocok?{...cocok,active:true}:null;
}

/* Mapel agama yang tidak sesuai benar-benar dikeluarkan dari daftar, bukan disembunyikan CSS.
   Nilai agama yang terlanjur tersimpan tidak dihapus, hanya tidak ditampilkan. */
export function listSubjectsForStudent(session,student){
  const aktif=listActiveSubjects(session);
  const bukanAgama=aktif.filter(subject=>!religionOfSubject(subject));
  const agama=religionSubjectForStudent(session,student);
  if(!agama)return bukanAgama;
  return [...bukanAgama,agama].sort(bySubjectOrder);
}

export { isReligionSubject, religionOfSubject };

/* NAMA MATA PELAJARAN UNTUK LEMBAR RAPOR.
   Panduan Pembelajaran dan Asesmen meminta nama resmi ditulis utuh tanpa singkatan dalam
   tanda kurung: "Ilmu Pengetahuan Alam dan Sosial (IPAS)" dicetak "Ilmu Pengetahuan Alam
   dan Sosial". Ini SEMATA lapisan tampilan. Id mapel, key database, mapping, penugasan Guru,
   dan master nama tidak ikut berubah, sehingga tidak ada migrasi apa pun di sini.

   Kurung hanya dilepas bila isinya benar-benar singkatan dari namanya sendiri: huruf besar,
   dan setiap hurufnya muncul berurutan pada inisial kata-kata nama itu. Keterangan yang
   bermakna lain - misalnya "Bahasa Sunda (Muatan Lokal)" - tetap utuh, karena membuang
   kurung secara membabi buta akan menghapus informasi, bukan merapikan. */
const KATA_SAMBUNG=new Set(['dan','atau','serta','yang','pada','di','ke','dari','untuk','bagi','the','of']);
export function reportSubjectName(name){
  const teks=String(name??'').trim();
  const cocok=teks.match(/^(.+?)\s*\(([^()]+)\)$/);
  if(!cocok)return teks;
  const dasar=cocok[1].trim();
  const singkatan=cocok[2].trim().replace(/\./g,'');
  if(!dasar||!/^[A-Z]{2,10}$/.test(singkatan))return teks;
  const inisial=dasar.split(/[\s,]+/).filter(Boolean)
    .filter(kata=>!KATA_SAMBUNG.has(kata.toLowerCase()))
    .map(kata=>kata[0].toUpperCase()).join('');
  let posisi=0;
  for(const huruf of singkatan){
    posisi=inisial.indexOf(huruf,posisi);
    if(posisi<0)return teks;
    posisi+=1;
  }
  return dasar;
}
