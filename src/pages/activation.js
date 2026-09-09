import { setupFirstAdmin } from '../services/admin-first-setup.js';
import { getSecurityStatus } from '../services/auth.js';
import { getSchoolMaster } from '../services/master.js';
import { APP_NAME } from '../data/app-identity.js';
import { SCHOOL_PLACEHOLDER } from '../data/constants.js';
import { el, escapeHtml } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Nama export dipertahankan sementara agar route lama tidak mematahkan instalasi/update.
   Halaman ini sekarang BUKAN aktivasi Owner: pembeli cukup membuat password Admin pertama
   setelah lisensi perangkat dinyatakan sah. */
export function renderOwnerActivation({onComplete,onBack}){
  const schoolLabel=String(getSchoolMaster().name||'').trim()||SCHOOL_PLACEHOLDER;
  const root=el(`<main class="login-page"><section class="login-visual"><div class="brand"><div class="brand-mark">${icon('school',24)}</div><div><div class="brand-title">${escapeHtml(APP_NAME)}</div><div class="brand-sub">${escapeHtml(schoolLabel)}</div></div></div><div class="creator"><strong>SETUP ADMIN PERTAMA</strong><p>Lisensi sudah aktif. Buat password Admin untuk mulai menggunakan aplikasi.</p></div></section><section class="login-panel"><form class="login-card"><h1>Buat Password Admin Pertama</h1><p>Tidak diperlukan Owner Activation Key atau PIN. Password ini akan digunakan untuk login Admin sekolah.</p><div class="field"><label>Password Admin Baru</label><input class="input" type="password" autocomplete="new-password" data-password required minlength="8"/></div><div class="field"><label>Ulangi Password Admin</label><input class="input" type="password" autocomplete="new-password" data-confirm required minlength="8"/></div><div class="login-error hidden" data-error></div><button class="btn btn-primary" type="submit" style="width:100%">Simpan Password Admin</button><button class="btn btn-light" type="button" data-back style="width:100%;margin-top:8px">Kembali ke Login</button></form></section></main>`);

  /* Instalasi lama yang Admin-nya sudah siap tidak boleh dipaksa membuat password ulang. */
  getSecurityStatus().then(status=>{if(status.adminActivated)onComplete?.();}).catch(()=>{});

  root.querySelector('[data-back]').onclick=()=>onBack?.();
  root.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const errorBox=root.querySelector('[data-error]');
    errorBox.classList.add('hidden');
    const password=root.querySelector('[data-password]').value;
    if(password!==root.querySelector('[data-confirm]').value){
      errorBox.textContent='Konfirmasi password Admin tidak sama.';
      errorBox.classList.remove('hidden');
      return;
    }
    const button=root.querySelector('[type="submit"]');
    button.disabled=true;button.textContent='Menyimpan…';
    try{
      const result=await setupFirstAdmin(password);
      root.innerHTML=`<main class="login-page"><section class="login-panel" style="margin:auto"><div class="login-card"><h1>Password Admin Berhasil Dibuat</h1><p>Admin sekolah sudah siap digunakan.</p><div class="recovery-code">${escapeHtml(result.recoveryCode)}</div><p>Simpan kode recovery ini di tempat aman. Kode hanya ditampilkan satu kali.</p><button class="btn btn-primary" data-finish style="width:100%">Lanjut ke Login</button></div></section></main>`;
      root.querySelector('[data-finish]').onclick=()=>onComplete?.();
    }catch(error){
      errorBox.textContent=error.message;
      errorBox.classList.remove('hidden');
    }finally{
      if(button.isConnected){button.disabled=false;button.textContent='Simpan Password Admin';}
    }
  };
  return root;
}
