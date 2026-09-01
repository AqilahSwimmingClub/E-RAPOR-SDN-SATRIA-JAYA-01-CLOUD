function item(id,label,icon,route){return Object.freeze({id,label,icon,route});}
function group(id,label,icon,children){return Object.freeze({id,label,icon,children:Object.freeze(children)});}

export const NAVIGATION=Object.freeze({
  admin:Object.freeze([
    group('main','UTAMA','grid',[
      item('dashboard','Dashboard','grid','dashboard'),
      item('profile','Profil','user','profile')
    ]),
    group('dapodik','Dapodik','database',[
      item('dapodik-service','Web Service Dapodik','settings','dapodik-service'),
      item('dapodik-pull','Ambil Data Dapodik','download','dapodik-pull'),
      item('dapodik-push','Kirim Nilai ke Dapodik','upload','dapodik-push')
    ]),
    group('users','DATA PENGGUNA','users',[
      item('users','Data Pengguna','users','users')
    ]),
    group('reference','Data Referensi','database',[
      item('reference-school','Data Sekolah','school','reference-school'),
      item('reference-teachers','Data Guru','users','reference-teachers'),
      item('reference-students','Data Siswa','users','reference-students'),
      item('reference-classes','Data Kelas/Rombel','grid','reference-classes'),
      item('reference-subjects','Mata Pelajaran','book','reference-subjects'),
      item('reference-learning','Pembelajaran','target','reference-learning'),
      item('reference-mapping','Mapping Mata Pelajaran','shuffle','reference-mapping'),
      item('reference-branding','Logo dan Tanda Tangan','image','reference-branding'),
      item('reference-report-date','Tanggal Rapor','calendar','reference-report-date')
    ]),
    group('activities','KEGIATAN','activity',[
      item('cocurricular','Data Kokurikuler','activity','cocurricular'),
      item('intracurricular','Data Intrakurikuler','activity','intracurricular')
    ]),
    group('admin-assessment','Status Penilaian','check',[
      item('assessment-status','Status Penilaian','check','assessment-status'),
      item('assessment-statistics','Statistik Nilai','chart','assessment-statistics')
    ]),
    group('admin-progress','Perkembangan Nilai','chart',[
      item('admin-progress','Perkembangan Nilai','chart','admin-progress'),
      item('admin-progress-graph','Grafik Nilai','chart','admin-progress-graph')
    ]),
    group('admin-transcript','Transkrip Ijazah','file',[
      item('transcript-number-import','Import Nomor Ijazah','upload','transcript-number-import'),
      item('transcript-settings','Setting Transkrip','settings','transcript-settings'),
      item('transcript-mapping','Mapping Mapel','shuffle','transcript-mapping'),
      item('transcript-input','Input Nilai Transkrip','edit','transcript-input'),
      item('transcript-import','Import Nilai Transkrip','upload','transcript-import'),
      item('transcript-print','Cetak Transkrip Nilai','printer','transcript-print')
    ]),
    group('admin-print','Cetak Nilai','printer',[
      item('print-ledger','Leger Rapor','file','print-ledger'),
      item('print-supplement','Pelengkap Rapor','file','print-supplement'),
      item('print-report','Nilai Rapor','printer','print-report')
    ]),
    group('admin-backup','BACKUP','database',[
      item('backup','Backup & Restore','database','backup')
    ]),
    group('admin-account','AKUN','settings',[
      item('account-settings','Pengaturan Akun','settings','account-settings')
    ])
  ]),
  teacher:Object.freeze([
    group('main','UTAMA','grid',[
      item('dashboard','Dashboard','grid','dashboard'),
      item('profile','Profil','user','profile'),
      item('objectives','Tujuan Pembelajaran','target','objectives')
    ]),
    group('report-input','Input Nilai Rapor','clipboard',[
      item('report-input-form','Input Nilai Rapor','edit','report-input'),
      item('report-import','Import Nilai Rapor','upload','report-import')
    ]),
    group('saved','Nilai Tersimpan','save',[
      item('saved-scores','Cek Nilai Rapor','check','saved-scores'),
      item('saved-descriptions','Cek Deskripsi Rapor','check','saved-descriptions')
    ]),
    group('teacher-assessment','Cek Penilaian','check',[
      item('teacher-status','Status Penilaian','check','teacher-status'),
      item('teacher-achievement','Capaian Nilai Rapor','chart','teacher-achievement'),
      item('teacher-score-graph','Grafik Nilai Rapor','chart','teacher-score-graph')
    ]),
    group('completeness','Input Kelengkapan','list',[
      item('student-update','Update Data Siswa','users','student-update'),
      item('attendance','Input Kehadiran','calendar','attendance'),
      item('extra-input','Input Nilai Ekskul','activity','extra-input'),
      item('cocurricular-input','Input Nilai Kokurikuler','activity','cocurricular-input'),
      item('intracurricular-input','Input Nilai Intrakurikuler','activity','intracurricular-input'),
      item('homeroom-note','Input Catatan Wali Kelas','edit','homeroom-note'),
      item('promotion-input','Input Kenaikan Kelas','check','promotion-input')
    ]),
    group('class-check','Cek Penilaian Kelas','check-circle',[
      item('class-status','Status Penilaian','check','class-status'),
      item('class-statistics','Statistik Nilai Rapor','chart','class-statistics')
    ]),
    group('teacher-progress','Perkembangan Nilai','chart',[
      item('student-progress','Perkembangan Nilai','chart','student-progress'),
      item('student-progress-graph','Grafik Nilai Rapor','chart','student-progress-graph')
    ]),
    group('teacher-transcript','Transkrip Ijazah','file',[
      item('transcript-input','Input Nilai Transkrip','edit','transcript-input'),
      item('transcript-import','Import Nilai Transkrip','upload','transcript-import'),
      item('transcript-print','Cetak Transkrip Nilai','printer','transcript-print')
    ]),
    group('teacher-print','Cetak Nilai','printer',[
      item('print-ledger','Leger Rapor','file','print-ledger'),
      item('print-supplement','Pelengkap Rapor','file','print-supplement'),
      item('print-report','Nilai Rapor','printer','print-report')
    ]),
    group('teacher-backup','BACKUP','database',[
      item('backup','Backup','database','backup')
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
