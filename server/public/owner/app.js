/* Owner Panel. Aplikasi terpisah dari e-Rapor sekolah, dengan autentikasi sendiri.
   Panel ini tidak pernah dibundel ke aplikasi sekolah dan tidak menyimpan rahasia apa pun:
   seluruh kewenangan diperiksa ulang oleh server pada setiap permintaan. */

const app=document.querySelector('#app');
const SESSION='erapor_owner_session';
let token=sessionStorage.getItem(SESSION)||'';
let tab='dashboard';
let pesan=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const waktu=value=>value?new Date(value).toLocaleString('id-ID'):'—';

async function api(path,{method='GET',body=null}={}){
  const res=await fetch(`/api/v1${path}`,{method,
    headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},
    body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    if(res.status===401){token='';sessionStorage.removeItem(SESSION);}
    throw new Error(data?.error?.message||`Permintaan gagal (${res.status}).`);
  }
  return data;
}

function lapor(teks,jenis='ok'){pesan={teks,jenis};render();}

/* --------------------------------------------------------------------------- Masuk */

function tampilanLogin(){
  app.innerHTML=`<section class="card login">
    <h1>Owner Panel e-Rapor</h1>
    <p class="sub">Masuk sebagai Pemilik aplikasi. Panel ini terpisah dari akun Admin Sekolah.</p>
    <form style="margin-top:16px">
      <div style="margin-bottom:10px"><label>Username Pemilik</label><input name="username" autocomplete="username" required/></div>
      <div><label>Password</label><input name="password" type="password" autocomplete="current-password" required/></div>
      <div class="actions"><button class="btn" type="submit">Masuk</button></div>
      ${pesan?`<div class="msg ${pesan.jenis}">${esc(pesan.teks)}</div>`:''}
    </form></section>`;
  app.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const tombol=event.currentTarget.querySelector('button');
    tombol.disabled=true;
    try{
      const hasil=await api('/owner/login',{method:'POST',body:{
        username:event.currentTarget.username.value,password:event.currentTarget.password.value}});
      token=hasil.token;sessionStorage.setItem(SESSION,token);pesan=null;render();
    }catch(error){tombol.disabled=false;lapor(error.message,'err');}
  };
}

/* ------------------------------------------------------------------------ Kerangka */

async function render(){
  if(!token)return tampilanLogin();
  app.innerHTML=`<div class="topbar">
      <div><h1>Owner Panel e-Rapor</h1><p class="sub">Kelola lisensi, perangkat, dan riwayat. Satu lisensi = satu perangkat aktif.</p></div>
      <button class="btn ghost" data-keluar>Keluar</button>
    </div>
    <div class="tabs">${[['dashboard','Dashboard'],['aktif','Lisensi Aktif'],['unused','Belum Digunakan'],
      ['suspended','Ditangguhkan'],['revoked','Lisensi Dicabut'],['developer','Lisensi Developer'],
      ['customers','Sekolah/Pembeli'],['versions','Versi Aplikasi'],['events','Riwayat']]
      .map(([id,label])=>`<button class="tab ${tab===id?'active':''}" data-tab="${id}">${label}</button>`).join('')}</div>
    ${pesan?`<div class="msg ${pesan.jenis}">${esc(pesan.teks)}</div>`:''}
    <div data-isi><p class="loading">Memuat…</p></div>`;
  app.querySelector('[data-keluar]').onclick=async()=>{
    try{await api('/owner/logout',{method:'POST'});}catch{}
    token='';sessionStorage.removeItem(SESSION);pesan=null;render();
  };
  app.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.tab;pesan=null;render();});
  const isi=app.querySelector('[data-isi]');
  try{
    if(tab==='dashboard')await gambarDashboard(isi);
    else if(tab==='aktif')await gambarLisensi(isi,{status:'ACTIVE',type:'CUSTOMER',judul:'Lisensi Aktif',
      sub:'Lisensi pembeli yang sedang terikat pada satu perangkat aktif.'});
    else if(tab==='unused')await gambarLisensi(isi,{status:'UNUSED',type:'CUSTOMER',judul:'Belum Digunakan',
      sub:'Sudah diterbitkan, menunggu diaktivasi pada perangkat sekolah.',buat:true});
    else if(tab==='suspended')await gambarLisensi(isi,{status:'SUSPENDED',type:'CUSTOMER',judul:'Ditangguhkan',
      sub:'Ditahan sementara. Data akademik sekolah tidak pernah dihapus.'});
    else if(tab==='revoked')await gambarLisensi(isi,{status:'REVOKED',type:'CUSTOMER',judul:'Lisensi Dicabut',
      sub:'Dicabut permanen tetapi tidak dihapus; masih dapat dipulihkan bila diperlukan.'});
    else if(tab==='developer')await gambarLisensi(isi,{type:'DEVELOPER',judul:'Lisensi Developer',
      sub:'Lisensi resmi milik pemilik aplikasi untuk QA dan demo. Bukan penjualan, dan bukan jalan pintas: aktivasi, ikatan perangkat, dan auditnya sama seperti lisensi pembeli.',buatDeveloper:true});
    else if(tab==='customers')await gambarPelanggan(isi);
    else if(tab==='versions')await gambarVersi(isi);
    else await gambarRiwayat(isi);
  }catch(error){isi.innerHTML=`<div class="msg err">${esc(error.message)}</div>`;}
}

