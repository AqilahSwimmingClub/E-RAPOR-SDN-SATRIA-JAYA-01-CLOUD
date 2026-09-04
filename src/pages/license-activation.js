import { activateLicense, checkLicense, formatLicenseKeyInput, getLicenseDisplay, getLicenseState,
  LICENSE_MESSAGES } from '../services/license.js';
import { getInstallationId, getInstallationSource } from '../services/installation.js';
import { DEVICE_SOURCE_NOTES } from '../services/device-identity.js';
import { getSchoolMaster } from '../services/master.js';
import { APP_NAME, COPYRIGHT, DEVELOPER_CREDIT_LEAD, DEVELOPER_NAME, DEVELOPER_ROLE } from '../data/app-identity.js';
import { APP_VERSION } from '../data/version.js';
import { el, escapeHtml } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Halaman Aktivasi Lisensi. Muncul setelah identitas sekolah tersimpan dan sebelum aplikasi
   dapat dipakai. Kunci hanya ditampilkan tersamar setelah aktivasi berhasil; tidak ada tombol
   apa pun di sini untuk mengambil kunci utuh dari server. */

export function renderLicenseActivation({onActivated}={}){
  const school=getSchoolMaster();
  const tersimpan=getLicenseDisplay();
  /* MASA TENGGANG OFFLINE HABIS BUKAN LISENSI DICABUT.

     Perangkat ini sudah lebih dari 72 jam tidak berhasil memverifikasi lisensinya ke server.
     Lisensinya sendiri boleh jadi masih sah; yang dibutuhkan hanya internet sekali. Karena itu
     halaman ini menawarkan PEMERIKSAAN ULANG lebih dulu, bukan meminta License Key baru. */
  const perluVerifikasi=getLicenseState().needsVerification===true;
  let mengirim=false;

  const root=el(`<main class="setup-stage">
    <section class="card setup-card license-card">
      <div class="section-head"><div>
        <h1>Aktivasi ${escapeHtml(APP_NAME)}</h1>
        <p>Masukkan License Key yang Anda terima dari penyedia ${escapeHtml(APP_NAME)}. Aktivasi pertama membutuhkan internet satu kali; setelah berhasil, aplikasi kembali berjalan penuh tanpa internet.</p>
      </div></div>

      <div class="license-school">
        <div><span>Nama Sekolah</span><strong>${escapeHtml(school.name||'—')}</strong></div>
        ${school.npsn?`<div><span>NPSN</span><strong>${escapeHtml(school.npsn)}</strong></div>`:''}
        <div><span>Installation ID</span><code>${escapeHtml(getInstallationId())}</code></div>
      </div>
      <p class="setup-hint">Satu License Key melayani <strong>satu perangkat Android</strong> dan <strong>satu komputer Windows</strong>. Keduanya berdiri sendiri: mengaktifkan di HP tidak memakai jatah komputer, dan sebaliknya.</p>
      <p class="setup-hint">${escapeHtml(DEVICE_SOURCE_NOTES[getInstallationSource()]||'')}</p>

      ${perluVerifikasi?`<div class="license-verify" data-verify>
        <p><strong>Lisensi perlu diverifikasi.</strong> Hubungkan perangkat ke internet untuk melanjutkan. Seluruh data sekolah tetap tersimpan utuh dan tidak ada yang dihapus.</p>
        <div class="actions"><button class="btn btn-primary" type="button" data-recheck>${icon('rotate',16)} PERIKSA LISENSI SEKARANG</button></div>
        <div class="login-error hidden" data-verify-error role="alert"></div>
      </div>
      <p class="setup-hint">Bila lisensi sekolah ini memang sudah diganti, masukkan License Key baru di bawah.</p>`:''}

      <form data-form>
        <div class="field"><label>License Key</label>
          <input class="input license-input" name="licenseKey" autocomplete="off" spellcheck="false"
            placeholder="ERAPOR-XXXX-XXXX-XXXX" value="${escapeHtml(tersimpan?'':'ERAPOR-')}" required/></div>
        <div class="login-error hidden" data-error role="alert"></div>
        <div class="license-ok hidden" data-ok role="status"></div>
        <div class="actions"><button class="btn btn-primary" type="submit" data-submit>${icon('check',16)} AKTIFKAN</button></div>
      </form>

      ${tersimpan?`<p class="setup-hint">Lisensi tersimpan pada perangkat ini: <code>${escapeHtml(tersimpan.hint)}</code> · status ${escapeHtml(tersimpan.status)}</p>`:''}
      <p class="setup-hint">Versi aplikasi ${escapeHtml(APP_VERSION)}</p>
    </section>
    <footer class="setup-credit">
      <span>${escapeHtml(DEVELOPER_CREDIT_LEAD)}</span>
      <strong>${escapeHtml(DEVELOPER_NAME)}</strong>
      <span>${escapeHtml(DEVELOPER_ROLE)}</span>
      <small>${escapeHtml(COPYRIGHT)}</small>
    </footer>
  </main>`);

  /* Pemeriksaan ulang: hanya menghubungi server lisensi, tidak mengubah apa pun di database
     sekolah. Bila server menjawab ACTIVE, masa tenggang 72 jam dimulai lagi dari verifikasi
     tersebut dan aplikasi langsung terbuka kembali. */
  const tombolPeriksa=root.querySelector('[data-recheck]');
  if(tombolPeriksa){
    const galatPeriksa=root.querySelector('[data-verify-error]');
    tombolPeriksa.onclick=async()=>{
      tombolPeriksa.disabled=true;
      tombolPeriksa.textContent='Memeriksa…';
      galatPeriksa.classList.add('hidden');
      const record=await checkLicense({force:true}).catch(()=>null);
      if(getLicenseState().canUseApp){onActivated?.(record);return;}
      galatPeriksa.textContent=getLicenseState().message||LICENSE_MESSAGES.NETWORK;
      galatPeriksa.classList.remove('hidden');
      tombolPeriksa.disabled=false;
      tombolPeriksa.innerHTML=`${icon('rotate',16)} PERIKSA LISENSI SEKARANG`;
    };
  }

  const input=root.querySelector('[name="licenseKey"]');
  const tombol=root.querySelector('[data-submit]');
  const kotakError=root.querySelector('[data-error]');
  const kotakOk=root.querySelector('[data-ok]');

  input.oninput=()=>{
    const posisiAkhir=input.selectionStart===input.value.length;
    input.value=formatLicenseKeyInput(input.value);
    if(posisiAkhir)input.setSelectionRange(input.value.length,input.value.length);
  };

  root.querySelector('[data-form]').onsubmit=async event=>{
    event.preventDefault();
    if(mengirim)return;                       /* cegah kiriman ganda */
    mengirim=true;
    tombol.disabled=true;
    tombol.textContent='Mengaktifkan…';
    kotakError.classList.add('hidden');
    kotakOk.classList.add('hidden');
    try{
      const record=await activateLicense({licenseKey:input.value,school});
      kotakOk.textContent=LICENSE_MESSAGES.OK;
      kotakOk.classList.remove('hidden');
      tombol.textContent='Berhasil';
      onActivated?.(record);
    }catch(error){
      kotakError.textContent=error.message||LICENSE_MESSAGES.NETWORK;
      kotakError.classList.remove('hidden');
      tombol.disabled=false;
      tombol.innerHTML=`${icon('check',16)} AKTIFKAN`;
      mengirim=false;
    }
  };
  return root;
}
