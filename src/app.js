import { initRouter, navigate, onRouteChange, resolveRoute } from './core/router.js';
import { getSession } from './services/auth.js';
import { renderLogin } from './pages/login.js';
import { renderOwnerActivation } from './pages/activation.js';
import { renderSchoolSetup } from './pages/school-setup.js';
import { renderLicenseActivation } from './pages/license-activation.js';
import { checkLicense, getLicenseState, noteClockObservation } from './services/license.js';
import { ensureInstallationId } from './services/installation.js';
import { getAdminReadiness, isTeacherUsageActive } from './services/admin-readiness.js';
import { hasTeacherAssignment, PESAN_BELUM_DITUGASKAN } from './services/teacher-assignments.js';
import { isSchoolIdentityReady } from './services/master.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderProfile } from './pages/profile.js';
import { renderStudents } from './pages/students.js';
import { renderStudentHandover } from './pages/student-handover.js';
import { renderAttendance } from './pages/attendance.js';
import { renderAssessment } from './pages/assessment.js';
import { renderAttitudes } from './pages/attitudes.js';
import { renderWeights } from './pages/weights.js';
import { renderAboutUpdates } from './pages/about-updates.js';
import { renderObjectives } from './pages/objectives.js';
import { renderAssessmentCheck, renderReportInput, renderSavedScores } from './pages/reports.js';
import { renderCompleteness } from './pages/completeness.js';
import { renderIntracurricularInput } from './pages/intracurricular-input.js';
import { renderExtracurricularInput } from './pages/extracurricular-input.js';
import { renderCocurricularInput } from './pages/cocurricular-input.js';
import { renderClassCheck } from './pages/class-overview.js';
import { renderProgress } from './pages/progress.js';
import { renderTranscript } from './pages/transcript.js';
import { renderTranscriptAdmin } from './pages/transcript-admin.js';
import { renderPrint } from './pages/print.js';
import { renderUsers } from './pages/users.js';
import { renderReferences } from './pages/references.js';
import { renderCocurricular } from './pages/cocurricular.js';
import { renderIntracurricular } from './pages/intracurricular.js';
import { renderAdminStatus } from './pages/admin-status.js';
import { renderPlaceholder } from './pages/placeholder.js';
import { renderDapodik } from './pages/dapodik.js';
import { renderSubjectMapping, renderBackupRestore, renderAccountSettings } from './pages/settings.js';
import { renderLayout } from './ui/layout.js';
import { el, escapeHtml } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { runAppMigrations } from './services/migrations.js';
import { ensureDefaultSubjects } from './services/seed.js';

const app=document.querySelector('#app');
let startupError=null;
/* Status lisensi perangkat ini. Dibaca dari token bertanda tangan yang tersimpan lokal,
   sehingga penggunaan sehari-hari tidak pernah menunggu jaringan. */
let licenseState={state:'UNLICENSED',canUseApp:false,canEditData:false,record:null};
function refreshLicenseState(){try{licenseState=getLicenseState();}catch{licenseState={state:'UNLICENSED',canUseApp:false,canEditData:false,record:null};}return licenseState;}
/* Migration dijalankan lebih dulu, lalu satu pengaman idempotent: mapel bawaan baru
   dipastikan ada pada Mapping lama. Tidak ada data siswa yang pernah dimasukkan otomatis.
   Kegagalan pengaman tidak boleh membuat aplikasi gagal dibuka. */
try{runAppMigrations();}catch(error){startupError=error;}
if(!startupError){try{ensureDefaultSubjects();}catch{}}
let session=startupError?null:getSession();
let expiryTimer=null;

