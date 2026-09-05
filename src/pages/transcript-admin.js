import { CLASSES } from '../data/constants.js';
import { listStudents } from '../services/students.js';
import { getDiplomaNumber, getTranscriptSettings, listDiplomaNumbers, previewDiplomaNumberImport, saveDiplomaNumbers, saveTranscriptSettings } from '../services/transcript-admin.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { renderTranscript } from './transcript.js';

/* Halaman administrasi transkrip milik Admin. Bagian input memakai kembali halaman transkrip
   wali kelas setelah otorisasi Admin berhasil, jadi tidak ada mesin transkrip kedua. */
const TRANSCRIPT_ADMIN_SECTIONS=Object.freeze({
  numbers:{title:'Import Nomor Ijazah',lead:'Masukkan atau unggah nomor ijazah per siswa untuk tahun pelajaran aktif.'},
  settings:{title:'Setting Transkrip',lead:'Judul dan ukuran tata letak yang dipakai saat mencetak transkrip.'},
  input:{title:'Input Nilai Transkrip',lead:'Pilih rombel terlebih dahulu, lalu isi nilai transkrip siswa.'}
});

function parseDiplomaCsv(text){
  const baris=String(text||'').replace(/^﻿/,'').split(/\r?\n/).map(item=>item.trim()).filter(Boolean);
  if(!baris.length)return [];
  const kolom=baris[0].split(',').map(item=>item.trim().toLowerCase());
  const iNisn=kolom.findIndex(item=>item==='nisn'),iNomor=kolom.findIndex(item=>item.includes('nomor'));
  const mulai=iNisn>=0||iNomor>=0?1:0;
  return baris.slice(mulai).map(row=>{const sel=row.split(',').map(item=>item.trim());return {nisn:sel[iNisn>=0?iNisn:0]||'',number:sel[iNomor>=0?iNomor:1]||''};});
}

