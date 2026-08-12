import { isInstallationActivated } from '../services/owner-activation.js';

let current='login';
let listener=()=>{};

const ROUTES_BY_ROLE = {
  admin: new Set([
    'dashboard','profile','students','users','reference','cocurricular','assessment-status',
    'progress','transcript','print','settings','account-settings'
  ]),
  teacher: new Set([
    'dashboard','profile','students','attendance','assessment','attitudes','weights','objectives',
    'report-input','saved-scores','assessment-check','completeness-input','class-check',
    'progress','transcript','print','subject-mapping','backup','account-settings'
  ]),
};

/* Garis miring di depan ikut dibuang supaya penulisan "#/students" tidak jatuh ke Dashboard.
   Tautan indikator kelengkapan sempat memakai bentuk itu sehingga tujuannya tidak pernah
   sampai ke halaman yang dimaksud. */
function cleanRoute(route){ return String(route||'').replace(/^#/,'').replace(/^\/+/,'').trim() || 'login'; }

export function resolveRoute(route,session){
  const requested=cleanRoute(route);
  if(requested==='activation')return session?'dashboard':(isInstallationActivated()?'login':'activation');
  if(!session || !ROUTES_BY_ROLE[session.role]) return 'login';
  if(requested==='login') return 'dashboard';
  return ROUTES_BY_ROLE[session.role].has(requested) ? requested : 'dashboard';
}

export function canAccessRoute(route,role){ return Boolean(ROUTES_BY_ROLE[role]?.has(cleanRoute(route))); }
export function getRoute(){ return current; }
export function navigate(route){
  const next=cleanRoute(route);
  if(window.location.hash===`#${next}`){ current=next;listener(next);return; }
  window.location.hash=next;
}
export function onRouteChange(fn){ listener=fn; }
export function initRouter(defaultRoute='login'){
  const fallback=cleanRoute(defaultRoute);
  const sync=()=>{ current=cleanRoute(window.location.hash||fallback);listener(current); };
  window.addEventListener('hashchange',sync);
  if(!window.location.hash){
    current=fallback;
    window.history.replaceState(null,'',`#${fallback}`);
    listener(current);
    return;
  }
  sync();
}
