import { isInstallationActivated } from '../services/owner-activation.js';
import { flattenNavigation } from '../data/navigation.js';

let current='login';
let listener=()=>{};

const LEGACY_ALIASES=Object.freeze({
  admin:Object.freeze({
    students:'reference-students',reference:'reference-school',settings:'backup',
    progress:'admin-progress',transcript:'transcript-input',print:'print-report'
  }),
  teacher:Object.freeze({
    students:'student-update','completeness-input':'student-update',
    'assessment-check':'teacher-status','class-check':'class-status',progress:'student-progress',
    transcript:'transcript-input',print:'print-report'
  })
});

const ROUTES_BY_ROLE=Object.freeze(Object.fromEntries(
  ['admin','teacher'].map(role=>[role,new Set(flattenNavigation(role).map(item=>item.route))])
));

/* Garis miring di depan ikut dibuang supaya penulisan "#/students" tidak jatuh ke Dashboard.
   Tautan indikator kelengkapan sempat memakai bentuk itu sehingga tujuannya tidak pernah
   sampai ke halaman yang dimaksud. */
function cleanRoute(route){ return String(route||'').replace(/^#/,'').replace(/^\/+/,'').trim() || 'login'; }

export function canonicalRoute(route,role){
  const requested=cleanRoute(route);
  return LEGACY_ALIASES[role]?.[requested]||requested;
}

export function resolveRoute(route,session){
  const clean=cleanRoute(route);
  const requested=canonicalRoute(clean,session?.role);
  if(requested==='activation')return session?'dashboard':(isInstallationActivated()?'login':'activation');
  if(!session || !ROUTES_BY_ROLE[session.role]) return 'login';
  if(requested==='login') return 'dashboard';
  return ROUTES_BY_ROLE[session.role].has(requested) ? requested : 'dashboard';
}

export function canAccessRoute(route,role){ return Boolean(ROUTES_BY_ROLE[role]?.has(canonicalRoute(route,role))); }
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