export function renderTranscriptAdmin(session,section='numbers'){
  const bagian=Object.hasOwn(TRANSCRIPT_ADMIN_SECTIONS,section)?section:'numbers';
  /* Otorisasi Admin sudah dijamin router; scope berbentuk guru baru dibuat setelahnya. */
  if(bagian==='input')return renderTranscript(session,'input');
  const info=TRANSCRIPT_ADMIN_SECTIONS[bagian];
  let classId=CLASSES[0];
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(info.title)}</h1><p>${escapeHtml(info.lead)}</p></div><div class="actions" data-actions></div></div><div data-view></div><input type="file" accept=".csv,text/csv" class="hidden" data-file/></div>`);
  const view=root.querySelector('[data-view]'),actions=root.querySelector('[data-actions]'),fileInput=root.querySelector('[data-file]');

  function drawSettings(){
    const current=getTranscriptSettings(session);
    actions.innerHTML='';
    view.innerHTML=`<form class="card reference-school-form" data-settings><div class="section-head"><div><h3>Setting Transkrip</h3><p>Nilai di luar rentang aman otomatis dibulatkan ke batas terdekat.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Judul Transkrip</label><input class="input" name="title" value="${escapeHtml(current.title)}"/></div><div class="field"><label>Jarak Identitas (mm, 0–30)</label><input class="input" type="number" name="identityGapMm" min="0" max="30" value="${current.identityGapMm}"/></div><div class="field"><label>Tinggi Header (mm, 4–30)</label><input class="input" type="number" name="headerHeightMm" min="4" max="30" value="${current.headerHeightMm}"/></div><div class="field"><label>Tinggi Baris (mm, 3–20)</label><input class="input" type="number" name="rowHeightMm" min="3" max="20" value="${current.rowHeightMm}"/></div><div class="field"><label>Lebar Header (%, 50–100)</label><input class="input" type="number" name="headerPercent" min="50" max="100" value="${current.headerPercent}"/></div></div><div class="actions"><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Setting Transkrip</button></div></form>`;
    view.querySelector('[data-settings]').onsubmit=event=>{
      event.preventDefault();const fields=event.currentTarget.elements;
      try{saveTranscriptSettings(session,{title:fields.title.value,identityGapMm:fields.identityGapMm.value,headerHeightMm:fields.headerHeightMm.value,rowHeightMm:fields.rowHeightMm.value,headerPercent:fields.headerPercent.value});drawSettings();toast('Setting transkrip berhasil disimpan.');}
      catch(error){toast(error.message,'error');}
    };
  }

  function openImportPreview(preview,fileName){
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-extra-wide"><div class="modal-head"><div><h3>Preview Import Nomor Ijazah</h3><p>${escapeHtml(fileName)} · ${preview.validCount} valid · ${preview.invalidCount} bermasalah</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="table-scroll import-preview-table"><table class="data-table"><thead><tr><th>Baris</th><th>NISN</th><th>Siswa</th><th>Nomor Ijazah</th><th>Validasi</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${row.rowNumber}</td><td>${escapeHtml(row.nisn||'—')}</td><td>${escapeHtml(row.studentName||'—')}</td><td>${escapeHtml(row.number||'—')}</td><td>${row.valid?'<span class="status-ok">Valid</span>':`<span class="status-error">${escapeHtml(row.errors.join(' '))}</span>`}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions"><button class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" data-commit ${preview.canCommit?'':'disabled'}>Simpan ${preview.validCount} Nomor</button></div></div></div>`);
    document.body.append(modal);const close=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
    modal.querySelector('[data-commit]').onclick=()=>{
      try{const saved=saveDiplomaNumbers(session,preview.rows.filter(row=>row.valid).map(row=>({studentId:row.studentId,number:row.number})));close();drawNumbers();toast(`${saved.length} nomor ijazah berhasil disimpan.`);}
      catch(error){toast(error.message,'error');}
    };
  }

  function drawNumbers(){
    const students=listStudents({...session,role:'teacher',classId},{classId});
    const tersimpan=listDiplomaNumbers(session);
    actions.innerHTML=`<button class="btn btn-light" data-upload>${icon('upload',16)} Import CSV</button>`;
    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label for="diplomaClass">Rombel</label><select class="input" id="diplomaClass" data-class>${CLASSES.map(item=>`<option value="${item}" ${item===classId?'selected':''}>Kelas ${item}</option>`).join('')}</select></div><div class="scope-note">Nomor Ijazah<span>${escapeHtml(session.academicYear)} · ${tersimpan.length} nomor tersimpan</span></div></section>${students.length?`<section class="card wide-table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Siswa</th><th>NISN</th><th>Nomor Ijazah</th></tr></thead><tbody>${students.map(student=>`<tr><td><strong>${escapeHtml(student.name)}</strong><span>${escapeHtml(student.nis)}</span></td><td>${escapeHtml(student.nisn||'—')}</td><td><input class="input" data-number="${escapeHtml(student.id)}" value="${escapeHtml(getDiplomaNumber(session,student.id)?.number||'')}" placeholder="Belum ada nomor"/></td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Nomor Kelas ${escapeHtml(classId)}</button></div></section>`:'<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa pada rombel ini terlebih dahulu.</p></section>'}`;
    view.querySelector('[data-class]').onchange=event=>{classId=event.target.value;drawNumbers();};
    const save=view.querySelector('[data-save]');
    if(save)save.onclick=()=>{
      const records=[...view.querySelectorAll('[data-number]')].map(input=>({studentId:input.dataset.number,number:input.value})).filter(item=>item.number.trim());
      if(!records.length){toast('Belum ada nomor ijazah yang diisi.','error');return;}
      try{saveDiplomaNumbers(session,records);drawNumbers();toast(`${records.length} nomor ijazah berhasil disimpan.`);}
      catch(error){toast(error.message,'error');}
    };
    actions.querySelector('[data-upload]').onclick=()=>fileInput.click();
  }

  fileInput.onchange=async()=>{
    const file=fileInput.files?.[0];if(!file)return;
    try{openImportPreview(previewDiplomaNumberImport(session,parseDiplomaCsv(await file.text())),file.name);}
    catch(error){toast(error.message,'error');}
    finally{fileInput.value='';}
  };

  if(bagian==='settings')drawSettings();else drawNumbers();
  return root;
}
