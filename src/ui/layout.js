import { flattenNavigation, navigationForRole } from '../data/navigation.js';
import { clearSession } from '../services/auth.js';
import { icon } from './icons.js';
import { el, escapeHtml } from './dom.js';
import { getAdminProfile, getSchoolMaster, getTeacherProfile } from '../services/master.js';
import { APP_NAME, DEVELOPER_PHOTO, FOOTER_CREDIT } from '../data/app-identity.js';
import { SCHOOL_PLACEHOLDER } from '../data/constants.js';

/* Foto pembuat e-Rapor dipakai sebagai branding aplikasi di sidebar. Foto ini TIDAK pernah
   mengikuti foto profil guru, dan hanya tampil di antarmuka, tidak pernah di kertas dokumen. */
export const BRAND_PHOTO=DEVELOPER_PHOTO;
export const PROFILE_UPDATED_EVENT='erapor:profile-updated';

function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();}

/* Foto kanan atas selalu berasal dari foto profil guru. Bila belum ada foto, dipakai
   inisial sebagai placeholder, bukan foto pembuat aplikasi. */
function profileAvatar(profile){
  return profile.photo
    ? `<img class="avatar" src="${escapeHtml(profile.photo)}" alt="Foto profil"/>`
    : `<div class="avatar avatar-placeholder">${escapeHtml(initials(profile.name))}</div>`;
}

let lepasPendengarProfil=null;

function groupStateKey(session){
  return `erapor:nav-groups:${session.role}:${session.username||session.classId||'admin'}`;
}

function readOpenGroups(session){
  try{
    const stored=JSON.parse(localStorage.getItem(groupStateKey(session))||'[]');
    return new Set(Array.isArray(stored)?stored:[]);
  }catch{return new Set();}
}

function writeOpenGroups(session,openGroups){
  try{localStorage.setItem(groupStateKey(session),JSON.stringify([...openGroups]));}catch{}
}

export function renderLayout({session,route,onNavigate,onLogout,content}){
  const groups=navigationForRole(session.role);
  const menu=flattenNavigation(session.role);
  const school=getSchoolMaster();
  const bacaProfil=()=>session.role==='admin'?getAdminProfile():getTeacherProfile(session.classId);
  const profile=bacaProfil();
  const activeTitle=menu.find(item=>item.route===route)?.label||humanize(route);
  const backButton=route!=='dashboard'?'<button class="btn btn-light btn-small global-back" type="button" data-back aria-label="Kembali">← <span>Kembali</span></button>':'';
  const shell=el(`<div class="app-shell">
    <div class="drawer-backdrop hidden" data-backdrop></div>
    <aside class="sidebar" data-sidebar>
      <div class="brand"><img class="brand-photo" src="${BRAND_PHOTO}" alt="Pembuat e-Rapor"/><div><div class="brand-title">${escapeHtml(APP_NAME)}</div><div class="brand-sub">${escapeHtml(String(school.name||'').trim()||SCHOOL_PLACEHOLDER)}</div></div></div>
      <nav class="nav" data-nav></nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-footer"><div class="nav-section" style="padding-top:0">KELUAR</div><button class="nav-item logout-btn" data-logout>${icon('logout',18)}<span>Keluar</span></button></div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left"><button class="mobile-menu" data-menu aria-label="Buka menu">${icon('menu',21)}</button>${backButton}<div><div class="page-title">${activeTitle}</div><div class="page-sub">${school.name}</div></div></div>
        <div class="topbar-right"><div class="semester-chip">${session.semester}</div><div class="profile-mini" data-profile-mini>${profileAvatar(profile)}<div class="profile-text"><strong>${profile.name}</strong><span>${session.role==='teacher'?`Kelas ${session.classId}`:session.academicYear}</span></div></div></div>
      </header>
      <div class="content" data-content></div>
      <footer class="footer">${escapeHtml(FOOTER_CREDIT)}</footer>
    </main>
  </div>`);
  const nav=shell.querySelector('[data-nav]');
  shell.querySelector('[data-content]').append(content);
  const sidebar=shell.querySelector('[data-sidebar]'),backdrop=shell.querySelector('[data-backdrop]');
  const openDrawer=()=>{sidebar.classList.add('open');backdrop.classList.remove('hidden')};
  const closeDrawer=()=>{sidebar.classList.remove('open');backdrop.classList.add('hidden')};
  const openGroups=readOpenGroups(session);
  groups.forEach(group=>{
    const active=group.children.some(item=>item.route===route);
    const hasChildren=group.children.length>1;
    const open=hasChildren&&(active||openGroups.has(group.id));
    const section=document.createElement('section');
    section.className=`nav-group ${active?'active-ancestor':''}`;
    section.setAttribute('data-nav-group',group.id);
    const toggle=document.createElement('button');
    toggle.className=`nav-group-toggle ${!hasChildren&&active?'active':''}`;
    toggle.setAttribute('aria-expanded',String(open));
    toggle.dataset.groupToggle=group.id;
    toggle.innerHTML=`${icon(group.icon,18)}<span>${escapeHtml(group.label)}</span>${hasChildren?`<span class="nav-chevron">${icon('arrowDown',15)}</span>`:''}`;
    section.append(toggle);
    const children=document.createElement('div');
    children.className='nav-children';
    children.dataset.groupChildren=group.id;
    children.hidden=!open;
    if(hasChildren){
      group.children.forEach(item=>{
        const child=document.createElement('button');
        child.className=`nav-item nav-child ${route===item.route?'active':''}`;
        child.innerHTML=`${icon(item.icon,17)}<span>${escapeHtml(item.label)}</span>`;
        child.onclick=()=>{closeDrawer();onNavigate(item.route);};
        children.append(child);
      });
      toggle.onclick=()=>{
        const next=toggle.getAttribute('aria-expanded')!=='true';
        toggle.setAttribute('aria-expanded',String(next));
        children.hidden=!next;
        if(next)openGroups.add(group.id);else openGroups.delete(group.id);
        writeOpenGroups(session,openGroups);
      };
    }else{
      const destination=group.children[0]?.route||'dashboard';
      toggle.onclick=()=>{closeDrawer();onNavigate(destination);};
    }
    section.append(children);
    nav.append(section);
  });
  shell.querySelector('[data-menu]').onclick=openDrawer;backdrop.onclick=closeDrawer;
  shell.querySelector('[data-logout]').onclick=()=>{clearSession();onLogout()};
  const back=shell.querySelector('[data-back]');
  if(back)back.onclick=()=>{if(window.history.length>1)window.history.back();else onNavigate('dashboard');};

  /* Mengganti foto pada menu Profile langsung memperbarui foto kanan atas tanpa perlu
     berpindah halaman. Foto branding pembuat di sidebar sengaja tidak ikut diperbarui. */
  const miniProfil=shell.querySelector('[data-profile-mini]');
  const perbaruiProfil=()=>{
    const terbaru=bacaProfil();
    miniProfil.querySelector('.avatar')?.replaceWith(el(profileAvatar(terbaru)));
    const nama=miniProfil.querySelector('.profile-text strong');
    if(nama)nama.textContent=terbaru.name;
  };
  lepasPendengarProfil?.();
  document.addEventListener(PROFILE_UPDATED_EVENT,perbaruiProfil);
  lepasPendengarProfil=()=>document.removeEventListener(PROFILE_UPDATED_EVENT,perbaruiProfil);
  return shell;
}
function humanize(v){return String(v||'Dashboard').split('-').map(x=>x[0]?.toUpperCase()+x.slice(1)).join(' ')}