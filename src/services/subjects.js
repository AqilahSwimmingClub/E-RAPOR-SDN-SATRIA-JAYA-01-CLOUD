import { RELIGION_SUBJECTS, SUBJECTS_DEFAULT, isReligionSubject, religionMatches, religionOfSubject } from '../data/constants.js';
import { getSubjectMapping } from './storage.js';
import { assignedSubjectIds, PESAN_BELUM_DITUGASKAN, PESAN_DI_LUAR_PENUGASAN,
  teacherAssignmentState } from './teacher-assignments.js';

function assertTeacherSession(session){
  if(!session || session.role!=='teacher' || !session.classId) throw new Error('Session Guru tidak valid.');
}

function bySubjectOrder(a,b){return (a.group==='A'?0:1)-(b.group==='A'?0:1)||a.order-b.order;}

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

export { isReligionSubject };
