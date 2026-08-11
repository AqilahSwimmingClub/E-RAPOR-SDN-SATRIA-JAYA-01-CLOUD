import { getSubjectMapping, saveSubjectMapping, resetSubjectMapping, loadDb } from '../services/storage.js';
import { backupFilename, buildBackup, parseBackupText, summarizeBackup, restoreBackup, validateBackupForSession } from '../services/backup.js';
import { changeOwnPassword } from '../services/auth.js';
import { getPrintSettings, savePrintSettings } from '../services/print-settings.js';
import { createRecoverySnapshot, listRecoverySnapshots, previewRecoverySnapshot, restoreRecoverySnapshot } from '../services/snapshots.js';
import { getApplicationInfo } from '../services/migrations.js';
import { canReorderWithinGroup, moveSubjectToGroup, normalizeMappingGroups, reorderWithinGroup } from '../services/mapping.js';
import { icon } from '../ui/icons.js';
import { el, toast, confirmDialog, escapeHtml } from '../ui/dom.js';
import { pickFile, saveFile } from '../services/file-io.js';

function aboutApplicationCard(){
  const info=getApplicationInfo();
  return el(`<section class="card" style="margin-top:16px"><h3>Tentang Aplikasi</h3><p class="muted" style="font-size:13px">Identitas versi instalasi dan format data lokal.</p><div class="preview-grid"><div class="preview-item"><span>Aplikasi</span><strong>${escapeHtml(info.name)}</strong></div><div class="preview-item"><span>Versi</span><strong>${escapeHtml(info.versionName)}</strong></div><div class="preview-item"><span>versionCode</span><strong>${info.versionCode}</strong></div><div class="preview-item"><span>schemaVersion</span><strong>${info.schemaVersion}</strong></div></div></section>`);
}

export function renderSubjectMapping(session){
  let mapping=normalizeMappingGroups(getSubjectMapping(session));
  const root=el(`<div><div class="page-head"><div><h1>Mapping Mata Pelajaran</h1><p>Atur urutan mapel untuk Penilaian, Rapor, Leger, dan Transkrip.</p></div><div class="actions"><button class="btn btn-light" data-reset>${icon('rotate',17)} Reset Default</button><button class="btn btn-primary" data-save>${icon('save',17)} Simpan Mapping</button></div></div><div data-list></div></div>`);
  const listHost=root.querySelector('[data-list]');

  function draw(){
    const groups=['A','B'];
    listHost.innerHTML=`<div class="mapping-groups">${groups.map(g=>{
      const items=mapping.filter(x=>x.group===g);
      const title=g==='A'?'A. Kelompok Mata Pelajaran Wajib':'B. Kelompok Mata Pelajaran Pilihan';
      return `<section class="card"><div class="mapping-header"><h3>${title}</h3><span class="badge badge-${g.toLowerCase()}">${items.filter(x=>x.active).length} aktif</span></div><div class="mapping-list">${items.map(item=>subjectRow(item)).join('')}</div></section>`;
    }).join('')}</div>`;
    bindRows();
  }
  function subjectRow(item){
    return `<div class="subject-row" data-id="${item.id}">
      <div class="order-actions"><button class="btn btn-light btn-icon" data-up title="Naik" ${canReorderWithinGroup(mapping,item.id,-1)?'':'disabled'}>${icon('arrowUp',15)}</button><button class="btn btn-light btn-icon" data-down title="Turun" ${canReorderWithinGroup(mapping,item.id,1)?'':'disabled'}>${icon('arrowDown',15)}</button></div>
      <div><div class="subject-name"><span class="muted" style="margin-right:7px">${item.order}.</span>${escapeHtml(item.name)}</div>${item.parent?`<div class="subject-parent">${escapeHtml(item.parent)}</div>`:''}</div>
      <select class="input mapping-group-select" data-group aria-label="Kelompok ${escapeHtml(item.name)}"><option value="A" ${item.group==='A'?'selected':''}>Kelompok A</option><option value="B" ${item.group==='B'?'selected':''}>Kelompok B</option></select>
      <label class="switch"><input type="checkbox" data-active ${item.active?'checked':''}/> Aktif</label>
    </div>`;
  }
  function bindRows(){
    listHost.querySelectorAll('[data-id]').forEach(row=>{
      const id=row.dataset.id;
      row.querySelector('[data-up]').onclick=()=>move(id,-1);
      row.querySelector('[data-down]').onclick=()=>move(id,1);
      row.querySelector('[data-active]').onchange=e=>{mapping=mapping.map(x=>x.id===id?{...x,active:e.target.checked}:x);draw()};
      row.querySelector('[data-group]').onchange=e=>{mapping=moveSubjectToGroup(mapping,id,e.target.value);draw();};
    });
  }
  function move(id,dir){
    mapping=reorderWithinGroup(mapping,id,dir);draw();
  }
  root.querySelector('[data-save]').onclick=()=>{saveSubjectMapping(session,mapping);toast('Mapping mata pelajaran berhasil disimpan.');};
  root.querySelector('[data-reset]').onclick=async()=>{
    if(await confirmDialog({title:'Reset Mapping',message:'Kembalikan seluruh urutan dan status mata pelajaran ke mapping default?',confirmText:'Reset'})){
      resetSubjectMapping(session);mapping=normalizeMappingGroups(getSubjectMapping(session));draw();toast('Mapping dikembalikan ke master mata pelajaran.','warning');
    }
  };
  draw();return root;
}

