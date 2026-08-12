import { MENU_ADMIN, MENU_TEACHER } from '../data/constants.js';
import { clearSession } from '../services/auth.js';
import { icon } from './icons.js';
import { el, escapeHtml } from './dom.js';
import { getAdminProfile, getSchoolMaster, getTeacherProfile } from '../services/master.js';

/* Foto pembuat e-Rapor dipakai sebagai branding aplikasi di sidebar. Foto ini TIDAK pernah
   mengikuti foto profil guru, dan hanya tampil di antarmuka, tidak pernah di kertas dokumen. */
export const BRAND_PHOTO='./assets/fahmi-djawas.jpg';
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

export function renderLayout({session,route,onNavigate,onLogout,content}){
  const menu=session.role==='admin'?MENU_ADMIN:MENU_TEACHER;
  const school=getSchoolMaster();
  const bacaProfil=()=>session.role==='admin'?getAdminProfile():getTeacherProfile(session.classId);
  const profile=bacaProfil();
  const activeTitle=(menu.find(x=>x[0]===route)||['',humanize(route)])[1];
  const shell=el(`<div class="app-shell">
    <div class="drawer-backdrop hidden" data-backdrop></div>
    <aside class="sidebar" data-sidebar>
      <div class="brand"><img class="brand-photo" src="${BRAND_PHOTO}" alt="Pembuat e-Rapor"/><div><div class="brand-title">e-Rapor</div><div class="brand-sub">${school.name}</div></div></div>
      <nav class="nav" data-nav></nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-footer"><div class="nav-section" style="padding-top:0">KELUAR</div><button class="nav-item logout-btn" data-logout>${icon('logout',18)}<span>Keluar</span></button></div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left"><button class="mobile-menu" data-menu aria-label="Buka menu">${icon('menu',21)}</button><div><div class="page-title">${activeTitle}</div><div class="page-sub">${school.name}</div></div></div>
        <div class="topbar-right"><div class="semester-chip">${session.semester}</div><div class="profile-mini" data-profile-mini>${profileAvatar(profile)}<div class="profile-text"><strong>${profile.name}</strong><span>${session.role==='teacher'?`Kelas ${session.classId}`:session.academicYear}</span></div></div></div>
      </header>
      <div class="content" data-content></div>
      <footer class="footer">Dashboard didesain oleh FAHMI DJAWAS. © 2026 Semua hak dilindungi</footer>
    </main>
  </div>`);
  const nav=shell.querySelector('[data-nav]');
  menu.forEach(([key,label,ico])=>{
    if(key==='__section__'){const s=document.createElement('div');s.className='nav-section';s.textContent=label;nav.append(s);return}
    const b=document.createElement('button');b.className=`nav-item ${route===key?'active':''}`;b.innerHTML=`${icon(ico,18)}<span>${label}</span>`;b.onclick=()=>{closeDrawer();onNavigate(key)};nav.append(b);
  });
  shell.querySelector('[data-content]').append(content);
  const sidebar=shell.querySelector('[data-sidebar]'),backdrop=shell.querySelector('[data-backdrop]');
  const openDrawer=()=>{sidebar.classList.add('open');backdrop.classList.remove('hidden')};
  const closeDrawer=()=>{sidebar.classList.remove('open');backdrop.classList.add('hidden')};
  shell.querySelector('[data-menu]').onclick=openDrawer;backdrop.onclick=closeDrawer;
  shell.querySelector('[data-logout]').onclick=()=>{clearSession();onLogout()};

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
