import { SCHOOL_PLACEHOLDER } from '../data/constants.js';
import { APP_VERSION } from '../data/version.js';
import { COPYRIGHT, DEVELOPER_CREDIT_LEAD, DEVELOPER_NAME, DEVELOPER_ROLE } from '../data/app-identity.js';
import { getSchoolMaster } from '../services/master.js';
import { listLoginSemesters } from '../services/references.js';
import { authenticate, ensureSecurityBootstrap, getSecurityStatus, recoverAdmin, saveSession } from '../services/auth.js';
import { refreshLicenseForLogin } from '../services/license.js';
import { icon } from '../ui/icons.js';
import { el, escapeHtml, qs, toast } from '../ui/dom.js';

/* HALAMAN MASUK 1.3.0 - SATU LATAR UTUH, TANPA SEKAT.

   Sampai 1.2.9 halaman ini dua kolom: kolom kiri memegang latar, kolom kanan punya latar
   sendiri, dan keduanya bertemu sebagai garis tegak di tengah layar. Susunan itu dibuang.
   Sekarang latar GAMBAR 1 dipasang satu kali pada seluruh bidang layar, dari tepi kiri sampai
   tepi kanan, dan tiga isi halaman berdiri DI ATAS latar yang sama: identitas sekolah di kiri
   atas, identitas pengembang di kiri bawah, dan kartu Masuk mengambang di kanan.

   Slogan papan tulis tidak lagi ditulis sebagai elemen halaman. Ia sudah menjadi bagian dari
   berkas latar itu sendiri, sehingga menuliskannya lagi di sini akan membuatnya muncul dua
   kali. Berkas latar dipakai apa adanya - tidak digambar ulang, tidak diubah komposisinya. */

const LOCK_ICON='<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