export function renderBackupRestore(session){
  let parsedPayload=null;
  const db=loadDb();
  const root=el(`<div><div class="page-head"><div><h1>Backup & Restore</h1><p>Cadangkan seluruh data lokal dan pulihkan dengan validasi sebelum menimpa data.</p></div></div>
    <div class="backup-layout">
      <section class="card"><h3>Download Backup</h3><p class="muted" style="font-size:12.5px;line-height:1.55">Backup mencakup data siswa, absensi, mapping mapel, bobot, KKTP, TP, nilai, deskripsi, ekskul, catatan wali kelas, kenaikan kelas, transkrip, semester, dan pengaturan.</p><div style="background:var(--soft);padding:12px;border-radius:10px;margin:14px 0;font-size:12px"><strong>Data diperbarui:</strong><br>${new Date(db.updatedAt).toLocaleString('id-ID')}</div><button class="btn btn-primary" data-download>${icon('download',17)} Download Backup</button></section>
      <section class="card"><h3>Input Restore</h3><div class="dropzone"><div style="color:var(--maroon);display:flex;justify-content:center;margin-bottom:8px">${icon('upload',28)}</div><strong>Pilih file .backup.json</strong><p class="muted" style="font-size:11.5px">File akan divalidasi dan ditampilkan preview sebelum restore.</p><input type="file" accept="application/json,.json" data-file /></div><div data-preview></div></section>
    </div>
    <section class="card recovery-section"><div class="section-head"><div><h3>Snapshot Pemulihan</h3><p>Snapshot lokal tersimpan sebelum restore dan dapat dibuat manual.</p></div><button class="btn btn-light" data-create-snapshot>${icon('save',16)} Buat Snapshot</button></div><div data-snapshots></div></section></div>`);
  root.querySelector('[data-download]').onclick=async()=>{try{await saveFile({name:backupFilename(session),mime:'application/json',data:JSON.stringify(buildBackup(session),null,2)});toast('File backup berhasil dibuat dan disimpan.');}catch(error){toast(error.message,'error');}};
  const input=root.querySelector('[data-file]'), preview=root.querySelector('[data-preview]');
  const fileButton=el(`<button class="btn btn-light" type="button">${icon('upload',16)} Pilih File Backup</button>`);input.replaceWith(fileButton);
  fileButton.onclick=async()=>{
    const file=await pickFile({accept:'.json,.backup.json,application/json'});if(!file)return;parsedPayload=null;preview.innerHTML='';
    try{
      parsedPayload=parseBackupText(file.text);validateBackupForSession(parsedPayload,session);const s=summarizeBackup(parsedPayload);
      preview.innerHTML=`<div class="backup-preview"><h3 style="margin-bottom:10px">Preview Backup</h3><div class="preview-grid"><div class="preview-item"><span>Kelas</span><strong>${escapeHtml(s.classId)}</strong></div><div class="preview-item"><span>Semester</span><strong>${escapeHtml(s.semester)}</strong></div><div class="preview-item"><span>Tahun Pelajaran</span><strong>${escapeHtml(s.academicYear)}</strong></div><div class="preview-item"><span>Mapping</span><strong>${s.mappings}</strong></div><div class="preview-item"><span>Data Siswa</span><strong>${s.students}</strong></div><div class="preview-item"><span>Nilai</span><strong>${s.scores}</strong></div></div><button class="btn btn-danger" data-restore style="width:100%;margin-top:12px">Restore Data Ini</button></div>`;
      preview.querySelector('[data-restore]').onclick=doRestore;
    }catch(ex){preview.innerHTML=`<div class="login-error" style="margin-top:12px">${escapeHtml(ex.message)}</div>`;toast(ex.message,'error');}
  };
  async function doRestore(){
    if(!parsedPayload)return;
    const ok=await confirmDialog({title:'Konfirmasi Restore',message:'Restore akan mengganti data lokal saat ini. Pastikan Anda sudah mengunduh backup terbaru sebelum melanjutkan.',confirmText:'Restore Sekarang',danger:true});
    if(!ok)return;
    createRecoverySnapshot(session,'Otomatis sebelum restore file');
    restoreBackup(parsedPayload,session);toast('Restore berhasil. Data lokal telah dipulihkan.');setTimeout(()=>location.reload(),800);
  }
  const snapshotsHost=root.querySelector('[data-snapshots]');
  function drawSnapshots(){
    const snapshots=listRecoverySnapshots(session);
    snapshotsHost.innerHTML=snapshots.length?`<div class="snapshot-list">${snapshots.map((item,index)=>`<article class="snapshot-item"><div><strong>${index===0?'Snapshot Terakhir':'Snapshot Pemulihan'}</strong><span>${new Date(item.createdAt).toLocaleString('id-ID')} · ${escapeHtml(item.reason)}</span></div><div class="actions"><button class="btn btn-light" data-snapshot-preview="${item.id}">Preview</button><button class="btn btn-light" data-snapshot-restore="${item.id}">Pulihkan</button></div></article>`).join('')}</div>`:'<div class="empty-inline">Belum ada snapshot pemulihan untuk scope akun ini.</div>';
    snapshotsHost.querySelectorAll('[data-snapshot-preview]').forEach(button=>button.onclick=()=>showSnapshotPreview(button.dataset.snapshotPreview));
    snapshotsHost.querySelectorAll('[data-snapshot-restore]').forEach(button=>button.onclick=()=>restoreSnapshot(button.dataset.snapshotRestore));
  }
  function showSnapshotPreview(snapshotId){
    try{const summary=previewRecoverySnapshot(session,snapshotId);const modal=el(`<div class="modal-backdrop"><div class="modal-card"><div class="modal-head"><div><h3>Preview Snapshot</h3><p>${escapeHtml(summary.reason)}</p></div><button class="btn btn-light btn-icon" data-close>${icon('x',17)}</button></div><div class="preview-grid"><div class="preview-item"><span>Dibuat</span><strong>${new Date(summary.createdAt).toLocaleString('id-ID')}</strong></div><div class="preview-item"><span>Kelas</span><strong>${escapeHtml(summary.classId)}</strong></div><div class="preview-item"><span>Semester</span><strong>${escapeHtml(summary.semester)}</strong></div><div class="preview-item"><span>Siswa</span><strong>${summary.students}</strong></div><div class="preview-item"><span>Nilai</span><strong>${summary.scores}</strong></div><div class="preview-item"><span>Mapping</span><strong>${summary.mappings}</strong></div></div><div class="modal-actions"><button class="btn btn-primary" data-ok>Tutup</button></div></div></div>`);document.body.append(modal);const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-ok]').onclick=close;}catch(error){toast(error.message,'error');}
  }
  async function restoreSnapshot(snapshotId){
    if(!await confirmDialog({title:'Pulihkan Snapshot',message:'Data saat ini akan diganti oleh snapshot terpilih. Snapshot pengaman baru dibuat lebih dahulu.',confirmText:'Pulihkan',danger:true}))return;
    try{restoreRecoverySnapshot(session,snapshotId);toast('Snapshot berhasil dipulihkan.');setTimeout(()=>location.reload(),800);}catch(error){toast(error.message,'error');}
  }
  root.querySelector('[data-create-snapshot]').onclick=()=>{createRecoverySnapshot(session,'Snapshot manual');drawSnapshots();toast('Snapshot pemulihan berhasil dibuat.');};
  drawSnapshots();
  root.append(aboutApplicationCard());
  return root;
}

