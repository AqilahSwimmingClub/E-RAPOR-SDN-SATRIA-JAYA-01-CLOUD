import { CLASSES } from '../data/constants.js';
import { getTranscriptRows, saveTranscriptScores } from '../services/transcript.js';
import { buildClassDocuments, buildSklDocument, buildSkkbDocument, buildTranscriptDocument, commitDocumentImport, documentImportTemplate, previewDocumentImport } from '../services/graduation-documents.js';
import { listStudents, parseCsv } from '../services/students.js';
import { createWorkbookBytes, readWorkbookRows } from '../services/excel.js';
import { pickFile, saveFile } from '../services/file-io.js';
import { printCurrentDocument } from '../services/print-service.js';
import { setPrintPageSize } from './print.js';
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
  ['transkrip','Transkrip Nilai','TRANSKRIP',buildTranscriptDocument,transcriptSheet],
  ['skl','SKL','SKL',buildSklDocument,sklSheet],
  ['skkb','SKKB','SKKB',buildSkkbDocument,skkbSheet],
]);

export function renderTranscript(session,mode='input'){
  const tab=Object.hasOwn(TRANSCRIPT_MODES,mode)?mode:'input';const halaman=TRANSCRIPT_MODES[tab];
  let classId=session.role==='teacher'?session.classId:CLASSES[0];let scope={...session,role:'teacher',classId};let studentId='';let dokumen='transkrip';let previewed=false;let bulkMode=false;
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

  /* ================================================== CETAK: MODEL YANG SAMA DENGAN RAPOR

     Yang dipakai ulang dari Cetak Rapor adalah SISTEM CETAKNYA, bukan isi dokumennya:
     pemilih siswa, tombol Preview, saklar Semua Siswa, ukuran kertas A4 lewat
     setPrintPageSize, dan pemisahan tiap siswa menjadi lembar sendiri. Isi TRANSKRIP, SKL,
     dan SKKB tetap milik masing-masing.

     SETIAP LEMBAR DIBANGUN ULANG DARI studentId-NYA SENDIRI. Tidak ada satu pun nilai, nomor,
     status, atau predikat yang diwariskan dari siswa yang tadi dipratinjau: builder dipanggil
     terpisah per siswa, dan hasilnya hanya bergantung pada id yang diberikan. */
  function documentBuilder(){return DOCUMENT_TABS.find(item=>item[0]===dokumen)||DOCUMENT_TABS[0];}
  function sheetFor(studentId,pilihan=documentBuilder()){
    try{return pilihan[4](pilihan[3](session,classId,studentId));}
    catch(error){return `<section class="document-a4 letter-a4"><p class="letter-body">Dokumen tidak dapat disusun: ${escapeHtml(error.message)}</p></section>`;}
  }
  /* Cetak Semua memakai buildClassDocuments: satu penyusun yang membangun ulang tiap dokumen
     dari studentId-nya sendiri, dengan urutan siswa yang sama seperti halaman lain. */
  function bulkSheets(){const pilihan=documentBuilder();return buildClassDocuments(session,classId,pilihan[2]).map(pilihan[4]).join('');}

  /* Kertas A4 potret ditetapkan lewat mekanisme yang sama dengan Rapor: margin atas-bawah dari
     @page, margin kiri-kanan dibawa lembarnya sendiri supaya cetak dari Android - yang
     mengabaikan margin @page - tetap tidak menempel ke tepi kertas. */
  function applyPageSize(){setPrintPageSize('portrait','10mm 0');}
  function printDocument(savePdf=false){
    applyPageSize();
    const nama=documentBuilder()[1];
    const berkas=bulkMode?`${nama}-SEMUA-${classId}`:`${nama}-${classId}`;
    return printCurrentDocument({title:`${berkas}-${session.academicYear.replace('/','-')}`,savePdf:savePdf===true});
  }

  function drawPreview(){
    const students=refreshScope();applyPageSize();actions.innerHTML='';
    if(!students.length){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa pada rombel ini terlebih dahulu.</p></section>';return;}
    const pilihan=documentBuilder();
    const tabs=`<nav class="print-tabs no-print" data-tabs>${DOCUMENT_TABS.map(([id,label])=>`<button class="btn ${id===dokumen?'btn-primary':'btn-light'}" data-doc="${id}">${escapeHtml(label)}</button>`).join('')}</nav>`;
    if(bulkMode){
      view.innerHTML=`${tabs}<section class="card report-print-control bulk-print-control no-print"><span>Cetak Semua ${escapeHtml(pilihan[1])} · ${students.length} siswa</span><button class="btn btn-light" data-bulk-toggle>Kembali ke Satu Siswa</button><button class="btn btn-light" data-print>${icon('printer',16)} Cetak</button><button class="btn btn-primary" data-pdf>${icon('download',16)} Simpan PDF</button></section>${bulkSheets()}`;
    }else{
      const lembar=previewed&&studentId?sheetFor(studentId,pilihan):'<section class="card empty-state no-print"><h3>Preview belum dibuka</h3><p>Pilih siswa lalu klik Preview untuk menampilkan lembar A4.</p></section>';
      view.innerHTML=`${tabs}<section class="card report-print-control no-print"><div class="field compact-field"><label>Pilih Siswa</label><select class="input" data-student>${students.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===studentId?'selected':''}>${escapeHtml(item.name)} · ${escapeHtml(item.nisn||item.nis||'')}</option>`).join('')}</select></div><button class="btn btn-light" data-bulk-toggle>Semua Siswa</button><button class="btn btn-light" data-preview>${icon('file',16)} Preview</button><button class="btn btn-light" data-print ${previewed?'':'disabled'}>${icon('printer',16)} Cetak</button><button class="btn btn-primary" data-pdf ${previewed?'':'disabled'}>${icon('download',16)} Simpan PDF</button></section>${lembar}`;
    }
    view.querySelectorAll('[data-doc]').forEach(button=>{button.onclick=()=>{dokumen=button.dataset.doc;drawPreview();};});
    const pemilih=view.querySelector('[data-student]');
    if(pemilih)pemilih.onchange=event=>{studentId=event.target.value;previewed=false;drawPreview();};
    view.querySelector('[data-preview]')?.addEventListener('click',()=>{previewed=true;drawPreview();});
    view.querySelector('[data-bulk-toggle]')?.addEventListener('click',()=>{bulkMode=!bulkMode;previewed=bulkMode;drawPreview();});
    view.querySelector('[data-print]')?.addEventListener('click',()=>printDocument(false));
    view.querySelector('[data-pdf]')?.addEventListener('click',()=>printDocument(true));
  }

  function draw(){if(tab==='input')drawInput();if(tab==='import')drawImport();if(tab==='preview')drawPreview();}
  if(session.role==='admin')root.querySelector('[data-class]').onchange=event=>{classId=event.target.value;studentId='';previewed=false;bulkMode=false;draw();};
  /* Aturan @page dilepas saat meninggalkan halaman supaya dokumen lain tidak ikut terpengaruh,
     sama seperti yang dilakukan halaman Cetak Rapor. */
  globalThis.addEventListener?.('hashchange',()=>setPrintPageSize(null),{once:true});
  draw();return root;
}
