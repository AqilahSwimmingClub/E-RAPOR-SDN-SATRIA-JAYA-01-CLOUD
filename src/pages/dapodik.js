import { normalizeDapodikDataset } from '../services/dapodik-adapter.js';
import { clearDapodikConfig, dapodikPlatform, getDapodikPublicConfig, pullDapodikData, saveDapodikConfig, testDapodikConnection } from '../services/dapodik-bridge.js';
import { applyDapodikPreview, buildDapodikPreview, listDapodikSyncLogs } from '../services/dapodik-sync.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Halaman Dapodik milik Admin. Tiga mode mengikuti tiga entri sidebar.
   Di Web/PWA dan Android bridge tidak tersedia, sehingga halaman hanya menampilkan arahan
   memakai aplikasi Windows dan tidak pernah mencoba permintaan jaringan Dapodik. */

const DAPODIK_MODES=Object.freeze({
  service:{title:'Web Service Dapodik',lead:'Alamat, token, NPSN, dan semester Dapodik pada komputer ini.'},
  pull:{title:'Ambil Data Dapodik',lead:'Tarik data Dapodik menjadi pratinjau sebelum apa pun berubah.'},
  push:{title:'Kirim Nilai ke Dapodik',lead:'Status pengiriman Nilai Rapor ke Dapodik.'}
});

const ACTION_GROUPS=[
  ['create','Siswa Baru','Akan ditambahkan ke Data Siswa.'],
  ['update','Perubahan Data','Data lokal akan disesuaikan dengan Dapodik.'],
  ['archive','Dinonaktifkan','Tidak ada di Dapodik. Record tetap disimpan, hanya dinonaktifkan.'],
  ['conflict','Perlu Diperiksa','Tidak diterapkan otomatis. Rapikan data lokal terlebih dahulu.'],
  ['unchanged','Tanpa Perubahan','Sudah sama dengan Dapodik.']
];

function windowsRequiredCard(reason){
  return el(`<div><div class="page-head"><div><h1>Dapodik</h1><p>Sinkronisasi Dapodik tersedia pada aplikasi Windows e-Rapor.</p></div></div><section class="card empty-state dapodik-fallback"><div class="placeholder-icon">${icon('database',26)}</div><h3>Buka melalui aplikasi Windows</h3><p>${escapeHtml(reason)}</p><p class="muted">Dapodik berjalan sebagai layanan lokal di komputer sekolah, sehingga hanya aplikasi Windows e-Rapor yang dapat menghubunginya. Data yang sudah tersimpan di perangkat ini tetap aman dan tidak berubah.</p></section></div>`);
}