export function renderAccountSettings(session){
  const root=el(`<div><div class="page-head"><div><h1>Pengaturan Akun</h1><p>Pengaturan keamanan akun ${session.role==='admin'?'Admin':`Guru Kelas ${session.classId}`}.</p></div></div><section class="card" style="max-width:720px"><h3>Ubah Password</h3><p class="muted" style="font-size:13px;line-height:1.6">Password disimpan sebagai salted hash PBKDF2. Setelah diubah, gunakan password baru pada login berikutnya.</p>${session.mustChangePassword?'<div class="source-banner warning-banner">Password sementara masih aktif. Segera ubah password Anda.</div>':''}<form class="account-password-form"><div class="field"><label>Password Saat Ini</label><input class="input" type="password" autocomplete="current-password" required data-current /></div><div class="field"><label>Password Baru</label><input class="input" type="password" autocomplete="new-password" required minlength="8" data-new /></div><div class="field"><label>Konfirmasi Password Baru</label><input class="input" type="password" autocomplete="new-password" required minlength="8" data-confirm /></div><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Password</button></form></section></div>`);
  if(session.role==='teacher'){const settings=getPrintSettings(session);const section=el(`<section class="card" style="max-width:720px;margin-bottom:16px"><h3>Identitas & Tanggal Dokumen</h3><p class="muted">Dipakai otomatis pada area tanda tangan rapor, leger, dan transkrip.</p><form data-print-settings><div class="form-grid"><div class="field"><label>Nama Kepala Sekolah</label><input class="input" name="principalName" value="${escapeHtml(settings.principalName)}" required/></div><div class="field"><label>NIP Kepala Sekolah</label><input class="input" name="principalNip" value="${escapeHtml(settings.principalNip)}" required/></div><div class="field"><label>Nama Guru/Wali Kelas</label><input class="input" name="teacherName" value="${escapeHtml(settings.teacherName)}" required/></div><div class="field"><label>NIP Guru</label><input class="input" name="teacherNip" value="${escapeHtml(settings.teacherNip)}"/></div><div class="field"><label>Kota</label><input class="input" name="city" value="${escapeHtml(settings.city||'Bekasi')}"/></div><div class="field"><label>Tanggal Cetak</label><input class="input" type="date" name="printDate" value="${escapeHtml(settings.printDate||'')}"/></div></div><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Identitas Dokumen</button></form></section>`);root.querySelector('.card').before(section);section.querySelector('form').onsubmit=event=>{event.preventDefault();try{const form=event.currentTarget;const saved=savePrintSettings(session,Object.fromEntries(new FormData(form)));toast(saved.printDateLabel?`Pengaturan tersimpan: ${saved.printDateLabel}`:'Pengaturan dokumen berhasil disimpan.');}catch(error){toast(error.message,'error');}};}
  root.querySelector('.account-password-form').onsubmit=async event=>{event.preventDefault();const current=root.querySelector('[data-current]').value,next=root.querySelector('[data-new]').value,confirmation=root.querySelector('[data-confirm]').value;if(next!==confirmation){toast('Konfirmasi password baru tidak sama.','error');return;}const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;try{await changeOwnPassword(session,current,next);event.target.reset();toast('Password berhasil diubah.');}catch(error){toast(error.message,'error');}finally{button.disabled=false;}};
  root.append(aboutApplicationCard());
  return root;
}