/* ---------------------------------------------------------------------- Dashboard

   Angka penjualan hanya menghitung lisensi PEMBELI. Lisensi Developer dilaporkan pada panel
   tersendiri supaya tidak pernah tercampur ke statistik penjualan. */

async function gambarDashboard(host){
  const s=await api('/owner/summary');
  const dev=s.developer||{total:0};
  const ringkas=l=>`<tr>${barisIdentitas(l)}
    <td><code>${esc(l.license_hint)}</code></td>
    <td><span class="pill ${esc(l.status)}">${esc(l.status)}</span></td></tr>`;
  const [aktif,dicabut,developer]=await Promise.all([
    api('/owner/licenses?status=ACTIVE&type=CUSTOMER'),
    api('/owner/licenses?status=REVOKED&type=CUSTOMER'),
    api('/owner/licenses?type=DEVELOPER'),
  ]);
  const tabel=(judul,daftar,kosong)=>`<section class="card"><h2>${judul}</h2>
    <div class="scroll">${daftar.length
      ?`<table><thead><tr><th>Pemilik Lisensi</th><th>Kunci</th><th>Status</th></tr></thead>
        <tbody>${daftar.slice(0,5).map(ringkas).join('')}</tbody></table>`
      :`<p class="sub">${kosong}</p>`}</div></section>`;

  host.innerHTML=`<div class="stats">
      ${[['Total Lisensi Pembeli',s.total],['Aktif',s.ACTIVE],['Belum Digunakan',s.UNUSED],
         ['Ditangguhkan',s.SUSPENDED],['Dicabut',s.REVOKED],['Perangkat Aktif',s.devices]]
        .map(([label,nilai])=>`<div class="stat"><span>${label}</span><b>${nilai}</b></div>`).join('')}
    </div>
    <section class="card"><h2>Lisensi Developer</h2>
      <p class="sub">Lisensi milik pemilik aplikasi untuk QA dan demo. TIDAK dihitung sebagai penjualan.</p>
      <div class="stats" style="margin-top:12px">
        ${[['Total Developer',dev.total],['Aktif',dev.ACTIVE||0],['Belum Digunakan',dev.UNUSED||0]]
          .map(([label,nilai])=>`<div class="stat"><span>${label}</span><b>${nilai}</b></div>`).join('')}
      </div>
      <div class="scroll" style="margin-top:12px">${developer.licenses.length
        ?`<table><thead><tr><th>Pemilik</th><th>Kunci</th><th>Status</th></tr></thead>
          <tbody>${developer.licenses.map(ringkas).join('')}</tbody></table>`
        :'<p class="sub">Belum ada Lisensi Developer. Buat pada halaman Lisensi Developer.</p>'}</div>
    </section>
    ${tabel('Lisensi Aktif Terbaru',aktif.licenses,'Belum ada lisensi pembeli yang aktif.')}
    ${tabel('Lisensi Dicabut Terbaru',dicabut.licenses,'Belum ada lisensi yang dicabut.')}`;
}

/* ------------------------------------------------------------------------ Lisensi

   Setiap status punya halamannya sendiri sehingga satu lisensi tidak pernah muncul di dua
   kategori. Identitas pemiliknya — nama pembeli, nama sekolah, dan NPSN — selalu ikut
   ditampilkan supaya kunci yang sudah terbit dapat ditelusuri milik siapa. */

