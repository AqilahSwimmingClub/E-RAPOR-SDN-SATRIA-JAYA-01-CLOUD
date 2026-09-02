import { APP_NAME, COPYRIGHT, CONTACT_WHATSAPP_DISPLAY, DEVELOPER_CREDIT_LEAD, DEVELOPER_NAME,
  DEVELOPER_ROLE, PROMO_HEADLINE, PROMO_HIGHLIGHTS, PROMO_PARAGRAPHS, PURCHASE_MESSAGE,
  SUPPORT_URL, whatsappUrl } from '../data/app-identity.js';
import { APP_VERSION } from '../data/version.js';
import { UPDATE_STATUS } from '../data/update-config.js';
import { getSchoolMaster } from '../services/master.js';
import { checkForUpdates, detectPlatform, getUpdateStatus, UPDATE_MESSAGES } from '../services/updates.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Halaman Tentang & Pembaruan.

   Satu-satunya tempat informasi pembelian lisensi ditampilkan. Tidak ada popup, tidak ada
   banner di Dashboard, dan tidak ada apa pun yang ikut tercetak ke rapor, leger, cover, atau
   PDF: seluruh isi halaman ini hanya hidup di layar menu ini.

   Nomor WhatsApp tidak pernah ditulis di berkas ini. Seluruh tautan disusun dari satu sumber
   di src/data/app-identity.js. */

const PLATFORM_LABEL={android:'Android',windows:'Windows'};
const NADA={
  [UPDATE_STATUS.LATEST]:'status-ok',
  [UPDATE_STATUS.AVAILABLE]:'status-warning',
  [UPDATE_STATUS.MANDATORY]:'status-error',
  [UPDATE_STATUS.UNKNOWN]:'muted',
  [UPDATE_STATUS.OFFLINE]:'muted',
};

function tanggal(value){
  if(!value)return '—';
  const waktu=new Date(value);
  if(Number.isNaN(waktu.getTime()))return '—';
  return waktu.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
}

/* Pesan WhatsApp memuat identitas SEKOLAH dan versi aplikasi saja. Tidak ada nama siswa, NISN,
   nilai, absensi, password, token lisensi, Installation ID, maupun License Key. */
export function purchaseMessage({schoolName='',npsn='',version=APP_VERSION}={}){
  const baris=[PURCHASE_MESSAGE,''];
  if(String(schoolName||'').trim())baris.push(`Nama Sekolah: ${String(schoolName).trim()}`);
  if(String(npsn||'').trim())baris.push(`NPSN: ${String(npsn).trim()}`);
  baris.push(`Versi e-Rapor: ${version}`);
  return baris.join('\n');
}