/* PEMERIKSAAN LISENSI SAAT STARTUP.

   Sebelumnya `checkLicense` diimpor tetapi tidak pernah dipanggil dari mana pun, sehingga
   catatan lisensi lokal tidak pernah disegarkan: pencabutan oleh Owner tidak pernah sampai ke
   perangkat, dan aplikasi terus berjalan dengan status lama. Sekarang statusnya disegarkan
   sekali saat aplikasi dibuka, tanpa menahan tampilan - hasilnya diterapkan begitu tiba.

   Kegagalan jaringan sengaja tidak mengubah apa pun; `checkLicense` sendiri yang memutuskan
   kapan sebuah status menjadi REVOKED atau SUSPENDED. Tidak ada data yang disentuh. */
function segarkanLisensiDariServer(){
  if(startupError)return;
  /* Waktu yang sedang dilihat aplikasi dicatat lebih dulu, sehingga jam yang dimundurkan tidak
     memperpanjang masa tenggang offline. */
  try{noteClockObservation();}catch{}
  /* Identitas perangkat dikunci lebih dulu. Pada Android dan Windows nilainya diturunkan dari
     perangkat itu sendiri, sehingga catatan lisensi hasil menyalin storage perangkat lain
     langsung ketahuan pada penyegaran status berikutnya. Kegagalannya tidak pernah menahan
     aplikasi: perangkat tanpa sinyal apa pun tetap memakai identitas yang sudah tersimpan. */
  Promise.resolve().then(()=>ensureInstallationId()).catch(()=>{})
    .then(()=>{
      const sebelumIdentitas=licenseState.state;
      if(refreshLicenseState().state!==sebelumIdentitas)navigate(getSession()?'dashboard':'login');
    })
    .then(()=>checkLicense({force:true})).then(()=>{
      const sebelum=licenseState.state;
      if(refreshLicenseState().state!==sebelum)navigate(getSession()?'dashboard':'login');
    }).catch(()=>{});
}

function scheduleSessionExpiry(activeSession){
  clearTimeout(expiryTimer);expiryTimer=null;
  if(!activeSession?.expiresAt)return;
  const remaining=new Date(activeSession.expiresAt).getTime()-Date.now();
  expiryTimer=setTimeout(()=>{if(!getSession())navigate('login');},Math.max(0,remaining)+50);
}