async function gambarLisensi(host,{status='',type='',judul='Lisensi',sub='',buat=false,buatDeveloper=false}={}){
  const {customers}=buat?await api('/owner/customers'):{customers:[]};
  const formBuat=buat?`<section class="card">
      <h2>Buat License Key Pembeli</h2>
      <p class="sub">Kunci ditampilkan utuh satu kali saja di sini. Simpan sebelum menutup halaman.
        Nama pembeli, nama sekolah, dan NPSN wajib diisi.</p>
      <form class="row" data-buat style="margin-top:12px">
        <div><label>Nama Pembeli *</label><input name="buyerName" placeholder="Budi Santoso" required/></div>
        <div><label>Nama Sekolah *</label><input name="schoolName" placeholder="SDN Maju Jaya 01" required/></div>
        <div><label>NPSN *</label><input name="npsn" placeholder="12345678" required/></div>
        <div><label>Jumlah</label><input name="count" type="number" min="1" max="500" value="1" required/></div>
        <div><label>Pembeli terdaftar (opsional)</label><select name="customerId"><option value="">—</option>
          ${customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>
        <div><button class="btn" type="submit">Generate</button></div>
      </form>
      <div data-hasil></div>
    </section>`:'';
  const formDeveloper=buatDeveloper?`<section class="card">
      <h2>Buat Lisensi Developer</h2>
      <p class="sub">Lisensi resmi milik pemilik aplikasi. Tidak melalui /beli dan tidak dihitung
        sebagai penjualan, tetapi tetap wajib diaktivasi di perangkat seperti lisensi pembeli.</p>
      <form class="row" data-buat-dev style="margin-top:12px">
        <div><label>Nama Pemilik</label><input name="buyerName" value="FAHMI DJAWAS, S.Pd." required/></div>
        <div><label>Keterangan</label><input name="notes" value="Development / QA / Demo"/></div>
        <div><button class="btn" type="submit">Buat Lisensi Developer</button></div>
      </form>
      <div data-hasil-dev></div>
    </section>`:'';

  host.innerHTML=`${formBuat}${formDeveloper}
    <section class="card">
      <h2>${esc(judul)}</h2>
      ${sub?`<p class="sub">${esc(sub)}</p>`:''}
      <form class="row" data-cari style="margin-top:12px">
        <div><label>Cari</label><input name="q" placeholder="nama pembeli, sekolah, NPSN, hint kunci"/></div>
        <div><button class="btn ghost" type="submit">Cari</button></div>
      </form>
      <div class="scroll" data-tabel style="margin-top:12px"></div>
    </section>`;

  if(buat)host.querySelector('[data-buat]').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,tombol=form.querySelector('button');
    tombol.disabled=true;
    try{
      const hasil=await api('/owner/licenses',{method:'POST',body:{
        count:Number(form.count.value),buyerName:form.buyerName.value,schoolName:form.schoolName.value,
        npsn:form.npsn.value,customerId:form.customerId.value||null}});
      host.querySelector('[data-hasil]').innerHTML=`<div class="msg ok">${hasil.created} License Key dibuat untuk ${esc(form.schoolName.value)}.</div>
        <div class="keylist">${hasil.licenses.map(l=>esc(l.key)).join('\n')}</div>
        <p class="warn">Salin sekarang. Setelah halaman ditutup, kunci utuh hanya dapat diambil lewat tombol Lihat Key.</p>`;
      form.reset();
      await muatTabel(host,{status,type});
    }catch(error){host.querySelector('[data-hasil]').innerHTML=`<div class="msg err">${esc(error.message)}</div>`;}
    tombol.disabled=false;
  };

  if(buatDeveloper)host.querySelector('[data-buat-dev]').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,tombol=form.querySelector('button');
    tombol.disabled=true;
    try{
      const hasil=await api('/owner/licenses',{method:'POST',body:{
        count:1,licenseType:'DEVELOPER',buyerName:form.buyerName.value,notes:form.notes.value}});
      host.querySelector('[data-hasil-dev]').innerHTML=`<div class="msg ok">Lisensi Developer dibuat.</div>
        <div class="keylist">${hasil.licenses.map(l=>esc(l.key)).join('\n')}</div>
        <p class="warn">Salin sekarang, lalu masukkan pada halaman Aktivasi aplikasi seperti lisensi biasa.</p>`;
      await muatTabel(host,{status,type});
    }catch(error){host.querySelector('[data-hasil-dev]').innerHTML=`<div class="msg err">${esc(error.message)}</div>`;}
    tombol.disabled=false;
  };

  host.querySelector('[data-cari]').onsubmit=event=>{event.preventDefault();muatTabel(host,{status,type});};
  await muatTabel(host,{status,type});
}

