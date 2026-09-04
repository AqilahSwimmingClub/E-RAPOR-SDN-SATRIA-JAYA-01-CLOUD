/* IDENTITAS PERANGKAT.

   Installation ID e-Rapor tidak boleh cukup berupa nilai acak di localStorage. Kalau begitu,
   menyalin isi storage dari HP guru A ke HP guru B akan membuat B ikut dianggap berlisensi.
   Karena itu identitas perangkat DITURUNKAN dari sinyal milik perangkat itu sendiri:

     Android  - Device ID dari Capacitor (@capacitor/device). Nilai per-pemasangan yang
                disediakan sistem, bukan IMEI dan bukan nomor telepon, sehingga tidak
                memerlukan izin perangkat apa pun.
     Windows  - nilai yang dihitung peluncur Electron dari MachineGuid Windows lalu disimpan di
                folder userData aplikasi. Peluncur menyuntikkannya sebagai meta tag, persis
                seperti token bridge Dapodik.
     Web/PWA  - tidak ada sinyal perangkat yang dapat dipercaya. Di sini identitasnya memang
                acak dan disimpan di storage; keterbatasan ini dinyatakan apa adanya, bukan
                disembunyikan.

   NILAI MENTAHNYA TIDAK PERNAH DIKIRIM KE SERVER. Yang dikirim adalah SHA-256-nya, dipotong
   menjadi 32 hex. Server hanya pernah melihat hasil hash, jadi tidak ada identifier perangkat
   yang dapat bocor dari basis data lisensi maupun dari layar Admin Lisensi.

   ALASAN_HASH bukan rahasia dan memang tidak perlu rahasia - apa pun yang ditanam di dalam
   bundle Web/APK/EXE dapat dibaca siapa saja. Gunanya hanya pemisahan domain: hash yang sama
   tidak akan pernah bertabrakan dengan hash keperluan lain. Keamanannya datang dari fakta bahwa
   nilai mentah tidak pernah keluar dari perangkat, bukan dari kerahasiaan string ini. */

const ALASAN_HASH='erapor-installation-id/v1';

export const DEVICE_SOURCES=Object.freeze({
  ANDROID:'android',
  WINDOWS:'windows',
  BROWSER:'browser',
});

/* Nilai dari sistem operasi dapat berbeda kapitalisasi dan pemisahnya antar versi. Dinormalkan
   lebih dulu supaya pembaruan aplikasi pada perangkat yang sama tidak pernah melahirkan
   Installation ID baru. */
export function normalizeRawDeviceId(value){
  return String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
}

export function isInstallationId(value){return /^inst_[0-9a-f]{32}$/.test(String(value||''));}

const hexDari=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');

/* SHA-256 atas "<alasan>:<sumber>:<nilai ternormalisasi>", dipotong 16 byte. Memasukkan nama
   sumber membuat nilai kebetulan sama dari dua platform berbeda tetap menghasilkan Installation
   ID yang berbeda. */
export async function hashDeviceId(source,raw){
  const bersih=normalizeRawDeviceId(raw);
  if(!bersih)return null;
  const bytes=new TextEncoder().encode(`${ALASAN_HASH}:${source}:${bersih}`);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return `inst_${hexDari(digest).slice(0,32)}`;
}

/* -------------------------------------------------------------------- Sinyal per platform */

/* Windows. Peluncur Electron menyuntikkan meta tag ini ke dalam halaman, sama seperti token
   bridge Dapodik. Nilainya sudah berupa hash yang dihitung peluncur, jadi MachineGuid mentah
   tidak pernah sampai ke halaman - apalagi ke server. */
export function readDesktopDeviceSignal(){
  const meta=globalThis.document?.querySelector?.('meta[name="erapor-desktop-device-id"]');
  return String(meta?.getAttribute?.('content')||'').trim();
}

/* Android. Capacitor dijangkau lewat globalThis karena aplikasi ini dilayani sebagai ES module
   tanpa bundler: specifier telanjang seperti '@capacitor/device' tidak dapat diimpor browser. */
export async function readAndroidDeviceSignal(){
  const plugin=globalThis.Capacitor?.Plugins?.Device;
  if(!plugin?.getId)return '';
  try{
    const hasil=await plugin.getId();
    return String(hasil?.identifier||hasil?.uuid||'').trim();
  }catch{return '';}
}

function platformCapacitor(){
  const nilai=globalThis.Capacitor?.getPlatform?.();
  return String(nilai||'').trim().toLowerCase();
}

/* Platform yang dilaporkan ke server bersama permintaan aktivasi. Server tetap memutuskan
   sendiri slot mana yang dipakai; nilai ini hanya masukan. */
export function detectPlatform(){
  const cap=platformCapacitor();
  if(cap==='android'||cap==='ios')return cap;
  if(readDesktopDeviceSignal())return 'windows';
  return 'web';
}

/* Mengembalikan identitas perangkat bila platform ini memang punya sinyalnya, atau null bila
   tidak. Web/PWA selalu null - dan itu memang jawaban yang jujur untuknya. */
export async function resolveDeviceIdentity(){
  const cap=platformCapacitor();
  if(cap==='android'||cap==='ios'){
    const mentah=await readAndroidDeviceSignal();
    const id=await hashDeviceId(DEVICE_SOURCES.ANDROID,mentah);
    if(id)return {installationId:id,source:DEVICE_SOURCES.ANDROID,platform:cap};
    return null;
  }
  const desktop=readDesktopDeviceSignal();
  if(desktop){
    const id=await hashDeviceId(DEVICE_SOURCES.WINDOWS,desktop);
    if(id)return {installationId:id,source:DEVICE_SOURCES.WINDOWS,platform:'windows'};
  }
  return null;
}

/* Dipakai layar Aktivasi Lisensi untuk menerangkan batas identitas perangkat apa adanya. */
export const DEVICE_SOURCE_NOTES=Object.freeze({
  [DEVICE_SOURCES.ANDROID]:'Identitas perangkat berasal dari Android. Memperbarui aplikasi tidak mengubahnya, '
    +'tetapi meng-uninstall aplikasi sampai bersih lalu memasangnya kembali DAPAT menghasilkan identitas baru '
    +'sehingga lisensi perlu direset oleh Admin Lisensi.',
  [DEVICE_SOURCES.WINDOWS]:'Identitas perangkat berasal dari komputer Windows ini. Memperbarui aplikasi tanpa '
    +'uninstall tidak mengubahnya.',
  [DEVICE_SOURCES.BROWSER]:'Aplikasi sedang berjalan di browser, yang tidak menyediakan identitas perangkat. '
    +'Identitas dibuat acak dan disimpan di penyimpanan browser ini saja; membersihkan data situs akan '
    +'menghasilkan identitas baru.',
});
