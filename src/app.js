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
    case 'report-input': return renderReportInput(session,'input');
    case 'report-import': return renderReportInput(session,'import');
    case 'saved-scores': return renderSavedScores(session,'scores');
    case 'saved-descriptions': return renderSavedScores(session,'descriptions');
    case 'teacher-status': return renderAssessmentCheck(session,'status');
    case 'teacher-achievement': return renderAssessmentCheck(session,'achievement');
    case 'teacher-score-graph': return renderAssessmentCheck(session,'graph');
    case 'extra-input': return renderCompleteness(session,'extracurricular');
    case 'cocurricular-input': return renderCompleteness(session,'cocurricular');
    case 'intracurricular-input': return renderCompleteness(session,'intracurricular');
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
    case 'users': return renderUsers(session,'users');
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