export function renderDapodik(session,mode='service'){
  if(session?.role!=='admin')throw new Error('Hanya Admin yang dapat membuka Dapodik.');
  const platform=dapodikPlatform();
  if(!platform.available)return windowsRequiredCard(platform.reason);
  const bagian=Object.hasOwn(DAPODIK_MODES,mode)?mode:'service';
  const info=DAPODIK_MODES[bagian];
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(info.title)}</h1><p>${escapeHtml(info.lead)}</p></div><div class="actions" data-actions></div></div><div data-view><section class="card empty-state"><h3>Memuat konfigurasi Dapodik...</h3></section></div></div>`);
  const view=root.querySelector('[data-view]'),actions=root.querySelector('[data-actions]');

  /* Ambil dan Kirim tetap terkunci sampai tes koneksi terakhir cocok NPSN dan semesternya. */
  let connectionMatches=false;
  let config=null;
  let preview=null;
  let accepted=new Set();

  function lockedNotice(){
    return `<section class="card empty-state dapodik-locked"><div class="placeholder-icon">${icon('shield',26)}</div><h3>Jalankan Tes Koneksi terlebih dahulu</h3><p>Buka Web Service Dapodik, isi alamat dan token, lalu tekan Tes Koneksi. NPSN dan semester harus cocok sebelum Ambil Data atau Kirim Nilai dapat dijalankan.</p></section>`;
  }

  async function muatConfig(){
    try{config=await getDapodikPublicConfig();}
    catch(error){config=null;toast(error.message,'error');}
    return config;
  }

  function drawService(){
    const isi=config||{baseUrl:'',npsn:'',semesterId:'',tokenConfigured:false};
    actions.innerHTML='';
    view.innerHTML=`<form class="card dapodik-form" data-config><div class="section-head"><div><h3>Profil Koneksi Dapodik</h3><p>Token disimpan terenkripsi pada aplikasi Windows dan tidak pernah dikirim kembali ke halaman ini.</p></div><span class="badge ${isi.tokenConfigured?'badge-active':'badge-inactive'}">${isi.tokenConfigured?'Token tersimpan':'Token belum diisi'}</span></div><div class="form-grid"><div class="field form-span-2"><label>Alamat Web Service Dapodik</label><input class="input" name="baseUrl" value="${escapeHtml(isi.baseUrl||'')}" placeholder="http://localhost:5774" required/></div><div class="field"><label>NPSN</label><input class="input" name="npsn" value="${escapeHtml(isi.npsn||'')}" required/></div><div class="field"><label>Semester Dapodik</label><input class="input" name="semesterId" value="${escapeHtml(isi.semesterId||'')}" placeholder="20262" required/></div><div class="field form-span-2"><label>Token Dapodik</label><input class="input" type="password" name="token" placeholder="${isi.tokenConfigured?'Terisi. Ketik ulang hanya bila ingin mengganti.':'Tempel token Dapodik'}" autocomplete="off"/></div></div><div class="dapodik-result" data-result></div><div class="actions"><button class="btn btn-light" type="button" data-reset>Reset Form Data</button><button class="btn btn-light" type="button" data-test>${icon('shuffle',16)} Tes Koneksi</button><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Konfigurasi</button></div></form>`;
    const form=view.querySelector('[data-config]'),hasil=view.querySelector('[data-result]');
    form.onsubmit=async event=>{
      event.preventDefault();const fields=event.currentTarget.elements;
      const input={baseUrl:fields.baseUrl.value,npsn:fields.npsn.value,semesterId:fields.semesterId.value,token:fields.token.value};
      if(!input.token&&isi.tokenConfigured)delete input.token;
      try{config=await saveDapodikConfig(input);connectionMatches=false;drawService();toast('Konfigurasi Dapodik tersimpan.');}
      catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-test]').onclick=async()=>{
      hasil.innerHTML='<div class="source-banner">Menguji koneksi ke Dapodik...</div>';
      try{
        const uji=await testDapodikConnection();
        connectionMatches=uji.matches===true;
        hasil.innerHTML=connectionMatches
          ?`<div class="source-banner">Terhubung ke ${escapeHtml(uji.school?.name||'sekolah Dapodik')} · NPSN ${escapeHtml(uji.school?.npsn||'')} · semester cocok. Ambil Data dan Kirim Nilai kini aktif.</div>`
          :`<div class="source-banner warning-banner">Terhubung, tetapi NPSN atau semester berbeda dari pengaturan (NPSN ${escapeHtml(uji.school?.npsn||'kosong')}, semester ${escapeHtml(uji.school?.semesterId||'kosong')}). Perbaiki dahulu sebelum menarik atau mengirim data.</div>`;
      }catch(error){connectionMatches=false;hasil.innerHTML=`<div class="source-banner warning-banner">${escapeHtml(error.message)}</div>`;}
    };
    view.querySelector('[data-reset]').onclick=async()=>{
      if(!await confirmDialog({title:'Reset Form Data',message:'Hapus alamat, NPSN, semester, dan token Dapodik dari komputer ini? Data siswa dan nilai tidak terpengaruh.',confirmText:'Reset',danger:true}))return;
      try{config=await clearDapodikConfig();connectionMatches=false;drawService();toast('Konfigurasi Dapodik dihapus.','warning');}
      catch(error){toast(error.message,'error');}
    };
  }

  function previewGroups(){
    return ACTION_GROUPS.map(([action,judul,keterangan])=>{
      const rows=preview.students.filter(item=>item.action===action);
      if(!rows.length)return '';
      const dapatDipilih=action!=='unchanged';
      return `<section class="card dapodik-group"><div class="section-head"><div><h3>${escapeHtml(judul)}</h3><p>${escapeHtml(keterangan)}</p></div><span class="badge ${action==='conflict'?'badge-inactive':'badge-a'}">${rows.length} siswa</span></div><div class="table-scroll"><table class="data-table"><thead><tr>${dapatDipilih?'<th>Terapkan</th>':''}<th>Nama</th><th>NISN</th><th>Rombel</th><th>Catatan</th></tr></thead><tbody>${rows.map(item=>`<tr>${dapatDipilih?`<td><input type="checkbox" data-action-id="${escapeHtml(item.id)}" ${accepted.has(item.id)?'checked':''}/></td>`:''}<td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.nisn||'—')}</td><td>${escapeHtml(item.classId||'—')}</td><td>${escapeHtml(item.reason||'—')}</td></tr>`).join('')}</tbody></table></div></section>`;
    }).join('');
  }

  function drawPull(){
    actions.innerHTML=`<button class="btn btn-primary" data-pull ${connectionMatches?'':'disabled'}>${icon('download',16)} Ambil Data Dapodik</button>`;
    view.innerHTML=connectionMatches
      ?(preview?`<section class="card dapodik-summary"><div class="section-head"><div><h3>Pratinjau Perubahan</h3><p>Tidak ada data yang berubah sampai Anda menekan Terapkan Data.</p></div><span class="badge badge-a">${preview.students.length} baris</span></div><div class="assessment-summary">${ACTION_GROUPS.map(([action,judul])=>`<article class="stat-card"><div class="stat-label">${escapeHtml(judul)}</div><div class="stat-value">${preview.counts[action]}</div></article>`).join('')}</div><div class="actions"><button class="btn btn-primary" data-apply>${icon('save',16)} Terapkan Data</button></div></section>${previewGroups()}`
        :'<section class="card empty-state"><h3>Belum ada pratinjau</h3><p>Tekan Ambil Data Dapodik untuk menarik data terbaru menjadi pratinjau.</p></section>')
      :lockedNotice();
    const tarik=actions.querySelector('[data-pull]');
    if(tarik)tarik.onclick=async()=>{
      view.innerHTML='<section class="card empty-state"><h3>Mengambil data dari Dapodik...</h3></section>';
      try{
        const mentah=await pullDapodikData();
        const dataset=normalizeDapodikDataset(mentah);
        preview=buildDapodikPreview(session,dataset,{npsn:config?.npsn,semesterId:config?.semesterId});
        /* Konflik sengaja tidak dicentang otomatis: Admin harus memutuskannya sendiri. */
        accepted=new Set(preview.students.filter(item=>item.action!=='conflict'&&item.action!=='unchanged').map(item=>item.id));
        drawPull();
        toast(`Pratinjau siap: ${preview.counts.create} baru, ${preview.counts.update} berubah, ${preview.counts.conflict} perlu diperiksa.`);
      }catch(error){preview=null;drawPull();toast(error.message,'error');}
    };
    view.querySelectorAll('[data-action-id]').forEach(box=>box.onchange=()=>{
      if(box.checked)accepted.add(box.dataset.actionId);else accepted.delete(box.dataset.actionId);
    });
    const terapkan=view.querySelector('[data-apply]');
    if(terapkan)terapkan.onclick=async()=>{
      const dipilih=[...accepted];
      if(!dipilih.length){toast('Belum ada baris yang dipilih untuk diterapkan.','error');return;}
      if(!await confirmDialog({title:'Terapkan Data Dapodik',message:`Terapkan ${dipilih.length} perubahan ke Data Siswa? Snapshot pemulihan dibuat otomatis dan siswa manual tidak akan terhapus.`,confirmText:'Terapkan'}))return;
      try{
        const hasil=applyDapodikPreview(session,preview,{acceptedActionIds:dipilih});
        preview=null;accepted=new Set();drawPull();
        toast(`Diterapkan: ${hasil.created.students} baru, ${hasil.updated.students} diperbarui, ${hasil.archived.students} dinonaktifkan.`);
      }catch(error){toast(error.message,'error');}
    };
  }

  function drawPush(){
    actions.innerHTML='';
    const logs=listDapodikSyncLogs(session).filter(item=>item.operation==='push').slice(-10).reverse();
    view.innerHTML=connectionMatches
      ?`<section class="card dapodik-summary"><div class="section-head"><div><h3>Kirim Nilai ke Dapodik</h3><p>Antrean pengiriman Nilai Rapor beserta riwayat percobaannya.</p></div></div>${logs.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Waktu</th><th>Status</th><th>Terkirim</th><th>Gagal</th></tr></thead><tbody>${logs.map(item=>`<tr><td>${escapeHtml(String(item.finishedAt||'').replace('T',' ').slice(0,19))}</td><td>${escapeHtml(item.status)}</td><td>${item.counts?.sent?.scores??0}</td><td>${item.counts?.failed?.scores??0}</td></tr>`).join('')}</tbody></table></div>`:'<section class="card empty-state"><h3>Belum ada pengiriman</h3><p>Riwayat pengiriman Nilai Rapor akan tampil di sini.</p></section>'}</section>`
      :lockedNotice();
  }

  muatConfig().then(()=>{
    if(bagian==='service')drawService();
    else if(bagian==='pull')drawPull();
    else drawPush();
  });
  return root;
}
