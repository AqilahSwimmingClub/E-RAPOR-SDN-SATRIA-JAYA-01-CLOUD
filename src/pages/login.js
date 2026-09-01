import { SCHOOL } from '../data/constants.js';
import { APP_VERSION } from '../data/version.js';
import { listLoginSemesters } from '../services/references.js';
import { authenticate, ensureSecurityBootstrap, getSecurityStatus, recoverAdmin, saveSession } from '../services/auth.js';
import { icon } from '../ui/icons.js';
import { el, escapeHtml, qs, toast } from '../ui/dom.js';

/* Halaman Masuk v1.2.1. Satu panel kaca yang menyatu di tengah layar: tidak ada lagi foto
   besar di kiri dan blok putih di kanan. Panel terbuka sekali seperti koper yang dibuka,
   lalu diam. Seluruh logika masuk, recovery, aktivasi, dan bootstrap keamanan tidak diubah. */

const LOCK_ICON='<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

export function renderLogin({onSuccess,onActivate}){
  let role='admin';let adminActivated=true;
  const semesters=listLoginSemesters();
  const root=el(`<main class="login-stage">
    <div class="login-sky" aria-hidden="true">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
        <defs>
          <linearGradient id="loginSkyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2f6fa8"/><stop offset="55%" stop-color="#4f8dc0"/><stop offset="100%" stop-color="#7fb0d6"/>
          </linearGradient>
          <radialGradient id="loginMoonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity=".9"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#loginSkyGrad)"/>
        <circle cx="905" cy="150" r="120" fill="url(#loginMoonGlow)"/>
        <circle cx="905" cy="150" r="34" fill="#f4fbff"/>
        <g fill="#ffffff" opacity=".22">
          <ellipse cx="215" cy="185" rx="96" ry="30"/><ellipse cx="280" cy="170" rx="66" ry="24"/>
          <ellipse cx="1010" cy="300" rx="86" ry="27"/><ellipse cx="950" cy="290" rx="56" ry="21"/>
          <ellipse cx="600" cy="110" rx="74" ry="24"/><ellipse cx="150" cy="330" rx="60" ry="20"/>
        </g>
        <g stroke="#ffffff" stroke-width="2" opacity=".5" stroke-linecap="round">
          <line x1="760" y1="120" x2="792" y2="88"/><line x1="1085" y1="215" x2="1112" y2="188"/><line x1="330" y1="250" x2="356" y2="224"/>
        </g>
        <path d="M0 620 L190 470 L330 600 L470 500 L640 640 L830 505 L980 610 L1200 470 L1200 800 L0 800 Z" fill="#2b6394" opacity=".55"/>
        <path d="M0 690 L230 560 L420 680 L610 585 L820 700 L1010 600 L1200 690 L1200 800 L0 800 Z" fill="#1f4f7d" opacity=".7"/>
        <path d="M0 760 L260 690 L520 760 L760 700 L1000 765 L1200 720 L1200 800 L0 800 Z" fill="#173d63"/>
      </svg>
    </div>
    <section class="login-shell">
      <header class="login-brand">
        <div class="login-brand-mark">${icon('school',24)}</div>
        <div class="login-brand-text">
          <span class="login-brand-app">e-Rapor</span>
          <strong>SDN SATRIA JAYA 01</strong>
          <span class="login-brand-region">KABUPATEN BEKASI</span>
        </div>
      </header>
      <form class="login-form" id="loginForm" novalidate>
        <div class="role-switch" role="tablist">
          <button type="button" class="role-btn active" data-role="admin" role="tab" aria-selected="true">Admin</button>
          <button type="button" class="role-btn" data-role="teacher" role="tab" aria-selected="false">Guru / Wali Kelas</button>
        </div>
        <div class="login-field login-anim" style="--rise:1">
          <span class="login-field-icon">${icon('school',15)}</span>
          <input class="input" id="loginSchool" value="${escapeHtml(SCHOOL)}" aria-label="Sekolah" readonly/>
        </div>
        <div class="login-field login-anim" style="--rise:2">
          <span class="login-field-icon">${icon('calendar',15)}</span>
          <select class="input" id="semester" aria-label="Semester Aktif">${semesters.map(value=>`<option>${escapeHtml(value)}</option>`).join('')}</select>
        </div>
        <div class="login-field login-anim" style="--rise:3">
          <span class="login-field-icon">${icon('user',15)}</span>
          <input class="input" id="username" autocomplete="username" placeholder="Username" aria-label="Username" required/>
        </div>
        <div class="login-field login-anim" style="--rise:4">
          <span class="login-field-icon">${LOCK_ICON}</span>
          <input class="input" id="password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required/>
          <button class="password-toggle" type="button" aria-label="Tampilkan password">👁</button>
        </div>
        <div class="login-error hidden" id="loginError" role="alert"></div>
        <button class="login-submit login-anim" style="--rise:5" type="submit" data-login>MASUK</button>
        <button class="login-link" type="button" id="forgot">Lupa Password?</button>
        <button class="login-ghost hidden" type="button" data-activate>Aktivasi Admin Pertama</button>
        <div class="login-help" id="loginHelp">Memeriksa keamanan akun lokal...</div>
      </form>
      <div class="login-welcome">
        <h1>WELCOME</h1>
        <p>Cerdas Berkarakter Berprestasi</p>
        <span class="login-version">v${escapeHtml(APP_VERSION)}</span>
      </div>
    </section>
    <footer class="login-footer">
      <span>Dirancang &amp; Dikembangkan oleh</span>
      <strong>FAHMI DJAWAS, S.Pd.</strong>
      <small>© 2026 e-Rapor SDN Satria Jaya 01 — Semua Hak Dilindungi</small>
    </footer>
  </main>`);

  function help(){const activation=root.querySelector('[data-activate]');activation.classList.toggle('hidden',role!=='admin'||adminActivated);qs('#loginHelp',root).innerHTML=role==='admin'?(adminActivated?'Gunakan akun Admin dan password lokal yang sudah diaktivasi.':'Belum ada password default. Aktivasi Admin dan simpan kode recovery yang ditampilkan.'):'Gunakan username akun rombel, atau username Guru selama credential bootstrap masih aktif.';}
  async function refreshStatus(){try{await ensureSecurityBootstrap();const status=await getSecurityStatus();adminActivated=status.adminActivated;help();}catch(error){const box=qs('#loginError',root);box.textContent=error.message;box.classList.remove('hidden');}}
  function showRecoveryCode(code,title){const modal=el(`<div class="modal-backdrop"><div class="modal-card"><h3>${escapeHtml(title)}</h3><p>Simpan kode ini di tempat aman. Kode tidak disimpan dalam bentuk plaintext dan hanya ditampilkan sekali.</p><div class="recovery-code">${escapeHtml(code)}</div><div class="modal-actions"><button class="btn btn-primary" data-close>Saya Sudah Menyimpan</button></div></div></div>`);document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();}
  function passwordFields(){return `<div class="field"><label>Password Baru</label><input class="input" type="password" name="newPassword" autocomplete="new-password" required/></div><div class="field"><label>Ulangi Password</label><input class="input" type="password" name="confirmPassword" autocomplete="new-password" required/></div>`;}
  function openAdminRecovery(){const modal=el(`<div class="modal-backdrop"><form class="modal-card"><div class="modal-head"><div><h3>Recovery Admin Lokal</h3><p>Masukkan kode recovery yang disimpan saat aktivasi atau recovery sebelumnya.</p></div><button type="button" class="btn btn-light btn-icon" data-close>${icon('x',17)}</button></div><div class="field"><label>Kode Recovery</label><input class="input" name="recovery" autocomplete="off" required/></div>${passwordFields()}<div class="login-error hidden" data-error></div><div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" type="submit">Pulihkan Admin</button></div></form></div>`);document.body.append(modal);const form=modal.querySelector('form');const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;form.onsubmit=async event=>{event.preventDefault();if(form.elements.newPassword.value!==form.elements.confirmPassword.value){const box=modal.querySelector('[data-error]');box.textContent='Konfirmasi password tidak sama.';box.classList.remove('hidden');return;}try{const result=await recoverAdmin(form.elements.recovery.value,form.elements.newPassword.value);close();showRecoveryCode(result.recoveryCode,'Kode Recovery Baru');toast('Password Admin berhasil dipulihkan.');}catch(error){const box=modal.querySelector('[data-error]');box.textContent=error.message;box.classList.remove('hidden');}};}

  /* Peralihan Admin dan Guru hanya menukar kelas serta isian, tanpa membangun ulang panel,
     sehingga tidak ada lompatan tata letak saat guru sedang mengisi. */
  root.querySelectorAll('[data-role]').forEach(button=>button.onclick=()=>{
    role=button.dataset.role;
    root.querySelectorAll('[data-role]').forEach(item=>{const aktif=item===button;item.classList.toggle('active',aktif);item.setAttribute('aria-selected',String(aktif));});
    qs('#username',root).value=role==='admin'?'Admin':'Guru';
    qs('#username',root).placeholder=role==='admin'?'Admin':'Guru atau Guru5B';
    qs('#password',root).value='';
    help();
  });

  qs('.password-toggle',root).onclick=()=>{const password=qs('#password',root);const tampil=password.type==='password';password.type=tampil?'text':'password';qs('.password-toggle',root).setAttribute('aria-label',tampil?'Sembunyikan password':'Tampilkan password');};
  root.querySelector('[data-activate]').onclick=()=>onActivate?.();
  qs('#forgot',root).onclick=()=>{if(role==='teacher'){toast('Password Guru direset oleh Admin melalui Data Pengguna.','warning');return;}if(!adminActivated){onActivate?.();return;}openAdminRecovery();};
  qs('#loginForm',root).onsubmit=async event=>{
    event.preventDefault();
    const errorBox=qs('#loginError',root),button=root.querySelector('[data-login]');
    errorBox.classList.add('hidden');button.disabled=true;button.textContent='Memverifikasi...';
    try{
      const session=await authenticate({role,username:qs('#username',root).value,password:qs('#password',root).value,semester:qs('#semester',root).value});
      saveSession(session);onSuccess(session);
    }catch(error){
      errorBox.textContent=error.message;errorBox.classList.remove('hidden');
      /* Getaran sekali pada kotak galat saja, panel tetap diam. */
      errorBox.classList.remove('login-shake');void errorBox.offsetWidth;errorBox.classList.add('login-shake');
    }finally{button.disabled=false;button.textContent='Masuk';}
  };
  refreshStatus();
  return root;
}