function barisIdentitas(l){
  /* Lisensi Developer tidak dijual, jadi tidak punya pembeli maupun NPSN. Menampilkan tiga
     tanda strip untuk lisensi itu terbaca seperti data yang hilang, padahal memang tidak ada. */
  if(String(l.license_type||'CUSTOMER').toUpperCase()==='DEVELOPER')
    return `<td>
      <strong>${esc(l.buyer_name||'Lisensi Developer')}</strong>
      <br/><small style="color:var(--muted)">${esc(l.notes||'Milik pemilik aplikasi — bukan penjualan.')}</small>
    </td>`;
  return `<td>
      <strong>${esc(l.buyer_name||'—')}</strong>
      <br/><small>${esc(l.school_name||'—')}</small>
      <br/><small style="color:var(--muted)">NPSN ${esc(l.npsn||'—')}</small>
      ${l.customer_name?`<br/><small style="color:var(--muted)">${esc(l.customer_name)}</small>`:''}
    </td>`;
}

async function muatTabel(host,{status='',type=''}={}){
  const form=host.querySelector('[data-cari]');
  const {licenses}=await api(`/owner/licenses?q=${encodeURIComponent(form.q.value)}`
    +`&status=${encodeURIComponent(status)}&type=${encodeURIComponent(type)}`);
  const dicabut=status==='REVOKED';
  host.querySelector('[data-tabel]').innerHTML=licenses.length?`<table><thead><tr>
      <th>Pemilik Lisensi</th><th>Kunci (tersamar)</th><th>Status</th>
      <th>Perangkat Aktif</th><th>${dicabut?'Dibuat / Dicabut':'Dibuat / Aktivasi'}</th><th>Aksi</th>
    </tr></thead><tbody>${licenses.map(l=>`<tr>
      ${barisIdentitas(l)}
      <td><code>${esc(l.license_hint)}</code>
        ${l.license_type==='DEVELOPER'?'<br/><span class="pill ACTIVE">DEVELOPER</span>':''}
        <br/><small style="color:var(--muted)">${esc(l.id)}</small></td>
      <td><span class="pill ${esc(l.status)}">${esc(l.status)}</span></td>
      <td>${l.active_installation?`<code>${esc(l.active_installation)}</code>
          <br/><small style="color:var(--muted)">${esc(l.active_platform||'—')}</small>
          <br/><small style="color:var(--muted)">terlihat ${waktu(l.active_last_seen)}</small>`:'—'}</td>
      <td><small>${waktu(l.created_at)}</small>
        <br/><small style="color:var(--muted)">${dicabut?waktu(l.revoked_at):waktu(l.activated_at)}</small>
        ${dicabut&&l.revoke_reason?`<br/><small style="color:var(--muted)">${esc(l.revoke_reason)}</small>`:''}</td>
      <td><div class="actions">
        ${l.active_installation?`<button class="btn ghost" data-aksi="reset-device" data-id="${esc(l.id)}">Reset Device</button>`:''}
        ${l.status==='SUSPENDED'
          ?`<button class="btn ghost" data-aksi="reactivate" data-id="${esc(l.id)}">Aktifkan</button>`
          :l.status!=='REVOKED'?`<button class="btn ghost" data-aksi="suspend" data-id="${esc(l.id)}">Tangguhkan</button>`:''}
        ${l.status==='REVOKED'?`<button class="btn ghost" data-aksi="reactivate" data-id="${esc(l.id)}">Pulihkan</button>`:''}
        ${l.status!=='REVOKED'?`<button class="btn danger" data-aksi="revoke" data-id="${esc(l.id)}">Cabut</button>`:''}
        <button class="btn ghost" data-aksi="recover" data-id="${esc(l.id)}">Lihat Key</button>
      </div></td></tr>`).join('')}</tbody></table>`
    :'<p class="sub">Belum ada lisensi pada kategori ini.</p>';

  host.querySelectorAll('[data-aksi]').forEach(btn=>btn.onclick=async()=>{
    const aksi=btn.dataset.aksi;
    const konfirmasi={'reset-device':'Lepaskan perangkat aktif dari lisensi ini? Identitas pembeli, sekolah, dan riwayatnya tetap tersimpan.',
      suspend:'Tangguhkan lisensi ini? Data akademik sekolah tidak dihapus.',
      revoke:'Cabut lisensi ini? Catatannya tetap tersimpan dan masih dapat dipulihkan.',
      reactivate:'Pulihkan lisensi ini sehingga dapat dipakai lagi?',
      recover:'Tampilkan License Key utuh? Tindakan ini tercatat di Riwayat.'}[aksi];
    if(!window.confirm(konfirmasi))return;
    const alasan=aksi==='recover'?'':(window.prompt('Alasan (masuk audit log):','')||'');
    btn.disabled=true;
    try{
      const hasil=await api(`/owner/licenses/${btn.dataset.id}/${aksi}`,{method:'POST',body:{reason:alasan}});
      if(aksi==='recover'){
        const kunci=hasil.recovery.license_key;
        try{await navigator.clipboard.writeText(kunci);lapor('License Key disalin ke papan klip dan tercatat di audit log.','ok');}
        catch{window.alert(`License Key:\n\n${kunci}\n\nTindakan ini sudah tercatat di Riwayat.`);lapor('License Key ditampilkan dan tercatat di audit log.','ok');}
      }else lapor('Tindakan berhasil dijalankan.','ok');
    }catch(error){btn.disabled=false;lapor(error.message,'err');}
  });
}