export function renderAboutUpdates(session){
  const sekolah=getSchoolMaster();
  const platform=detectPlatform();
  let keadaan=getUpdateStatus();

  const root=el(`<div><div class="page-head"><div><h1>Tentang &amp; Pembaruan</h1>
    <p>Informasi versi aplikasi, pembaruan resmi, dan lisensi ${escapeHtml(APP_NAME)}.</p></div></div>
    <div data-versi></div><div data-promosi></div><div data-identitas></div></div>`);
  const hostVersi=root.querySelector('[data-versi]');

  function gambarVersi({memeriksa=false}={}){
    const platformLabel=PLATFORM_LABEL[keadaan.platform]||'Perangkat ini';
    const catatan=String(keadaan.notes||'').trim();
    const pesan=keadaan.message||(keadaan.status===UPDATE_STATUS.OFFLINE?UPDATE_MESSAGES.OFFLINE:'');
    const bisaUnduh=Boolean(keadaan.downloadUrl)&&
      (keadaan.status===UPDATE_STATUS.AVAILABLE||keadaan.status===UPDATE_STATUS.MANDATORY);
    hostVersi.innerHTML=`<section class="card about-card">
      <div class="section-head"><div><h2>${escapeHtml(APP_NAME)}</h2>
        <p>${escapeHtml(platformLabel)}${keadaan.checkedAt?` · terakhir diperiksa ${escapeHtml(tanggal(keadaan.checkedAt))}`:''}</p></div>
        <span class="badge ${escapeHtml(NADA[keadaan.status]||'muted')}" data-status>${escapeHtml(keadaan.label)}</span></div>
      <dl class="about-facts">
        <div><dt>Versi Terpasang</dt><dd data-versi-terpasang>${escapeHtml(keadaan.installedVersion)}</dd></div>
        <div><dt>Versi Terbaru</dt><dd data-versi-terbaru>${escapeHtml(keadaan.latestVersion||'Belum diketahui')}</dd></div>
        <div><dt>Status Pembaruan</dt><dd>${escapeHtml(keadaan.label)}</dd></div>
        <div><dt>Tanggal Rilis</dt><dd>${escapeHtml(tanggal(keadaan.releasedAt))}</dd></div>
      </dl>
      <div class="about-notes"><h3>Catatan Pembaruan</h3>
        <p>${catatan?escapeHtml(catatan):'Belum ada catatan pembaruan yang tersedia.'}</p></div>
      ${pesan?`<p class="about-message">${escapeHtml(pesan)}</p>`:''}
      ${keadaan.status===UPDATE_STATUS.MANDATORY
        ? '<p class="about-message">Versi ini sudah berada di bawah versi minimum yang didukung. Seluruh data sekolah tetap tersimpan utuh; pembaruan tidak menghapus siswa, nilai, absensi, pengaturan, backup, maupun lisensi perangkat.</p>'
        : ''}
      <div class="actions">
        <button class="btn btn-primary" data-periksa ${memeriksa?'disabled':''}>${icon('rotate',16)} ${memeriksa?'Memeriksa…':'Periksa Pembaruan'}</button>
        ${bisaUnduh?`<a class="btn btn-light" data-unduh href="${escapeHtml(keadaan.downloadUrl)}" target="_blank" rel="noopener noreferrer">${icon('download',16)} Unduh Pembaruan</a>`:''}
      </div>
      ${bisaUnduh?'<p class="about-hint">Berkas pembaruan dibuka dari sumber resmi pengembang. Pemasangan tetap melalui sistem perangkat Anda, dan data e-Rapor yang sudah ada tidak dihapus.</p>':''}
    </section>`;
    hostVersi.querySelector('[data-periksa]').onclick=async()=>{
      gambarVersi({memeriksa:true});
      keadaan=await checkForUpdates({force:true,platform});
      gambarVersi();
      if(keadaan.status===UPDATE_STATUS.OFFLINE||keadaan.status===UPDATE_STATUS.UNKNOWN)
        toast(keadaan.message||UPDATE_MESSAGES.OFFLINE,'warning');
      else toast(`Status pembaruan: ${keadaan.label}.`);
    };
  }

  /* ------------------------------------------------------------- Informasi pembelian lisensi */
  const promosi=root.querySelector('[data-promosi]');
  const pesanAwal=purchaseMessage({schoolName:sekolah.name,npsn:sekolah.npsn,version:APP_VERSION});
  promosi.innerHTML=`<section class="card about-card purchase-card">
    <h2>${escapeHtml(PROMO_HEADLINE)}</h2>
    ${PROMO_PARAGRAPHS.map(teks=>`<p>${escapeHtml(teks)}</p>`).join('')}
    <ul class="purchase-highlights">${PROMO_HIGHLIGHTS.map(teks=>`<li>${escapeHtml(teks)}</li>`).join('')}</ul>
    <div class="field"><label for="purchaseMessage">Pesan WhatsApp (dapat Anda ubah sebelum dikirim)</label>
      <textarea class="input" id="purchaseMessage" rows="5" data-pesan>${escapeHtml(pesanAwal)}</textarea></div>
    <div class="actions">
      <a class="btn btn-primary" data-beli target="_blank" rel="noopener noreferrer" href="${escapeHtml(whatsappUrl(pesanAwal))}">Beli Lisensi ${escapeHtml(APP_NAME)}</a>
      <a class="btn btn-light" data-hubungi target="_blank" rel="noopener noreferrer" href="${escapeHtml(SUPPORT_URL)}">Hubungi Developer</a>
    </div>
    <p class="about-hint">WhatsApp resmi: ${escapeHtml(CONTACT_WHATSAPP_DISPLAY)}. Pesan hanya memuat identitas sekolah dan versi aplikasi; data siswa, nilai, absensi, dan lisensi tidak pernah ikut dikirim.</p>
  </section>`;
  const kotakPesan=promosi.querySelector('[data-pesan]');
  const tombolBeli=promosi.querySelector('[data-beli]');
  kotakPesan.oninput=()=>{tombolBeli.href=whatsappUrl(kotakPesan.value);};

  /* --------------------------------------------------------------------- Identitas pengembang */
  root.querySelector('[data-identitas]').innerHTML=`<section class="card about-card developer-card">
    <span>${escapeHtml(DEVELOPER_CREDIT_LEAD)}</span>
    <strong>${escapeHtml(DEVELOPER_NAME)}</strong>
    <span>${escapeHtml(DEVELOPER_ROLE)}</span>
    <small>${escapeHtml(COPYRIGHT)}</small>
  </section>`;

  gambarVersi();
  /* Pemeriksaan otomatis hanya berjalan bila jedanya sudah lewat, dan kegagalannya tidak pernah
     mengganggu pekerjaan guru: halaman tetap tampil apa adanya. */
  checkForUpdates({platform}).then(hasil=>{keadaan=hasil;gambarVersi();}).catch(()=>{});
  return root;
}