export function renderLogin({onSuccess,onActivate,onLicenseBlocked}){
  let role='admin';let adminActivated=true;
  const semesters=listLoginSemesters();
  /* Identitas sekolah selalu dibaca dari master. Sebelum Setup Awal selesai, halaman ini
     memakai label netral dan lambang bawaan aplikasi, bukan identitas sekolah mana pun. */
  const school=getSchoolMaster();
  const schoolName=String(school.name||'').trim();
  const schoolLabel=schoolName||SCHOOL_PLACEHOLDER;
  const schoolLogo=String(school.schoolLogo||'').trim();
  const crest=schoolLogo||'./assets/app-icon-192.png';
  const crestAlt=schoolName?`Logo ${schoolName}`:'Lambang sekolah belum diunggah';
  /* TIGA LOGO PADA FORM MASUK, URUTANNYA TETAP: Tut Wuri, lambang daerah, lalu logo sekolah.
     Yang berubah pada 1.2.8 HANYA sumber gambarnya. Dua logo pertama dulu ditulis mati ke
     berkas bawaan, sehingga unggahan Admin tidak pernah terpakai dan sekolah di luar Kabupaten
     Bekasi terpaksa memasang lambang daerah yang bukan miliknya. Sekarang ketiganya membaca
     master Admin lebih dulu, dan berkas bawaan hanya menjadi cadangan bila Admin belum
     mengunggah - atau menghapus unggahannya. Ukuran, jarak, posisi, dan urutannya tidak
     disentuh sama sekali. */
  const ministryUpload=String(school.ministryLogo||'').trim();
  const regionUpload=String(school.regionLogo||'').trim();
  const ministryLogo=ministryUpload||'./assets/logo-tut-wuri-handayani.png';
  const regionLogo=regionUpload||'./assets/logo-kabupaten-bekasi.png';
  /* BERKAS UNGGAHAN MENYESUAIKAN SLOT, BUKAN SEBALIKNYA.

     Ketiga lambang bawaan aplikasi berbentuk hampir persegi, dan slot lambang daerah bahkan
     sengaja dibuat lebih tinggi dengan margin negatif untuk mengimbangi ruang kosong pada
     berkas bawaannya. Kompensasi itu hanya benar untuk berkas itu: logo unggahan yang melebar
     atau memanjang akan tumbuh melewati tetangganya dan barisnya berantakan.

     Karena itu unggahan dipasang pada kotak berukuran tetap dengan object-fit: contain. Tinggi
     area, jarak, posisi, dan urutan barisnya sama persis berapa pun rasio berkas yang diunggah
     sekolah - yang menyesuaikan adalah gambarnya. */
  const kelasUnggahan=nilai=>nilai?' login-crest-upload':'';
  const root=el(`<main class="login-stage">
    <div class="login-veil" aria-hidden="true"></div>
    <div class="login-layout">
      <div class="login-brand">
        <div class="login-brand-mark">
          <img class="login-logo" src="${escapeHtml(crest)}" alt="${escapeHtml(crestAlt)}" data-login-logo/>
          <span class="login-logo-fallback hidden" aria-hidden="true">${icon('school',26)}</span>
        </div>
        <div class="login-brand-text">
          <span class="login-brand-app">e-Rapor</span>
          <strong>${escapeHtml(schoolLabel.toUpperCase())}</strong>
          <span class="login-brand-tagline">Cerdas • Berkarakter • Berprestasi</span>
        </div>
      </div>
      <div class="login-credit">
        <span class="login-credit-lead">${escapeHtml(DEVELOPER_CREDIT_LEAD)}</span>
        <strong class="login-credit-name">${escapeHtml(DEVELOPER_NAME)}</strong>
        <span class="login-credit-role">${escapeHtml(DEVELOPER_ROLE)}</span>
        <span class="login-credit-copy">${escapeHtml(COPYRIGHT)}</span>
      </div>
      <div class="login-card-slot">
        <div class="login-shell">
          <div class="login-shell-head">
            <div class="login-crest-row">
              <img class="login-crest${kelasUnggahan(ministryUpload)}" src="${escapeHtml(ministryLogo)}" alt="Logo Tut Wuri Handayani" data-crest="ministry"/>
              <img class="login-crest ${regionUpload?'login-crest-upload':'login-crest-region'}" src="${escapeHtml(regionLogo)}" alt="Logo Kabupaten/Kota/Provinsi" data-crest="region"/>
              <img class="login-crest${kelasUnggahan(schoolLogo)}" src="${escapeHtml(crest)}" alt="${escapeHtml(crestAlt)}" data-crest="school"/>
            </div>
            <h2>Masuk ke e-Rapor</h2>
            <p>Pilih peran, semester, lalu masukkan akun Anda.</p>
          </div>
          <form class="login-form" id="loginForm" novalidate>
            <div class="role-switch" role="tablist">
              <button type="button" class="role-btn active" data-role="admin" role="tab" aria-selected="true">Admin</button>
              <button type="button" class="role-btn" data-role="teacher" role="tab" aria-selected="false">Guru / Wali Kelas</button>
            </div>
            <div class="login-field login-anim" style="--rise:1">
              <span class="login-field-icon">${icon('school',15)}</span>
              <input class="input" id="loginSchool" value="${escapeHtml(schoolLabel)}" aria-label="Sekolah" readonly/>
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
            <button class="login-ghost hidden" type="button" data-activate>Buat Password Admin Pertama</button>
            <div class="login-help" id="loginHelp">Memeriksa keamanan akun lokal...</div>
          </form>
          <span class="login-version">v${escapeHtml(APP_VERSION)}</span>
        </div>
      </div>
    </div>
  </main>`);

  function help(){const activation=root.querySelector('[data-activate]');activation.classList.toggle('hidden',role!=='admin'||adminActivated);qs('#loginHelp',root).innerHTML=role==='admin'?(adminActivated?'Gunakan akun Admin dan password lokal yang sudah dibuat.':'Lisensi sudah aktif. Buat password Admin pertama untuk melanjutkan.'):'Gunakan username akun rombel, atau username Guru selama credential bootstrap masih aktif.';}
  async function refreshStatus(){try{await ensureSecurityBootstrap();const status=await getSecurityStatus();adminActivated=status.adminActivated;if(!adminActivated){onActivate?.();return;}help();}catch(error){const box=qs('#loginError',root);box.textContent=error.message;box.classList.remove('hidden');}}
  function showRecoveryCode(code,title){const modal=el(`<div class="modal-backdrop"><div class="modal-card"><h3>${escapeHtml(title)}</h3><p>Simpan kode ini di tempat aman. Kode tidak disimpan dalam bentuk plaintext dan hanya ditampilkan sekali.</p><div class="recovery-code">${escapeHtml(code)}</div><div class="modal-actions"><button class="btn btn-primary" data-close>Saya Sudah Menyimpan</button></div></div></div>`);document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();}
  function passwordFields(){return `<div class="field"><label>Password Baru</label><input class="input" type="password" name="newPassword" autocomplete="new-password" required/></div><div class="field"><label>Ulangi Password</label><input class="input" type="password" name="confirmPassword" autocomplete="new-password" required/></div>`;}
  function openAdminRecovery(){const modal=el(`<div class="modal-backdrop"><form class="modal-card"><div class="modal-head"><div><h3>Recovery Admin Lokal</h3><p>Masukkan kode recovery yang disimpan saat pembuatan Admin atau recovery sebelumnya.</p></div><button type="button" class="btn btn-light btn-icon" data-close>${icon('x',17)}</button></div><div class="field"><label>Kode Recovery</label><input class="input" name="recovery" autocomplete="off" required/></div>${passwordFields()}<div class="login-error hidden" data-error></div><div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" type="submit">Pulihkan Admin</button></div></form></div>`);document.body.append(modal);const form=modal.querySelector('form');const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;form.onsubmit=async event=>{event.preventDefault();if(form.elements.newPassword.value!==form.elements.confirmPassword.value){const box=modal.querySelector('[data-error]');box.textContent='Konfirmasi password tidak sama.';box.classList.remove('hidden');return;}try{const result=await recoverAdmin(form.elements.recovery.value,form.elements.newPassword.value);close();showRecoveryCode(result.recoveryCode,'Kode Recovery Baru');toast('Password Admin berhasil dipulihkan.');}catch(error){const box=modal.querySelector('[data-error]');box.textContent=error.message;box.classList.remove('hidden');}};}

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
      /* SETIAP percobaan masuk menyegarkan status lisensi ke server lebih dulu.

         Inilah yang membuat pencabutan oleh Owner benar-benar terasa: pengguna yang keluar lalu
         mencoba masuk lagi akan tertolak, bukan terus memakai status lama yang tersimpan.
         Kegagalan jaringan tidak dianggap pencabutan, sehingga sekolah yang sedang offline
         tidak ikut terkunci. */
      await refreshLicenseForLogin();
      const session=await authenticate({role,username:qs('#username',root).value,password:qs('#password',root).value,semester:qs('#semester',root).value});
      saveSession(session);onSuccess(session);
    }catch(error){
      /* Lisensi yang tidak berlaku mengembalikan pengguna ke halaman Aktivasi Lisensi, bukan
         sekadar menampilkan pesan galat di kotak login. */
      if(error.code==='LICENSE_BLOCKED'){onLicenseBlocked?.(error);return;}
      errorBox.textContent=error.message;errorBox.classList.remove('hidden');
      /* Getaran sekali pada kotak galat saja, panel tetap diam. */
      errorBox.classList.remove('login-shake');void errorBox.offsetWidth;errorBox.classList.add('login-shake');
    }finally{button.disabled=false;button.textContent='Masuk';}
  };
  const logo=root.querySelector('[data-login-logo]');
  if(logo)logo.onerror=()=>{logo.classList.add('hidden');root.querySelector('.login-logo-fallback')?.classList.remove('hidden');};
  /* GAMBAR RUSAK TIDAK BOLEH SAMPAI KE LAYAR. Unggahan yang gagal dimuat jatuh kembali ke
     berkas bawaan aplikasi sekali saja; bila yang bawaan pun tidak ada, slotnya disembunyikan
     sehingga barisnya tetap rapi - bukan menampilkan ikon gambar patah. Slot yang disembunyikan
     tidak mengubah urutan dua logo lainnya. */
  const CADANGAN_CREST={ministry:'./assets/logo-tut-wuri-handayani.png',
    region:'./assets/logo-kabupaten-bekasi.png',school:'./assets/app-icon-192.png'};
  root.querySelectorAll('[data-crest]').forEach(image=>{
    image.onerror=()=>{
      const cadangan=CADANGAN_CREST[image.dataset.crest];
      if(cadangan&&!image.dataset.fallbackDipakai&&!image.src.endsWith(cadangan.replace('./',''))){
        image.dataset.fallbackDipakai='1';image.src=cadangan;return;
      }
      image.classList.add('hidden');
    };
  });
  refreshStatus();
  return root;
}