/* ------------------------------------------------------------- Sekolah dan riwayat */

async function gambarPelanggan(host){
  const {customers}=await api('/owner/customers');
  host.innerHTML=`<section class="card"><h2>Tambah Sekolah / Pembeli</h2>
      <form class="row" data-tambah style="margin-top:12px">
        <div><label>Nama Sekolah / Pembeli</label><input name="name" required/></div>
        <div><label>NPSN</label><input name="npsn"/></div>
        <div><label>Kontak</label><input name="contact" placeholder="WhatsApp / email"/></div>
        <div><button class="btn" type="submit">Simpan</button></div>
      </form></section>
    <section class="card"><h2>Daftar Sekolah / Pembeli</h2><div class="scroll">
      ${customers.length?`<table><thead><tr><th>Nama</th><th>NPSN</th><th>Kontak</th><th>Jumlah Lisensi</th><th>Dibuat</th></tr></thead>
        <tbody>${customers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.npsn||'—')}</td><td>${esc(c.contact||'—')}</td>
          <td>${c.license_count}</td><td>${waktu(c.created_at)}</td></tr>`).join('')}</tbody></table>`
        :'<p class="sub">Belum ada data pembeli.</p>'}</div></section>`;
  host.querySelector('[data-tambah]').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget;
    try{
      await api('/owner/customers',{method:'POST',body:{name:form.name.value,npsn:form.npsn.value,contact:form.contact.value}});
      lapor('Data pembeli tersimpan.','ok');
    }catch(error){lapor(error.message,'err');}
  };
}

/* --------------------------------------------------------------- Versi aplikasi (Tahap 9)

   Katalog rilis resmi. Hanya Pemilik yang dapat membukanya: seluruh endpoint di bawah menuntut
   sesi Pemilik, dan server memvalidasi ulang setiap masukan. Panel ini tidak pernah mengunggah
   berkas rilis; yang disimpan hanyalah metadata beserta alamat unduhan resmi. */

async function gambarVersi(host){
  host.innerHTML=`<section class="card">
      <h2>Tambah Versi Aplikasi</h2>
      <p class="sub">Alamat unduhan wajib https dan berada pada host rilis resmi. Versi baru tersimpan
        sebagai draf; sekolah hanya menerima versi yang sudah Diterbitkan.</p>
      <form class="row" data-tambah style="margin-top:12px">
        <div><label>Platform</label><select name="platform" required>
          <option value="android">android</option><option value="windows">windows</option></select></div>
        <div><label>Versi</label><input name="version" placeholder="1.2.2" required/></div>
        <div><label>Version Code</label><input name="versionCode" type="number" min="0" placeholder="14"/></div>
        <div><label>Minimum Didukung</label><input name="minSupportedVersion" placeholder="1.2.0"/></div>
        <div><label>Tanggal Rilis</label><input name="releasedAt" type="date"/></div>
        <div style="flex:1 1 100%"><label>Alamat Unduhan Resmi</label>
          <input name="downloadUrl" placeholder="https://github.com/.../e-rapor-1.2.2.apk"/></div>
        <div style="flex:1 1 100%"><label>Catatan Rilis</label>
          <textarea name="notes" rows="3" placeholder="Ringkasan perubahan yang dibaca sekolah."></textarea></div>
        <div><button class="btn" type="submit">Simpan Versi</button></div>
      </form>
      <div data-hasil></div>
    </section>
    <section class="card"><h2>Daftar Versi</h2><div class="scroll" data-tabel style="margin-top:12px"></div></section>`;

  host.querySelector('[data-tambah]').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,tombol=form.querySelector('button');
    tombol.disabled=true;
    try{
      await api('/owner/app-versions',{method:'POST',body:{
        platform:form.platform.value,version:form.version.value,versionCode:form.versionCode.value,
        minSupportedVersion:form.minSupportedVersion.value,releasedAt:form.releasedAt.value,
        downloadUrl:form.downloadUrl.value,notes:form.notes.value}});
      host.querySelector('[data-hasil]').innerHTML='<div class="msg ok">Versi tersimpan sebagai draf. Tekan Terbitkan agar sekolah menerimanya.</div>';
      form.reset();
      await muatVersi(host);
    }catch(error){host.querySelector('[data-hasil]').innerHTML=`<div class="msg err">${esc(error.message)}</div>`;}
    tombol.disabled=false;
  };
  await muatVersi(host);
}

async function muatVersi(host){
  const {versions}=await api('/owner/app-versions');
  host.querySelector('[data-tabel]').innerHTML=versions.length?`<table><thead><tr>
      <th>Platform</th><th>Versi</th><th>Minimum Didukung</th><th>Rilis</th><th>Unduhan</th><th>Status</th><th>Aksi</th>
    </tr></thead><tbody>${versions.map(v=>`<tr>
      <td><code>${esc(v.platform)}</code></td>
      <td><b>${esc(v.version)}</b>${v.versionCode!==null?`<br/><small style="color:var(--muted)">code ${esc(v.versionCode)}</small>`:''}</td>
      <td>${esc(v.minSupportedVersion||'—')}</td>
      <td>${waktu(v.releasedAt)}</td>
      <td>${v.downloadUrl?`<a href="${esc(v.downloadUrl)}" target="_blank" rel="noopener noreferrer">berkas rilis</a>`:'<span style="color:var(--muted)">belum diisi</span>'}</td>
      <td><span class="pill ${v.published?'ACTIVE':'UNUSED'}">${v.published?'Diterbitkan':'Draf'}</span></td>
      <td><div class="actions">
        <button class="btn ghost" data-versi="${v.published?'unpublish':'publish'}" data-id="${esc(v.id)}">${v.published?'Tarik':'Terbitkan'}</button>
        <button class="btn danger" data-versi="delete" data-id="${esc(v.id)}">Hapus</button>
      </div></td></tr>`).join('')}</tbody></table>`
    :'<p class="sub">Belum ada versi yang terdaftar.</p>';

  host.querySelectorAll('[data-versi]').forEach(btn=>btn.onclick=async()=>{
    const aksi=btn.dataset.versi;
    const konfirmasi={publish:'Terbitkan versi ini ke seluruh sekolah?',
      unpublish:'Tarik versi ini sehingga sekolah tidak lagi menerimanya?',
      delete:'Hapus catatan versi ini secara permanen?'}[aksi];
    if(!window.confirm(konfirmasi))return;
    btn.disabled=true;
    try{
      await api(`/owner/app-versions/${btn.dataset.id}/${aksi}`,{method:'POST'});
      lapor('Katalog versi diperbarui.','ok');
    }catch(error){btn.disabled=false;lapor(error.message,'err');}
  });
}

async function gambarRiwayat(host){
  const {events}=await api('/owner/events');
  host.innerHTML=`<section class="card"><h2>Riwayat / Audit Log</h2>
    <p class="sub">Seluruh tindakan penting tercatat: pembuatan lisensi, aktivasi, penolakan, reset, tangguh, cabut, dan pemulihan kunci.</p>
    <div class="scroll" style="margin-top:12px">${events.length?`<table><thead><tr><th>Waktu</th><th>Jenis</th><th>Aktor</th><th>Lisensi</th><th>Detail</th></tr></thead>
      <tbody>${events.map(e=>`<tr><td>${waktu(e.created_at)}</td><td><code>${esc(e.type)}</code></td><td>${esc(e.actor)}</td>
        <td><small>${esc(e.license_id||'—')}</small></td><td><small>${esc(e.detail||'')}</small></td></tr>`).join('')}</tbody></table>`
      :'<p class="sub">Belum ada riwayat.</p>'}</div></section>`;
}

render();