function mount(requestedRoute){
  session=getSession();
  refreshLicenseState();
  scheduleSessionExpiry(session);
  /* AKTIVASI LISENSI SELALU LEBIH DULU.

     Urutan ini pernah terbalik: Setup Awal diperiksa duluan, sehingga instalasi baru yang belum
     punya identitas sekolah langsung membuka Setup Awal dan aktivasi terlewat sama sekali.
     Perangkat wajib punya lisensi yang sah sebelum apa pun yang lain — termasuk sebelum Setup
     Awal. Tidak ada pengecualian berdasarkan sekolah, NPSN, atau siapa pun penggunanya. */
  if(!startupError&&!licenseState.canUseApp){
    document.documentElement.dataset.route='license';
    app.innerHTML='';
    app.append(renderLicenseActivation({onActivated:()=>{refreshLicenseState();navigate('login');}}));
    return;
  }
  /* Baru setelah perangkat berlisensi, identitas sekolah diisi. Setelah nama sekolah tersimpan,
     gerbang ini tidak pernah muncul lagi dan alur kembali ke aktivasi/login yang sudah ada. */
  if(!startupError&&!isSchoolIdentityReady()){
    document.documentElement.dataset.route='school-setup';
    app.innerHTML='';
    app.append(renderSchoolSetup({onComplete:()=>navigate('login')}));
    return;
  }
  const route=resolveRoute(requestedRoute,session);
  if(route!==requestedRoute){navigate(route);return;}
  /* Halaman aktif ditandai di <html> supaya latar halaman Cetak Nilai bisa diputihkan sampai
     ke tepi layar tanpa bergantung pada :has() yang belum tentu didukung WebView lama. */
  document.documentElement.dataset.route=route;
  app.innerHTML='';
  if(route==='login'){
    app.append(renderLogin({onSuccess:(s)=>{session=s;navigate('dashboard')},
      onActivate:()=>navigate('activation'),
      /* Lisensi ternyata sudah dicabut ketika pengguna mencoba masuk: aplikasi kembali ke
         halaman Aktivasi Lisensi. Tidak ada data yang dihapus - hanya hak aksesnya yang
         diputus sampai lisensi dipulihkan atau License Key baru dimasukkan. */
      onLicenseBlocked:()=>{refreshLicenseState();navigate('login');}}));
    return;
  }
  if(route==='activation'){
    app.append(renderOwnerActivation({onComplete:()=>navigate('login'),onBack:()=>navigate('login')}));
    return;
  }
  /* Dua gerbang berlapis: lisensi perangkat, lalu kesiapan yang diatur Admin sekolah. */
  const terkunciLisensi=!licenseState.canEditData&&!READ_ONLY_SAFE_ROUTES.has(route);
  const terkunciAdmin=!terkunciLisensi&&session?.role==='teacher'
    &&!TEACHER_ALWAYS_OPEN_ROUTES.has(route)&&!isTeacherUsageActive(session);
  /* GERBANG KETIGA: penugasan. Akun yang AKTIF tetapi BELUM DITUGASKAN tetap boleh masuk dan
     melihat halaman yang tidak bergantung penugasan, tetapi tidak boleh menjalankan satu pun
     fungsi akademik. Status akun dan status penugasan adalah dua hal yang berbeda. */
  const terkunciPenugasan=!terkunciLisensi&&!terkunciAdmin&&session?.role==='teacher'
    &&!TEACHER_ROUTES_TANPA_PENUGASAN.has(route)&&!hasTeacherAssignment(session);
  const content=terkunciLisensi?limitedNotice()
    :terkunciAdmin?readinessNotice(session)
    :terkunciPenugasan?assignmentNotice():pageFor(route,session);
  app.append(renderLayout({session,route,onNavigate:navigate,onLogout:()=>navigate('login'),content,
    /* Masa tenggang offline yang sedang berjalan diberi tahu secara ringan lewat baris status
       yang sama, tanpa menutup satu pun halaman: aplikasi masih berjalan penuh. */
    licenseNotice:licenseState.canEditData&&licenseState.state!=='GRACE'?null:licenseState.message}));
}
/* Saat lisensi bermasalah, aplikasi TIDAK menghapus apa pun. Pengguna tetap dapat melihat
   datanya, mencetak, dan yang terpenting membuat backup, sehingga data sekolah tidak pernah
   menjadi sandera. Yang ditutup hanyalah halaman yang mengubah data. */
/* Sebelum Admin menekan Aktifkan e-Rapor untuk Guru, wali kelas tetap dapat masuk dan
   melihat halaman yang tidak bergantung pada konfigurasi. Menu operasional ditahan dengan
   alasan yang jelas, dan tidak ada satu pun data yang dihapus atau disembunyikan permanen. */
const TEACHER_ALWAYS_OPEN_ROUTES=new Set(['dashboard','profile','account-settings','backup','objectives','about-updates']);

/* Gerbang penugasan memakai daftar yang LEBIH SEMPIT. Capaian Pembelajaran dibiarkan terbuka
   pada gerbang kesiapan karena Butir CP-nya justru harus diisi lebih dulu agar Admin dapat
   menyatakan sekolah siap - menutupnya di sana akan mengunci Admin selamanya. Gerbang
   penugasan tidak punya lingkaran seperti itu: menugaskan mapel adalah tindakan Admin yang
   tidak bergantung pada CP, sehingga guru yang belum ditugaskan memang belum punya urusan
   dengan menu CP. Membiarkannya terbuka di situ hanya akan menampilkan halaman kosong tanpa
   penjelasan, persis keluhan "CP seolah semua mapel aktif padahal penugasan belum ada". */
const TEACHER_ROUTES_TANPA_PENUGASAN=new Set(
  [...TEACHER_ALWAYS_OPEN_ROUTES].filter(route=>route!=='objectives'));

