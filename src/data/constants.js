import { flattenNavigation } from './navigation.js';

export const SCHOOL = 'SDN Satria Jaya 01';
/* Tahun pelajaran dasar. Nilai ini TIDAK boleh berubah mengikuti tanggal karena ikut menyusun
   kunci penyimpanan data (tahun|semester|rombel). Mengubahnya membuat data guru yang sudah ada
   berada pada scope lain dan seolah hilang dari layar. */
export const ACADEMIC_YEAR = '2026/2027';
export const SEMESTERS = [`Ganjil ${ACADEMIC_YEAR}`, `Genap ${ACADEMIC_YEAR}`];

/* Tahun pelajaran berjalan menurut kalender: tahun ajaran baru dimulai bulan Juli. Dipakai untuk
   menyediakan pilihan tahun berikutnya secara otomatis, bukan untuk mengganti data yang ada. */
export function academicYearOf(date = new Date()){
  const tanggal = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const tahun = tanggal.getFullYear();
  const mulai = tanggal.getMonth() >= 6 ? tahun : tahun - 1;
  return `${mulai}/${mulai + 1}`;
}

export const semestersOf = year => [`Ganjil ${year}`, `Genap ${year}`];

/* Semester yang sedang berlangsung: Juli sampai Desember Ganjil, Januari sampai Juni Genap.
   Dipakai untuk menentukan pilihan awal pada halaman Masuk agar guru tidak tanpa sadar membuka
   tahun pelajaran berikutnya yang datanya memang masih kosong. */
export function currentSemesterLabel(date = new Date()){
  const tanggal = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${tanggal.getMonth() >= 6 ? 'Ganjil' : 'Genap'} ${academicYearOf(tanggal)}`;
}

/* Daftar tahun pelajaran yang selalu tersedia: tahun dasar, tahun berjalan, dan tahun berikutnya.
   Dengan begitu ketika Juli tiba, semester tahun baru sudah muncul sendiri di halaman Masuk tanpa
   guru perlu menambahkannya manual, sementara tahun-tahun lama tetap ada beserta datanya. */
export function availableAcademicYears(date = new Date()){
  const berjalan = academicYearOf(date);
  const berikutnya = `${Number(berjalan.slice(0, 4)) + 1}/${Number(berjalan.slice(0, 4)) + 2}`;
  return [...new Set([ACADEMIC_YEAR, berjalan, berikutnya])].sort();
}

export const CLASSES = Array.from({length: 6}, (_, gi) => gi + 1)
  .flatMap(grade => ['A','B','C','D'].map(letter => `${grade}${letter}`));

export const SUBJECTS_DEFAULT = [
  { id:'agama', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Pendidikan Agama Islam dan Budi Pekerti', active:true, order:1 },
  { id:'agama_kristen', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Pendidikan Agama Kristen dan Budi Pekerti', active:true, order:2 },
  { id:'pancasila', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Pendidikan Pancasila', active:true, order:3 },
  { id:'bindo', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Bahasa Indonesia', active:true, order:4 },
  { id:'mtk', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Matematika', active:true, order:5 },
  { id:'ipas', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Ilmu Pengetahuan Alam dan Sosial (IPAS)', active:true, order:6 },
  { id:'pjok', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Pendidikan Jasmani, Olahraga, dan Kesehatan', active:true, order:7 },
  { id:'seni', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Seni dan Budaya', active:true, order:8 },
  { id:'seni_rupa', group:'A', groupLabel:'Kelompok Mata Pelajaran Wajib', name:'Seni Rupa', active:true, order:9 },
  { id:'bing', group:'B', groupLabel:'Kelompok Mata Pelajaran Pilihan', name:'Bahasa Inggris', active:true, order:1 },
  { id:'sunda', group:'B', groupLabel:'Kelompok Mata Pelajaran Pilihan', parent:'Muatan Lokal', name:'Bahasa Sunda', active:true, order:2 },
  { id:'koding', group:'B', groupLabel:'Kelompok Mata Pelajaran Pilihan', parent:'Muatan Lokal', name:'Koding dan Kecerdasan Artifisial', active:true, order:3 },
];

export const ASSESSMENT_DEFAULT = {
  formative: 30,
  daily: 20,
  practice: 20,
  scopeSummative: 15,
  semesterSummative: 15,
};

/* Kompatibilitas sementara untuk modul lama. Sumber menu tunggal tetap navigation.js. */
const legacyMenu=role=>flattenNavigation(role).map(({route,label,icon})=>[route,label,icon]);
export const MENU_ADMIN=legacyMenu('admin');
export const MENU_TEACHER=legacyMenu('teacher');

/* Mapel agama dipetakan ke agama siswa. Master mapel tidak dihapus; hanya disaring per siswa
   sehingga siswa Kristen tidak dianggap belum lengkap karena nilai Agama Islam kosong. */
export const RELIGIONS=['Islam','Kristen','Katolik','Hindu','Buddha','Konghucu'];
export const RELIGION_SUBJECTS=Object.freeze({agama:'Islam',agama_kristen:'Kristen'});
export function isReligionSubject(subjectId){return Object.hasOwn(RELIGION_SUBJECTS,subjectId);}

function normalizeReligionText(value){return String(value||'').trim().toLowerCase();}

/* Agama sebuah mapel dikenali dari id bawaan maupun dari namanya, sehingga Mapping lama yang
   memakai id berbeda (misalnya "pai" atau "agama_katolik") tetap dikenali sebagai mapel agama
   dan tidak pernah hilang dari rapor siswa. */
export function religionOfSubject(subject){
  if(!subject)return null;
  const id=normalizeReligionText(subject.id);
  if(Object.hasOwn(RELIGION_SUBJECTS,id))return RELIGION_SUBJECTS[id];
  const name=normalizeReligionText(subject.name);
  if(!/agama/.test(`${id} ${name}`)&&!/^(pai|pak)\b/.test(id))return null;
  if(/^pai\b/.test(id))return 'Islam';
  if(/^pak\b/.test(id))return 'Kristen';
  const cocok=RELIGIONS.find(religion=>new RegExp(`\\b${normalizeReligionText(religion)}`).test(`${id} ${name}`));
  return cocok||null;
}

/* Agama siswa dan agama mapel dicocokkan longgar agar penulisan seperti "Kristen Protestan"
   tetap mendapat mapel Pendidikan Agama Kristen. */
export function religionMatches(subjectReligion,studentReligion){
  const mapel=normalizeReligionText(subjectReligion),siswa=normalizeReligionText(studentReligion);
  if(!mapel||!siswa)return false;
  return mapel===siswa||siswa.includes(mapel)||mapel.includes(siswa);
}
