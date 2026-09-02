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
    <div class="tabs">${[['dashboard','Dashboard'],['licenses','Lisensi'],['customers','Sekolah/Pembeli'],['events','Riwayat']]
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
    else if(tab==='licenses')await gambarLisensi(isi);
    else if(tab==='customers')await gambarPelanggan(isi);
    else await gambarRiwayat(isi);
  }catch(error){isi.innerHTML=`<div class="msg err">${esc(error.message)}</div>`;}
}

/* ---------------------------------------------------------------------- Dashboard */

async function gambarDashboard(host){
  const s=await api('/owner/summary');
  host.innerHTML=`<div class="stats">
    ${[['Total Lisensi',s.total],['Aktif',s.ACTIVE],['Belum Digunakan',s.UNUSED],
       ['Ditangguhkan',s.SUSPENDED],['Dicabut',s.REVOKED],['Perangkat Aktif',s.devices]]
      .map(([label,nilai])=>`<div class="stat"><span>${label}</span><b>${nilai}</b></div>`).join('')}
  </div>`;
}

/* ------------------------------------------------------------------------ Lisensi */

async function gambarLisensi(host){
  const {customers}=await api('/owner/customers');
  host.innerHTML=`<section class="card">
      <h2>Buat License Key</h2>
      <p class="sub">Kunci ditampilkan utuh satu kali saja di sini. Simpan sebelum menutup halaman.</p>
      <form class="row" data-buat style="margin-top:12px">
        <div><label>Jumlah</label><input name="count" type="number" min="1" max="500" value="1" required/></div>
        <div><label>Nama Sekolah (opsional)</label><input name="schoolName" placeholder="SDN Contoh Nusantara 02"/></div>
        <div><label>NPSN (opsional)</label><input name="npsn"/></div>
        <div><label>Pembeli (opsional)</label><select name="customerId"><option value="">—</option>
          ${customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>
        <div><button class="btn" type="submit">Generate</button></div>
      </form>
      <div data-hasil></div>
    </section>
    <section class="card">
      <h2>Daftar Lisensi</h2>
      <form class="row" data-cari>
        <div><label>Cari</label><input name="q" placeholder="nama sekolah, NPSN, hint kunci, pembeli"/></div>
        <div><label>Status</label><select name="status"><option value="">Semua</option>
          ${['UNUSED','ACTIVE','SUSPENDED','REVOKED'].map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div><button class="btn ghost" type="submit">Cari</button></div>
      </form>
      <div class="scroll" data-tabel style="margin-top:12px"></div>
    </section>`;

  host.querySelector('[data-buat]').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,tombol=form.querySelector('button');
    tombol.disabled=true;
    try{
      const hasil=await api('/owner/licenses',{method:'POST',body:{
        count:Number(form.count.value),schoolName:form.schoolName.value,npsn:form.npsn.value,
        customerId:form.customerId.value||null}});
      host.querySelector('[data-hasil]').innerHTML=`<div class="msg ok">${hasil.created} License Key dibuat.</div>
        <div class="keylist">${hasil.licenses.map(l=>esc(l.key)).join('\n')}</div>
        <p class="warn">Salin sekarang. Setelah halaman ditutup, kunci utuh hanya dapat diambil lewat tombol Recovery.</p>`;
      await muatTabel(host);
    }catch(error){host.querySelector('[data-hasil]').innerHTML=`<div class="msg err">${esc(error.message)}</div>`;}
    tombol.disabled=false;
  };
  host.querySelector('[data-cari]').onsubmit=event=>{event.preventDefault();muatTabel(host);};
  await muatTabel(host);
}

async function muatTabel(host){
  const form=host.querySelector('[data-cari]');
  const {licenses}=await api(`/owner/licenses?q=${encodeURIComponent(form.q.value)}&status=${encodeURIComponent(form.status.value)}`);
  host.querySelector('[data-tabel]').innerHTML=licenses.length?`<table><thead><tr>
      <th>Kunci (tersamar)</th><th>Status</th><th>Sekolah / Pembeli</th><th>Perangkat aktif</th><th>Terakhir terlihat</th><th>Aksi</th>
    </tr></thead><tbody>${licenses.map(l=>`<tr>
      <td><code>${esc(l.license_hint)}</code><br/><small style="color:var(--muted)">${esc(l.id)}</small></td>
      <td><span class="pill ${esc(l.status)}">${esc(l.status)}</span></td>
      <td>${esc(l.school_name||'—')}${l.npsn?`<br/><small style="color:var(--muted)">NPSN ${esc(l.npsn)}</small>`:''}
          ${l.customer_name?`<br/><small style="color:var(--muted)">${esc(l.customer_name)}</small>`:''}</td>
      <td>${l.active_installation?`<code>${esc(l.active_installation)}</code><br/><small style="color:var(--muted)">${esc(l.active_platform||'—')}</small>`:'—'}</td>
      <td>${waktu(l.active_last_seen)}</td>
      <td><div class="actions">
        ${l.active_installation?`<button class="btn ghost" data-aksi="reset-device" data-id="${esc(l.id)}">Reset Device</button>`:''}
        ${l.status==='SUSPENDED'
          ?`<button class="btn ghost" data-aksi="reactivate" data-id="${esc(l.id)}">Aktifkan</button>`
          :l.status!=='REVOKED'?`<button class="btn ghost" data-aksi="suspend" data-id="${esc(l.id)}">Tangguhkan</button>`:''}
        ${l.status!=='REVOKED'?`<button class="btn danger" data-aksi="revoke" data-id="${esc(l.id)}">Cabut</button>`:''}
        <button class="btn ghost" data-aksi="recover" data-id="${esc(l.id)}">Recovery Key</button>
      </div></td></tr>`).join('')}</tbody></table>`
    :'<p class="sub">Belum ada lisensi yang cocok.</p>';

  host.querySelectorAll('[data-aksi]').forEach(btn=>btn.onclick=async()=>{
    const aksi=btn.dataset.aksi;
    const konfirmasi={'reset-device':'Lepaskan perangkat aktif dari lisensi ini? Kunci akan dapat dipakai di perangkat lain.',
      suspend:'Tangguhkan lisensi ini?',revoke:'Cabut lisensi ini secara permanen?',reactivate:'Aktifkan kembali lisensi ini?',
      recover:'Tampilkan License Key utuh? Tindakan ini tercatat di Riwayat.'}[aksi];
    if(!window.confirm(konfirmasi))return;
    const alasan=window.prompt('Alasan (masuk audit log):','')||'';
    btn.disabled=true;
    try{
      const hasil=await api(`/owner/licenses/${btn.dataset.id}/${aksi}`,{method:'POST',body:{reason:alasan}});
      if(aksi==='recover'){
        window.alert(`License Key:\n\n${hasil.recovery.license_key}\n\nTindakan ini sudah tercatat di Riwayat.`);
        lapor('License Key dipulihkan dan tercatat di audit log.','ok');
      }else lapor('Tindakan berhasil dijalankan.','ok');
    }catch(error){lapor(error.message,'err');}
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