/* Pesannya sama persis dengan alasan penolakan di layanan, sehingga guru tidak pernah membaca
   dua penjelasan berbeda untuk satu keadaan yang sama. */
function assignmentNotice(){
  return el(`<section class="card empty-state"><div class="placeholder-icon">${icon('settings',26)}</div>
    <h3>Belum Ada Penugasan Mengajar</h3><p>${escapeHtml(PESAN_BELUM_DITUGASKAN)}</p>
    <p>Akun Anda aktif dan tetap dapat membuka Dashboard, Profil, serta Backup. Seluruh data yang sudah ada tetap tersimpan dan akan terbuka kembali setelah Admin menugaskan mata pelajaran.</p>
    </section>`);
}

function readinessNotice(session){
  const kesiapan=getAdminReadiness(session);
  return el(`<section class="card empty-state"><div class="placeholder-icon">${icon('settings',26)}</div>
    <h3>Menu Belum Dibuka Admin</h3><p>${escapeHtml(kesiapan.lockMessage)}</p>
    <p>Yang masih perlu dilengkapi Admin: ${escapeHtml(kesiapan.missing.join(', ')||'menunggu Admin menekan tombol aktivasi')}.</p>
    </section>`);
}

/* Tentang & Pembaruan sengaja ikut terbuka pada mode terbatas: justru di saat lisensi
   bermasalah sekolah perlu dapat melihat versinya dan menghubungi pengembang. */
const READ_ONLY_SAFE_ROUTES=new Set(['dashboard','profile','backup','account-settings','about-updates',
  'print-report','print-ledger','print-supplement','transcript-print',
  'assessment-status','teacher-status','class-status','admin-progress','student-progress']);

function limitedNotice(){
  return el(`<section class="card empty-state"><div class="placeholder-icon">${icon('settings',26)}</div><h3>Mode Terbatas</h3><p>${escapeHtml(licenseState.message||'Lisensi perangkat ini sedang bermasalah.')}</p><p>Seluruh data sekolah tetap tersimpan utuh. Anda masih dapat melihat data, mencetak, dan membuat backup melalui menu Backup.</p></section>`);
}

