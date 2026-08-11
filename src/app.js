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
import { renderAdminStatus } from './pages/admin-status.js';
import { renderPlaceholder } from './pages/placeholder.js';
import { renderSubjectMapping, renderBackupRestore, renderAccountSettings } from './pages/settings.js';
import { renderLayout } from './ui/layout.js';
import { runAppMigrations } from './services/migrations.js';
import { seedInitialStudents } from './services/seed.js';

const app=document.querySelector('#app');
let startupError=null;
try{runAppMigrations();seedInitialStudents();}catch(error){startupError=error;}
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
    case 'subject-mapping': return renderSubjectMapping(session);
    case 'backup': return renderBackupRestore(session);
    case 'account-settings': return renderAccountSettings(session);
    case 'settings': return renderBackupRestore(session);
    case 'students': return renderStudents(session);
    case 'attendance': return renderAttendance(session);
    case 'assessment': return renderAssessment(session);
    case 'attitudes': return renderAttitudes(session);
    case 'weights': return renderWeights(session);
    case 'objectives': return renderObjectives(session);
    case 'report-input': return renderReportInput(session);
    case 'saved-scores': return renderSavedScores(session);
    case 'assessment-check': return renderAssessmentCheck(session);
    case 'completeness-input': return renderCompleteness(session);
    case 'class-check': return renderClassCheck(session);
    case 'progress': return renderProgress(session);
    case 'transcript': return renderTranscript(session);
    case 'print': return renderPrint(session);
    case 'users': return renderUsers(session);
    case 'reference': return renderReferences(session);
    case 'cocurricular': return renderCocurricular(session);
    case 'assessment-status': return renderAdminStatus(session);
    default: return renderPlaceholder('Modul e-Rapor');
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

if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
