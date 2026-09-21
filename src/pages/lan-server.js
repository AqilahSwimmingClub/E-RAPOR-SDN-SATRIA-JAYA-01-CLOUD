import { el, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { qrSvg } from '../services/qr.js';
import { bacaStatusLan, matikanLan, nyalakanLan, dukunganLanTersedia } from '../services/lan-admin.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* HALAMAN SERVER LAN.

   Satu halaman untuk satu keputusan: apakah komputer ini melayani guru lain di jaringan
   sekolah atau tidak. Ia sengaja dibuat sesederhana mungkin karena yang membukanya adalah
   Admin sekolah, bukan petugas jaringan.

   ALAMAT TIDAK PERNAH DIHAFAL HALAMAN INI. Setiap kali dibuka, daftar alamat diminta ulang ke
   server, sebab DHCP kerap memberi alamat berbeda setiap komputer dinyalakan. Alamat yang
   sudah basi justru lebih berbahaya daripada tidak ada alamat sama sekali: guru akan mencoba
   menyambung ke komputer yang salah lalu mengira aplikasinya rusak.

   QR HANYA MEMUAT ALAMAT. Ia ditempel di dinding ruang guru dan difoto, jadi apa pun yang ada
   di dalamnya harus aman dilihat siapa saja - tidak ada kata sandi, token sesi, token lisensi,
   maupun Installation ID yang boleh ikut. */
export function renderLanServer(session){
  const root=el(`<div><div class="page-head"><div><h1>Server LAN</h1><p>Izinkan guru membuka e-Rapor dari laptop, tablet, atau HP melalui jaringan Wi-Fi sekolah. Database tetap berada di komputer ini.</p></div></div><div data-isi></div></div>`);
  const isi=root.querySelector('[data-isi]');

  if(session?.role!=='admin'){
    isi.append(el(`<section class="card empty-state"><div class="placeholder-icon">${icon('settings',26)}</div><h3>Khusus Admin</h3><p>Pengaturan Server LAN hanya dapat diubah oleh Admin sekolah dari komputer server.</p></section>`));
    return root;
  }
  if(!dukunganLanTersedia()){
    isi.append(el(`<section class="card empty-state"><div class="placeholder-icon">${icon('settings',26)}</div><h3>Hanya di Komputer Server</h3><p>Halaman ini hanya berfungsi pada aplikasi e-Rapor Windows di komputer server sekolah. Membukanya dari laptop guru atau dari browser biasa tidak dapat mengubah pengaturan jaringan.</p></section>`));
    return root;
  }

  function gambar(){
    isi.replaceChildren();
    let status;
    try{status=bacaStatusLan();}
    catch(error){
      isi.append(el(`<section class="card empty-state"><h3>Status tidak terbaca</h3><p>${escapeHtml(error.message)}</p></section>`));
      return;
    }

    const lisensiBerlaku=status.lisensi?.berlaku!==false;
    const baris=(label,nilai,kelas)=>`<div class="lan-status-row"><span>${escapeHtml(label)}</span><strong class="${kelas||''}">${escapeHtml(nilai)}</strong></div>`;

    const kartuStatus=el(`<section class="card">
      <h3>Status</h3>
      <div class="lan-status">
        ${baris('Server LAN',status.aktif?'AKTIF':'NONAKTIF',status.aktif?'lan-on':'lan-off')}
        ${baris('Database','AKTIF','lan-on')}
        ${baris('Lisensi',lisensiBerlaku?'AKTIF':'TIDAK BERLAKU',lisensiBerlaku?'lan-on':'lan-off')}
        ${baris('Guru sedang masuk',String(status.sesiAktif||0))}
      </div>
      ${lisensiBerlaku?'':`<p class="muted" style="font-size:12.5px;line-height:1.55;margin-top:12px">${escapeHtml(status.lisensi?.pesan||'Lisensi komputer server belum berlaku, sehingga Server LAN tidak dapat dinyalakan.')}</p>`}
    </section>`);
    isi.append(kartuStatus);

    if(status.aktif){
      const alamat=status.url;
      const kartu=el(`<section class="card">
        <h3>Alamat untuk Guru</h3>
        <p class="muted" style="font-size:12.5px;line-height:1.55">Guru membuka alamat ini di browser laptop, tablet, atau HP yang tersambung ke Wi-Fi sekolah yang sama. Alamat berubah bila router memberi komputer ini alamat baru, jadi periksa halaman ini kembali setelah komputer dinyalakan ulang.</p>
        <div class="lan-alamat" data-alamat>${escapeHtml(alamat)}</div>
        <div class="lan-aksi">
          <button class="btn btn-light" data-salin>${icon('copy',16)} Salin Alamat</button>
          <button class="btn btn-light" data-buka>${icon('grid',16)} Buka e-Rapor</button>
          <button class="btn btn-danger" data-mati>${icon('settings',16)} Nonaktifkan LAN</button>
        </div>
        <div class="lan-qr" data-qr><p class="muted" style="font-size:12px;margin-bottom:8px">Pindai dengan kamera HP untuk membuka alamat di atas. Kode ini hanya berisi alamat, tanpa kata sandi apa pun.</p></div>
      </section>`);
      isi.append(kartu);
      try{
        const wadah=kartu.querySelector('[data-qr]');
        const gambarQr=el(`<div class="lan-qr-kotak">${qrSvg(alamat,{ukuranPiksel:200})}</div>`);
        wadah.append(gambarQr);
      }catch{
        kartu.querySelector('[data-qr]').append(el('<p class="muted" style="font-size:12px">QR tidak dapat dibuat untuk alamat ini. Gunakan alamat tertulis di atas.</p>'));
      }
      kartu.querySelector('[data-salin]').onclick=async()=>{
        try{await navigator.clipboard.writeText(alamat);toast('Alamat server disalin.');}
        catch{toast('Alamat tidak dapat disalin otomatis. Salin manual dari layar.','error');}
      };
      kartu.querySelector('[data-buka]').onclick=()=>{window.open(alamat,'_blank','noopener');};
      kartu.querySelector('[data-mati]').onclick=()=>{
        try{matikanLan();toast('Server LAN dinonaktifkan. Guru yang sedang masuk otomatis keluar.');gambar();}
        catch(error){toast(error.message,'error');}
      };
    }else{
      const pilihan=status.pilihan||[];
      const kartu=el(`<section class="card">
        <h3>Aktifkan Server LAN</h3>
        <p class="muted" style="font-size:12.5px;line-height:1.55">Selama LAN nonaktif, e-Rapor hanya dapat dibuka di komputer ini. Menyalakannya tidak memindahkan data: seluruh nilai tetap tersimpan di komputer ini, dan guru hanya membukanya dari jauh.</p>
        ${pilihan.length?`<label class="field"><span>Jaringan yang dipakai</span><select data-alamat>${pilihan.map(item=>`<option value="${escapeHtml(item.alamat)}">${escapeHtml(item.alamat)} — ${escapeHtml(item.nama)}${item.virtual?' (adaptor virtual)':''}</option>`).join('')}</select></label>`
          :'<p class="muted" style="font-size:12.5px">Komputer ini belum tersambung ke jaringan Wi-Fi atau LAN mana pun, sehingga Server LAN belum dapat dinyalakan.</p>'}
        ${pilihan.some(item=>item.virtual)?'<p class="muted" style="font-size:12px;line-height:1.5">Adaptor virtual (VPN, VirtualBox, Hyper-V) ikut ditampilkan tetapi biasanya BUKAN jaringan sekolah. Pilih adaptor Wi-Fi atau Ethernet kecuali Anda memang yakin.</p>':''}
        <div class="lan-aksi"><button class="btn btn-primary" data-nyala ${pilihan.length&&lisensiBerlaku?'':'disabled'}>${icon('check',16)} Aktifkan Server LAN</button></div>
      </section>`);
      isi.append(kartu);
      const tombol=kartu.querySelector('[data-nyala]');
      if(tombol)tombol.onclick=()=>{
        const alamat=kartu.querySelector('[data-alamat]')?.value||'';
        tombol.disabled=true;
        try{nyalakanLan(alamat);toast('Server LAN aktif. Bagikan alamatnya kepada guru.');gambar();}
        catch(error){toast(error.message,'error');tombol.disabled=false;}
      };
    }

    isi.append(el(`<section class="card">
      <h3>Yang perlu disiapkan sekali</h3>
      <ul class="lan-petunjuk">
        <li><strong>Satu Wi-Fi yang sama.</strong> Laptop guru harus tersambung ke router sekolah yang sama dengan komputer ini. Internet tidak diperlukan; router saja sudah cukup.</li>
        <li><strong>Izinkan e-Rapor pada Windows Defender Firewall.</strong> Saat pertama kali diaktifkan Windows akan bertanya - pilih <em>Jaringan privat</em>, dan jangan centang Jaringan publik.</li>
        <li><strong>Komputer ini harus tetap menyala.</strong> Bila dimatikan atau tertidur, guru akan melihat pesan bahwa server tidak dapat dihubungi, dan penyimpanan mereka ditolak - bukan hilang diam-diam.</li>
        <li><strong>Alamat tetap lebih nyaman.</strong> Bila router mendukung, mintakan alamat tetap (DHCP reservation) untuk komputer ini supaya alamatnya tidak berganti-ganti. Aplikasi tetap berjalan tanpa ini.</li>
      </ul>
    </section>`));
  }

  gambar();
  return root;
}
