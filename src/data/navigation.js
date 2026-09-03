function item(id,label,icon,route){return Object.freeze({id,label,icon,route});}
function group(id,label,icon,children){return Object.freeze({id,label,icon,children:Object.freeze(children)});}

/* Pembagian menu mengikuti satu prinsip: SATU fungsi, SATU pemilik.

   ADMIN memegang konfigurasi sistem, data master, akun dan penugasan Guru, monitoring
   seluruh sekolah, Dapodik, transkrip, serta backup dan pembaruan.
   GURU memegang pekerjaan operasional rombelnya: TP, KKTP, penilaian, absensi, kegiatan,
   dan rapor.

   Karena itu menu input kegiatan dan cetak rapor tidak lagi muncul pada Admin, dan menu
   Dapodik, transkrip, backup, pembaruan, serta monitoring seluruh sekolah tidak muncul pada
   Guru. Yang dihapus hanyalah AKSES yang menduplikasi; layanan dan datanya tetap utuh. */

export const NAVIGATION=Object.freeze({
  admin:Object.freeze([
    group('main','UTAMA','grid',[
      item('dashboard','Dashboard','grid','dashboard'),
      item('profile','Profil','user','profile')
    ]),
    group('dapodik','DAPODIK','database',[
      item('dapodik-service','Web Service Dapodik','settings','dapodik-service'),
      item('dapodik-pull','Ambil Data Dapodik','download','dapodik-pull'),
      item('dapodik-push','Kirim Nilai ke Dapodik','upload','dapodik-push')
    ]),
    group('users','DATA PENGGUNA','users',[
      item('teacher-assignments','Akun Guru & Penugasan','users','teacher-assignments'),
      item('teacher-readiness','Kesiapan Guru','check','teacher-readiness'),
      item('teacher-access','Hak Akses Guru','settings','teacher-access')
    ]),
    group('reference','DATA REFERENSI','database',[
      item('reference-school','Data Sekolah','school','reference-school'),
      item('reference-teachers','Data Guru','users','reference-teachers'),
      item('reference-students','Data Siswa','users','reference-students'),
      item('student-handover','Serah Terima Siswa','shuffle','student-handover'),
      item('reference-classes','Data Kelas/Rombel','grid','reference-classes'),
      item('reference-subjects','Mata Pelajaran','book','reference-subjects'),
      item('reference-learning','Pembelajaran / CP','target','reference-learning'),
      item('reference-mapping','Mapping Mata Pelajaran','shuffle','reference-mapping'),
      /* Dua butir berikut adalah konfigurasi dokumen milik Admin dan tidak punya pemilik lain;
         menghapusnya membuat logo, tanda tangan, dan tanggal rapor tidak dapat diatur lagi. */
      item('reference-branding','Logo dan Tanda Tangan','image','reference-branding'),
      item('reference-report-date','Tanggal Rapor','calendar','reference-report-date')
    ]),
    group('admin-monitoring','MONITORING','chart',[
      item('assessment-status','Status Penilaian','check','assessment-status'),
      item('assessment-statistics','Statistik Nilai','chart','assessment-statistics'),
      item('admin-progress','Perkembangan Nilai','chart','admin-progress'),
      item('admin-progress-graph','Grafik Nilai','chart','admin-progress-graph')
    ]),
    group('admin-transcript','TRANSKRIP IJAZAH','file',[
      item('transcript-number-import','Import Nomor Ijazah','upload','transcript-number-import'),
      item('transcript-settings','Setting Transkrip','settings','transcript-settings'),
      item('transcript-mapping','Mapping Mapel','shuffle','transcript-mapping'),
      item('transcript-input','Input Nilai Transkrip','edit','transcript-input'),
      item('transcript-import','Import Nilai Transkrip','upload','transcript-import'),
      item('transcript-print','Cetak Transkrip Nilai','printer','transcript-print')
    ]),
    group('admin-backup','BACKUP & RESTORE','database',[
      item('backup','Backup & Restore','database','backup')
    ]),
    group('admin-account','AKUN','settings',[
      item('account-settings','Pengaturan Akun','settings','account-settings'),
      item('about-updates','Tentang & Pembaruan','bell','about-updates')
    ])
  ]),
  teacher:Object.freeze([
    group('main','UTAMA','grid',[
      item('dashboard','Dashboard','grid','dashboard'),
      item('profile','Profil','user','profile')
    ]),
    group('teacher-class','DATA KELAS','users',[
      item('student-update','Data Siswa','users','student-update'),
      item('student-handover','Serah Terima Siswa','shuffle','student-handover')
    ]),
    group('teacher-learning','PEMBELAJARAN','target',[
      item('objectives','Tujuan Pembelajaran','target','objectives'),
      item('weights','KKTP','sliders','weights'),
      item('assessment','Penilaian','edit','assessment'),
      item('attitudes','Penilaian Sikap','activity','attitudes')
    ]),
    group('teacher-activities','KEGIATAN','activity',[
      item('intracurricular-input','Intrakurikuler','activity','intracurricular-input'),
      item('cocurricular-input','Kokurikuler','activity','cocurricular-input'),
      item('extra-input','Ekstrakurikuler','activity','extra-input')
    ]),
    group('teacher-attendance','KEHADIRAN','calendar',[
      item('attendance','Absensi Siswa','calendar','attendance')
    ]),
    /* Guru adalah pemilik pekerjaan rapor. Input dan kelengkapan yang menentukan isi rapor
       ikut di sini supaya rapor tetap dapat diselesaikan tanpa bantuan Admin. */
    group('teacher-report','RAPOR','printer',[
      item('report-input-form','Input Nilai Rapor','edit','report-input'),
      item('report-import','Import Nilai Rapor','upload','report-import'),
      item('homeroom-note','Catatan Wali Kelas','edit','homeroom-note'),
      item('promotion-input','Kenaikan Kelas','check','promotion-input'),
      item('print-report','Nilai Rapor','printer','print-report'),
      item('print-ledger','Leger Rapor','file','print-ledger'),
      item('print-supplement','Pelengkap Rapor','file','print-supplement')
    ]),
    group('teacher-account','AKUN','settings',[
      item('account-settings','Pengaturan Akun','settings','account-settings')
    ])
  ])
});

export function navigationForRole(role){
  return (NAVIGATION[role]||[]).map(section=>({...section,children:section.children.map(entry=>({...entry}))}));
}

export function flattenNavigation(role){return navigationForRole(role).flatMap(section=>section.children);}
