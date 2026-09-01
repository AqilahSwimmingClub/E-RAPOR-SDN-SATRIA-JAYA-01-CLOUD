import { initRouter, navigate, onRouteChange, resolveRoute } from './core/router.js';
import { getSession } from './services/auth.js';
import { renderLogin } from './pages/login.js';
import { renderOwnerActivation } from './pages/activation.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderProfile } from './pages/profile.js';
import { renderStudents } from './pages/students.js';
import { renderAttendance } from './pages/attendance.js';
import { renderAssessment } from './pages/assessment.js';
import { renderAttitudes } from './pages/attitudes.js';
import { renderWeights } from './pages/weights.js';
import { renderObjectives } from './pages/objectives.js';
import { renderAssessmentCheck, renderReportInput, renderSavedScores } from './pages/reports.js';
import { renderCompleteness } from './pages/completeness.js';
import { renderClassCheck } from './pages/class-overview.js';
import { renderProgress } from './pages/progress.js';
import { renderTranscript } from './pages/transcript.js';
import { renderPrint } from './pages/print.js';
import { renderUsers } from './pages/users.js';
import { renderReferences } from './pages/references.js';
import { renderCocurricular } from './pages/cocurricular.js';
import { renderIntracurricular } from './pages/intracurricular.js';
import { renderAdminStatus } from './pages/admin-status.js';
import { renderPlaceholder } from './pages/placeholder.js';
import { renderSubjectMapping, renderBackupRestore, renderAccountSettings } from './pages/settings.js';
import { renderLayout } from './ui/layout.js';
import { runAppMigrations } from './services/migrations.js';
import { ensureDefaultSubjects, seedInitialStudents } from './services/seed.js';

const app=document.querySelector('#app');
let startupError=null;
/* Migration dijalankan lebih dulu, lalu dua pengaman idempotent: mapel bawaan baru
   dipastikan ada pada Mapping lama, dan data awal 5B dilengkapi bila belum masuk.
   Kegagalan pengaman tidak boleh membuat aplikasi gagal dibuka. */
try{runAppMigrations();}catch(error){startupError=error;}
if(!startupError){try{ensureDefaultSubjects();}catch{}try{seedInitialStudents();}catch{}}
let session=startupError?null:getSession();
let expiryTimer=null;

function scheduleSessionExpiry(activeSession){
  clearTimeout(expiryTimer);expiryTimer=null;
  if(!activeSession?.expiresAt)return;
  const remaining=new Date(activeSession.expiresAt).getTime()-Date.now();
  expiryTimer=setTimeout(()=>{if(!getSession())navigate('login');},Math.max(0,remaining)+50);
}

function mount(requestedRoute){
  session=getSession();
  scheduleSessionExpiry(session);
  const route=resolveRoute(requestedRoute,session);
  if(route!==requestedRoute){navigate(route);return;}
  /* Halaman aktif ditandai di <html> supaya latar halaman Cetak Nilai bisa diputihkan sampai
     ke tepi layar tanpa bergantung pada :has() yang belum tentu didukung WebView lama. */
  document.documentElement.dataset.route=route;
  app.innerHTML='';
  if(route==='login'){
    app.append(renderLogin({onSuccess:(s)=>{session=s;navigate('dashboard')},onActivate:()=>navigate('activation')}));
    return;
  }
  if(route==='activation'){
    app.append(renderOwnerActivation({onComplete:()=>navigate('login'),onBack:()=>navigate('login')}));
    return;
  }
  const content=pageFor(route,session);
  app.append(renderLayout({session,route,onNavigate:navigate,onLogout:()=>navigate('login'),content}));
}
function pageFor(route,session){
  switch(route){
    case 'dashboard': return renderDashboard(session);
    case 'profile': return renderProfile(session);
    case 'backup': return renderBackupRestore(session);
    case 'account-settings': return renderAccountSettings(session);
    case 'student-update': return renderStudents(session);
    case 'attendance': return renderAttendance(session);
    case 'objectives': return renderObjectives(session);
    case 'report-input': return renderReportInput(session);
    case 'report-import': return renderReportInput(session);
    case 'saved-scores': return renderSavedScores(session);
    case 'saved-descriptions': return renderSavedScores(session);
    case 'teacher-status':
    case 'teacher-achievement':
    case 'teacher-score-graph': return renderAssessmentCheck(session);
    case 'extra-input': return renderCompleteness(session,'extracurricular');
    case 'cocurricular-input': return renderCompleteness(session,'cocurricular');
    case 'intracurricular-input': return renderCompleteness(session,'intracurricular');
    case 'homeroom-note': return renderCompleteness(session,'note');
    case 'promotion-input': return renderCompleteness(session,'promotion');
    case 'class-status':
    case 'class-statistics': return renderClassCheck(session);
    case 'student-progress':
    case 'student-progress-graph':
    case 'admin-progress':
    case 'admin-progress-graph': return renderProgress(session);
    case 'transcript-number-import':
    case 'transcript-settings':
    case 'transcript-mapping':
    case 'transcript-input':
    case 'transcript-import':
    case 'transcript-print': return renderTranscript(session);
    case 'print-ledger':
    case 'print-supplement':
    case 'print-report': return renderPrint(session);
    case 'users': return renderUsers(session);
    case 'reference-students': return renderStudents(session);
    case 'reference-mapping': return renderSubjectMapping(session);
    case 'reference-school':
    case 'reference-teachers':
    case 'reference-classes':
    case 'reference-subjects':
    case 'reference-learning':
    case 'reference-branding':
    case 'reference-report-date': return renderReferences(session);
    case 'cocurricular': return renderCocurricular(session);
    case 'assessment-status':
    case 'assessment-statistics': return renderAdminStatus(session);
    case 'dapodik-service': return renderPlaceholder('Web Service Dapodik');
    case 'dapodik-pull': return renderPlaceholder('Ambil Data Dapodik');
    case 'dapodik-push': return renderPlaceholder('Kirim Nilai ke Dapodik');
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
