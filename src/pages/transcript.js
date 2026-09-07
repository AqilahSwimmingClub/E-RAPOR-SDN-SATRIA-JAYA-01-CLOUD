import { CLASSES } from '../data/constants.js';
import { getTranscriptRows, saveTranscriptScores } from '../services/transcript.js';
import { buildSklDocument, buildSkkbDocument, buildTranscriptDocument, commitDocumentImport, documentImportTemplate, previewDocumentImport } from '../services/graduation-documents.js';
import { listStudents, parseCsv } from '../services/students.js';
import { createWorkbookBytes, readWorkbookRows } from '../services/excel.js';
import { pickFile, saveFile } from '../services/file-io.js';
import { printCurrentDocument } from '../services/print-service.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sklSheet, skkbSheet, transcriptSheet } from './graduation-print.js';

function classOptions(selected){return CLASSES.map(item=>`<option value="${item}" ${item===selected?'selected':''}>Kelas ${item}</option>`).join('');}
function studentOptions(students,selected){return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nisn||student.nis||'')}</option>`).join('');}

const TRANSCRIPT_MODES=Object.freeze({
  input:{title:'Input Nilai TRANSKRIP-SKL',lead:'Nilai transkrip tahunan terpisah dari Nilai Rapor semester.'},
  import:{title:'Import Data & Nilai TRANSKRIP-SKL-SKKB',lead:'Unggah satu berkas untuk nomor surat, status, predikat, dan nilai sekaligus.'},
  preview:{title:'Cetak TRANSKRIP-SKL-SKKB',lead:'Pratinjau dan cetak Transkrip Nilai, Surat Keterangan Lulus, dan Surat Keterangan Kelakuan Baik.'}
});

/* Tiga dokumen, satu pratinjau. Yang berpindah hanyalah lembar yang dirakit; sumber datanya
   sama sehingga tidak mungkin ada identitas berbeda antar dokumen milik siswa yang sama. */
const DOCUMENT_TABS=Object.freeze([
  ['transkrip','Transkrip Nilai',buildTranscriptDocument,transcriptSheet],
  ['skl','SKL',buildSklDocument,sklSheet],
  ['skkb','SKKB',buildSkkbDocument,skkbSheet],
]);

export function renderTranscript(session,mode='input'){
  const tab=Object.hasOwn(TRANSCRIPT_MODES,mode)?mode:'input';const halaman=TRANSCRIPT_MODES[tab];
  let classId=session.role==='teacher'?session.classId:CLASSES[0];let scope={...session,role:'teacher',classId};let studentId='';let dokumen='transkrip';
  const root=el(`<div><div class="page-head no-print"><div><h1>${escapeHtml(halaman.title)}</h1><p>${escapeHtml(halaman.lead)}</p></div><div class="actions" data-actions></div></div>${session.role==='admin'?`<section class="card module-filter no-print"><div class="field compact-field"><label for="transcriptClass">Rombel</label><select class="input" id="transcriptClass" data-class>${classOptions(classId)}</select></div><div class="scope-note">TRANSKRIP-SKL-SKKB<span>${escapeHtml(session.academicYear)}</span></div></section>`:''}<div data-view></div></div>`);
  const view=root.querySelector('[data-view]');const actions=root.querySelector('[data-actions]');
  function refreshScope(){scope={...session,role:'teacher',classId};const students=listStudents(scope,{classId});if(!students.some(student=>student.id===studentId))studentId=students[0]?.id||'';return students;}
  function selection(students,label='Siswa'){return `<section class="card module-filter no-print"><div class="field compact-field"><label>${label}</label><select class="input" data-student><option value="">${students.length?'Pilih siswa':'Belum ada siswa'}</option>${studentOptions(students,studentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(classId)}<span>${escapeHtml(session.academicYear)} · tanpa scope semester</span></div></section>`;}

  /* Daftar mapel pada input nilai adalah SATU urutan 1..N mengikuti Mapping aktif. Label
     "Kelompok A/B" sengaja tidak ditampilkan: pengelompokan itu tidak lagi dipakai di mana pun,
     dan menampilkannya di sini akan bertentangan dengan Rapor, Transkrip, dan SKL. */
  function drawInput(){
    const students=refreshScope();actions.innerHTML='';
    if(!students.length){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa pada rombel aktif terlebih dahulu.</p></section>';return;}
    const rows=getTranscriptRows(scope,studentId);
    view.innerHTML=`${selection(students)}<section class="card transcript-input-card"><div class="section-head"><div><h3>Nilai TRANSKRIP-SKL</h3><p>Urutan mengikuti Mapping Mata Pelajaran aktif, satu daftar tanpa pengelompokan.</p></div><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Nilai</button></div><div class="table-scroll"><table class="data-table transcript-input-table"><thead><tr><th>No.</th><th>Mata Pelajaran</th><th>Nilai 0–100</th><th>Status</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td><strong>${escapeHtml(row.subject.name)}</strong></td><td><input class="input score-input" type="number" min="0" max="100" step="0.01" value="${row.score??''}" data-score="${escapeHtml(row.subject.id)}"/></td><td><span class="badge ${row.saved?'badge-active':'badge-inactive'}">${row.saved?'Tersimpan':'Belum diisi'}</span></td></tr>`).join('')}</tbody></table></div></section>`;
    view.querySelector('[data-student]').onchange=event=>{studentId=event.target.value;drawInput();};
    view.querySelector('[data-save]').onclick=()=>{const values={};view.querySelectorAll('[data-score]').forEach(input=>{values[input.dataset.score]=input.value;});try{saveTranscriptScores(scope,studentId,values);drawInput();toast('Nilai transkrip berhasil disimpan.');}catch(error){toast(error.message,'error');}};
  }

  async function downloadTemplate(){
    const template=documentImportTemplate(session,classId);
    await saveFile({name:`TEMPLATE-TRANSKRIP-SKL-SKKB-${classId}-${session.academicYear.replace('/','-')}.xlsx`,
      mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data:createWorkbookBytes(template.sheetName,template.rows,{columnWidths:template.columnWidths})});
  }

  function openImportPreview(preview,fileName){
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-extra-wide"><div class="modal-head"><div><h3>Preview Import TRANSKRIP-SKL-SKKB</h3><p>${escapeHtml(fileName)} · ${preview.validCount} valid · ${preview.invalidCount} bermasalah</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="table-scroll import-preview-table"><table class="data-table"><thead><tr><th>Baris</th><th>Siswa</th><th>Ijazah</th><th>Transkrip</th><th>SKL</th><th>SKKB</th><th>Status</th><th>Predikat</th><th>Nilai</th><th>Validasi</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${row.rowNumber}</td><td>${escapeHtml(row.studentName||row.nisn||row.nis||'—')}</td><td>${escapeHtml(row.diplomaNumber||'—')}</td><td>${escapeHtml(row.transcriptNumber||'—')}</td><td>${escapeHtml(row.sklNumber||'—')}</td><td>${escapeHtml(row.skkbNumber||'—')}</td><td>${escapeHtml(row.graduationStatus||'—')}</td><td>${escapeHtml(row.conductPredicate||'—')}</td><td>${row.scoreCount}</td><td>${row.valid?'<span class="status-ok">Valid</span>':`<span class="status-error">${escapeHtml(row.errors.join(' '))}</span>`}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions"><button class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" data-commit ${preview.canCommit?'':'disabled'}>Simpan ${preview.validCount} Baris</button></div></div></div>`);
    document.body.append(modal);const close=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
    modal.querySelector('[data-commit]').onclick=async()=>{
      if(!preview.canCommit)return;
      if(!await confirmDialog({title:'Konfirmasi Import',message:`Simpan ${preview.validCount} baris setelah preview tervalidasi?`,confirmText:'Simpan Import'}))return;
      try{const ringkas=commitDocumentImport(session,classId,preview);close();toast(`${ringkas.students} siswa diperbarui · ${ringkas.scores} nilai · ${ringkas.diplomas} nomor ijazah · ${ringkas.statuses} status kelulusan.`);}
      catch(error){toast(error.message,'error');}
    };
  }

  function drawImport(){
    refreshScope();
    actions.innerHTML=`<button class="btn btn-light" data-template>${icon('download',16)} Download Template</button>`;
    view.innerHTML=`<section class="card import-report-card"><div class="placeholder-icon">${icon('upload',25)}</div><h2>Import Data & Nilai TRANSKRIP-SKL-SKKB</h2><p>Template hanya meminta data yang belum ada di database: nomor surat, nomor peserta ujian, status kelulusan, predikat SKKB, dan nilai. Identitas sekolah dan siswa tidak perlu diketik ulang. Kolom mata pelajaran mengikuti Mapping aktif rombel ini.</p><p>Upload XLSX/XLS/CSV tidak langsung menyimpan. Data harus melalui Preview dan Validasi sebelum konfirmasi Simpan.</p><div class="actions"><button class="btn btn-light" data-template-inline>${icon('download',16)} Template XLSX</button><button class="btn btn-primary" data-upload>${icon('upload',16)} Upload File</button></div></section>`;
    const unduh=()=>downloadTemplate().catch(error=>toast(error.message,'error'));
    actions.querySelector('[data-template]').onclick=unduh;
    view.querySelector('[data-template-inline]').onclick=unduh;
    view.querySelector('[data-upload]').onclick=async()=>{
      try{
        const file=await pickFile({accept:'.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'});
        if(!file)return;
        const matrix=/\.csv$/i.test(file.name)?parseCsv(file.text):readWorkbookRows(file.arrayBuffer);
        openImportPreview(previewDocumentImport(session,classId,matrix),file.name);
      }catch(error){toast(error.message,'error');}
    };
  }

  function printDocument(savePdf=false){
    const nama=DOCUMENT_TABS.find(item=>item[0]===dokumen)?.[1]||'Dokumen';
    return printCurrentDocument({title:`${nama}-${classId}-${session.academicYear.replace('/','-')}`,savePdf:savePdf===true});
  }

  function drawPreview(){
    const students=refreshScope();actions.innerHTML='';
    if(!students.length){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa pada rombel ini terlebih dahulu.</p></section>';return;}
    const pilihan=DOCUMENT_TABS.find(item=>item[0]===dokumen)||DOCUMENT_TABS[0];
    let lembar='';
    try{lembar=studentId?pilihan[3](pilihan[2](session,classId,studentId)):'';}
    catch(error){lembar=`<section class="card empty-state"><h3>Dokumen belum dapat disusun</h3><p>${escapeHtml(error.message)}</p></section>`;}
    view.innerHTML=`${selection(students,'Pilih Siswa untuk Preview')}<nav class="print-tabs no-print" data-tabs>${DOCUMENT_TABS.map(([id,label])=>`<button class="btn ${id===dokumen?'btn-primary':'btn-light'}" data-doc="${id}">${escapeHtml(label)}</button>`).join('')}</nav><div class="print-toolbar no-print"><span>${escapeHtml(pilihan[1])} · Kelas ${escapeHtml(classId)}</span><div class="actions"><button class="btn btn-light" data-print>${icon('printer',16)} Cetak</button><button class="btn btn-primary" data-pdf>${icon('download',16)} Download PDF</button></div></div>${lembar||'<section class="card empty-state"><h3>Pilih siswa terlebih dahulu</h3></section>'}`;
    view.querySelector('[data-student]').onchange=event=>{studentId=event.target.value;drawPreview();};
    view.querySelectorAll('[data-doc]').forEach(button=>{button.onclick=()=>{dokumen=button.dataset.doc;drawPreview();};});
    view.querySelector('[data-print]').onclick=()=>printDocument(false);
    view.querySelector('[data-pdf]').onclick=()=>printDocument(true);
  }

  function draw(){if(tab==='input')drawInput();if(tab==='import')drawImport();if(tab==='preview')drawPreview();}
  if(session.role==='admin')root.querySelector('[data-class]').onchange=event=>{classId=event.target.value;studentId='';draw();};
  draw();return root;
}