function pageFor(route,session){
  switch(route){
    case 'dashboard': return renderDashboard(session);
    case 'profile': return renderProfile(session);
    case 'backup': return renderBackupRestore(session);
    case 'account-settings': return renderAccountSettings(session);
    case 'student-update': return renderStudents(session);
    case 'student-handover': return renderStudentHandover(session);
    case 'attendance': return renderAttendance(session);
    case 'assessment': return renderAssessment(session);
    case 'attitudes': return renderAttitudes(session);
    case 'weights': return renderWeights(session);
    case 'objectives': return renderObjectives(session);
    case 'about-updates': return renderAboutUpdates(session);
    case 'report-input': return renderReportInput(session,'input');
    case 'report-import': return renderReportInput(session,'import');
    case 'saved-scores': return renderSavedScores(session,'scores');
    case 'saved-descriptions': return renderSavedScores(session,'descriptions');
    case 'teacher-status': return renderAssessmentCheck(session,'status');
    case 'teacher-achievement': return renderAssessmentCheck(session,'achievement');
    case 'teacher-score-graph': return renderAssessmentCheck(session,'graph');
    case 'extra-input': return renderExtracurricularInput(session);
    case 'cocurricular-input': return renderCocurricularInput(session);
    case 'intracurricular-input': return renderIntracurricularInput(session);
    case 'homeroom-note': return renderCompleteness(session,'note');
    case 'promotion-input': return renderCompleteness(session,'promotion');
    case 'class-status': return renderClassCheck(session,'status');
    case 'class-statistics': return renderClassCheck(session,'statistics');
    case 'student-progress': return renderProgress(session,'progress');
    case 'student-progress-graph': return renderProgress(session,'graph');
    case 'admin-progress': return renderProgress(session,'progress');
    case 'admin-progress-graph': return renderProgress(session,'graph');
    case 'transcript-number-import': return renderTranscriptAdmin(session,'numbers');
    case 'transcript-settings': return renderTranscriptAdmin(session,'settings');
    case 'transcript-mapping': return renderSubjectMapping(session);
    case 'transcript-input': return session.role==='admin'?renderTranscriptAdmin(session,'input'):renderTranscript(session,'input');
    case 'transcript-import': return renderTranscript(session,'import');
    case 'transcript-print': return renderTranscript(session,'preview');
    case 'print-ledger': return renderPrint(session,'ledger');
    case 'print-supplement': return renderPrint(session,'supplement');
    case 'print-report': return renderPrint(session,'report');
    case 'teacher-assignments': return renderUsers(session,'assignments');
    case 'teacher-readiness': return renderUsers(session,'readiness');
    case 'teacher-access': return renderUsers(session,'access');
    case 'reference-school': return renderReferences(session,'school');
    case 'reference-teachers': return renderUsers(session,'teachers');
    case 'reference-students': return renderStudents(session);
    case 'reference-classes': return renderReferences(session,'classes');
    case 'reference-subjects': return renderReferences(session,'subjects');
    case 'reference-learning': return renderReferences(session,'learning');
    case 'reference-mapping': return renderSubjectMapping(session);
    case 'reference-branding': return renderReferences(session,'branding');
    case 'reference-report-date': return renderReferences(session,'report-date');
    case 'cocurricular': return renderCocurricular(session);
    case 'assessment-status': return renderAdminStatus(session,'status');
    case 'assessment-statistics': return renderAdminStatus(session,'statistics');
    case 'dapodik-service': return renderDapodik(session,'service');
    case 'dapodik-pull': return renderDapodik(session,'pull');
    case 'dapodik-push': return renderDapodik(session,'push');
    case 'intracurricular': return renderIntracurricular(session);
    default: return renderPlaceholder('Halaman tidak tersedia');
  }
}
if(startupError){
  const page=document.createElement('main');page.className='login-page';
  const card=document.createElement('section');card.className='login-card';
  const title=document.createElement('h1');title.textContent='Pembaruan data tidak dapat diselesaikan';
  const message=document.createElement('p');message.className='login-error';message.textContent=startupError.message;
  const help=document.createElement('p');help.className='muted';help.textContent='Data lama sudah dipulihkan dari snapshot otomatis. Tutup aplikasi, buat salinan backup bila memungkinkan, lalu hubungi pengelola aplikasi.';
  card.append(title,message,help);page.append(card);app.append(page);
}else{
  onRouteChange(mount);
  initRouter(session?'dashboard':'login');
  /* Status lisensi disegarkan sekali setelah tampilan pertama berdiri. */
  segarkanLisensiDariServer();
}

/* Setelah APK diperbarui, service worker versi baru tidak boleh menunggu tab lama ditutup.
   Worker baru langsung diaktifkan lalu halaman dimuat ulang satu kali agar revisi terbaru
   benar-benar dipakai, bukan JavaScript lama dari cache rilis sebelumnya. */
if('serviceWorker' in navigator && location.protocol!=='file:'){
  let reloadedForUpdate=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloadedForUpdate)return;
    reloadedForUpdate=true;
    location.reload();
  });
  /* updateViaCache:'none' memaksa berkas sw.js sendiri diambil ulang, bukan dari HTTP cache,
     sehingga pemeriksaan versi service worker tidak memakai salinan rilis lama. */
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{
    const activate=worker=>{if(worker?.state==='installed'&&navigator.serviceWorker.controller)worker.postMessage({type:'SKIP_WAITING'});};
    activate(registration.waiting);
    registration.addEventListener('updatefound',()=>{
      const installing=registration.installing;
      installing?.addEventListener('statechange',()=>activate(installing));
    });
    registration.update().catch(()=>{});
  }).catch(()=>{});
}