export const SCHOOL = 'SDN Satria Jaya 01';
export const ACADEMIC_YEAR = '2026/2027';
export const SEMESTERS = [`Ganjil ${ACADEMIC_YEAR}`, `Genap ${ACADEMIC_YEAR}`];

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

export const MENU_ADMIN = [
  ['dashboard','Dashboard','grid'],
  ['profile','Profile','user'],
  ['students','Data Siswa','users'],
  ['users','Data Pengguna','users'],
  ['reference','Data Referensi','database'],
  ['cocurricular','Data Kokurikuler','activity'],
  ['assessment-status','Status Penilaian','check'],
  ['progress','Perkembangan Nilai','chart'],
  ['transcript','Transkrip Ijazah','file'],
  ['print','Cetak Nilai','printer'],
  ['settings','Pengaturan','settings'],
  ['account-settings','Pengaturan Akun','settings'],
];

export const MENU_TEACHER = [
  ['dashboard','Dashboard','grid'],
  ['profile','Profile','user'],
  ['students','Data Siswa','users'],
  ['attendance','Absensi','calendar'],
  ['assessment','Penilaian','edit'],
  ['attitudes','Dimensi Nilai Sikap','activity'],
  ['weights','Bobot Penilaian','sliders'],
  ['objectives','Tujuan Pembelajaran','target'],
  ['report-input','Input Nilai Rapor','clipboard'],
  ['saved-scores','Nilai Tersimpan','save'],
  ['assessment-check','Cek Penilaian','check'],
  ['__section__','MENU WALI KELAS',''],
  ['completeness-input','Input Kelengkapan','list'],
  ['class-check','Cek Penilaian Kelas','check-circle'],
  ['progress','Perkembangan Nilai','chart'],
  ['transcript','Transkrip Ijazah','file'],
  ['print','Cetak Nilai','printer'],
  ['__section__','PENGATURAN',''],
  ['subject-mapping','Mapping Mata Pelajaran','shuffle'],
  ['backup','Backup & Restore','database'],
  ['account-settings','Pengaturan Akun','settings'],
];

/* Mapel agama dipetakan ke agama siswa. Master mapel tidak dihapus; hanya disaring per siswa
   sehingga siswa Kristen tidak dianggap belum lengkap karena nilai Agama Islam kosong. */
export const RELIGIONS=['Islam','Kristen','Katolik','Hindu','Buddha','Konghucu'];
export const RELIGION_SUBJECTS=Object.freeze({agama:'Islam',agama_kristen:'Kristen'});
export function isReligionSubject(subjectId){return Object.hasOwn(RELIGION_SUBJECTS,subjectId);}
