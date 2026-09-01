import { SCHOOL } from '../data/constants.js';
import { APP_VERSION } from '../data/version.js';
import { listLoginSemesters } from '../services/references.js';
import { authenticate, ensureSecurityBootstrap, getSecurityStatus, recoverAdmin, saveSession } from '../services/auth.js';
import { icon } from '../ui/icons.js';
import { el, escapeHtml, qs, toast } from '../ui/dom.js';

/* Halaman Masuk v1.2.1. Satu panel kaca yang menyatu di tengah layar: tidak ada lagi foto
   besar di kiri dan blok putih di kanan. Panel terbuka sekali seperti koper yang dibuka,
   lalu diam. Seluruh logika masuk, recovery, aktivasi, dan bootstrap keamanan tidak diubah. */

export function renderLogin({onSuccess,onActivate}){
  let role='admin';let adminActivated=true;
  const semesters=listLoginSemesters();
  const root=el(`<main class="login-stage">
    <div class="login-aurora" aria-hidden="true"></div>
    <section class="login-shell">
      <header class="login-brand">
        <div class="login-brand-mark">${icon('school',26)}</div>
        <div class="login-brand-text">
          <span class="login-brand-app">e-Rapor</span>
          <strong>SDN SATRIA JAYA 01</strong>
          <span class="login-brand-region">KABUPATEN BEKASI</span>
        </div>
        <span class="login-version">v${escapeHtml(APP_VERSION)}</span>
      </header>
      <p class="login-tagline">Cerdas Berkarakter Berprestasi</p>
      <form class="login-form" id="loginForm" novalidate>
        <div class="role-switch" role="tablist">
          <button type="button" class="role-btn active" data-role="admin" role="tab" aria-selected="true">Admin</button>
          <button type="button" class="role-btn" data-role="teacher" role="tab" aria-selected="false">Guru / Wali Kelas</button>
        </div>
        <div class="field login-anim" style="--rise:1"><label for="loginSchool">Sekolah</label><input class="input readonly" id="loginSchool" value="${escapeHtml(SCHOOL)}" readonly/></div>
        <div class="field login-anim" style="--rise:2"><label for="semester">Semester Aktif</label><select class="input" id="semester">${semesters.map(value=>`<option>${escapeHtml(value)}</option>`).join('')}</select></div>
        <div class="field login-anim" style="--rise:3"><label for="username">Username</label><input class="input" id="username" autocomplete="username" placeholder="Admin" required/></div>
        <div class="field login-anim" style="--rise:4"><label for="password">Password</label><div class="password-wrap"><input class="input" id="password" type="password" autocomplete="current-password" placeholder="Masukkan password" required/><button class="password-toggle" type="button" aria-label="Tampilkan password">👁</button></div></div>
        <div class="login-error hidden" id="loginError" role="alert"></div>
        <button class="btn btn-primary login-submit login-anim" style="--rise:5" type="submit" data-login>Masuk</button>
        <button class="btn login-ghost hidden" type="button" data-activate>Aktivasi Admin Pertama</button>
        <button class="btn login-ghost" type="button" id="forgot">Lupa Password</button>
        <div class="login-help" id="loginHelp">Memeriksa keamanan akun lokal...</div>
      </form>
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
