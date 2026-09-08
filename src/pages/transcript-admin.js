import { CLASSES } from '../data/constants.js';
import { listStudents, parseCsv } from '../services/students.js';
import { getGraduationStatus, saveGraduationStatus } from '../services/completeness.js';
import { CONDUCT_PREDICATES, GRADUATION_DECISIONS, commitNumberStatusImport, getGraduationSettings, getStudentDocument, numberStatusTemplate, previewNumberStatusImport, saveGraduationSettings, saveStudentDocuments } from '../services/graduation-documents.js';
import { getDiplomaNumber, getTranscriptSettings, saveDiplomaNumbers, saveTranscriptSettings } from '../services/transcript-admin.js';
import { createWorkbookBytes, readWorkbookRows } from '../services/excel.js';
import { pickFile, saveFile } from '../services/file-io.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { renderTranscript } from './transcript.js';

/* Administrasi TRANSKRIP-SKL-SKKB milik Admin.

   Satu halaman "Nomor & Status Dokumen" mengurus SELURUH data yang hanya dimiliki ketiga
   dokumen - nomor surat, nomor peserta ujian, status kelulusan, dan predikat kelakuan -
   sehingga Admin tidak perlu berpindah menu untuk satu siswa yang sama.

   Bagian input nilai memakai kembali halaman transkrip wali kelas setelah otorisasi Admin
   berhasil, jadi tidak ada mesin transkrip kedua. */
const TRANSCRIPT_ADMIN_SECTIONS=Object.freeze({
  numbers:{title:'Nomor & Status Dokumen',lead:'Nomor surat, nomor peserta ujian, status kelulusan, dan predikat kelakuan per siswa.'},
  settings:{title:'Pengaturan TRANSKRIP-SKL-SKKB',lead:'Tanggal kelulusan, tanggal penerbitan surat, dan tata letak cetak transkrip.'},
  input:{title:'Input Nilai TRANSKRIP-SKL',lead:'Pilih rombel terlebih dahulu, lalu isi nilai per siswa.'}
});

function gradeOf(classId){return Number.parseInt(String(classId||'').match(/^([1-6])/)?.[1]||'',10);}

export function renderTranscriptAdmin(session,section='numbers'){
  const bagian=Object.hasOwn(TRANSCRIPT_ADMIN_SECTIONS,section)?section:'numbers';
  /* Otorisasi Admin sudah dijamin router; scope berbentuk guru baru dibuat setelahnya. */
  if(bagian==='input')return renderTranscript(session,'input');
  const info=TRANSCRIPT_ADMIN_SECTIONS[bagian];
  let classId=CLASSES[0];
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(info.title)}</h1><p>${escapeHtml(info.lead)}</p></div><div class="actions" data-actions></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]'),actions=root.querySelector('[data-actions]');

  function drawSettings(){
    const layout=getTranscriptSettings(session);
    const dokumen=getGraduationSettings(session);
    actions.innerHTML='';
    view.innerHTML=`<form class="card reference-school-form" data-dates><div class="section-head"><div><h3>Tanggal Dokumen Kelulusan</h3><p>Dipakai TRANSKRIP, SKL, dan SKKB pada tahun pelajaran ${escapeHtml(session.academicYear)}. Kota mengikuti Tanggal Rapor bila dibiarkan kosong.</p></div></div><div class="form-grid"><div class="field"><label for="graduationDate">Tanggal Kelulusan</label><input class="input" type="date" id="graduationDate" name="graduationDate" value="${escapeHtml(dokumen.graduationDate)}"/></div><div class="field"><label for="documentDate">Tanggal Penerbitan Surat</label><input class="input" type="date" id="documentDate" name="documentDate" value="${escapeHtml(dokumen.documentDate)}"/></div><div class="field form-span-2"><label for="documentCity">Kota Penerbitan</label><input class="input" id="documentCity" name="documentCity" value="${escapeHtml(dokumen.documentCity)}" placeholder="Contoh: Bekasi"/></div></div><div class="actions"><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Tanggal Dokumen</button></div></form>
    <form class="card reference-school-form" data-layout><div class="section-head"><div><h3>Tata Letak Cetak Transkrip</h3><p>Nilai di luar rentang aman otomatis dibulatkan ke batas terdekat.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Judul Transkrip</label><input class="input" name="title" value="${escapeHtml(layout.title)}"/></div><div class="field"><label>Jarak Identitas (mm, 0–30)</label><input class="input" type="number" name="identityGapMm" min="0" max="30" value="${layout.identityGapMm}"/></div><div class="field"><label>Tinggi Header (mm, 4–30)</label><input class="input" type="number" name="headerHeightMm" min="4" max="30" value="${layout.headerHeightMm}"/></div><div class="field"><label>Tinggi Baris (mm, 3–20)</label><input class="input" type="number" name="rowHeightMm" min="3" max="20" value="${layout.rowHeightMm}"/></div><div class="field"><label>Lebar Header (%, 50–100)</label><input class="input" type="number" name="headerPercent" min="50" max="100" value="${layout.headerPercent}"/></div></div><div class="actions"><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan Tata Letak</button></div></form>`;
    view.querySelector('[data-dates]').onsubmit=event=>{
      event.preventDefault();const fields=event.currentTarget.elements;
      try{saveGraduationSettings(session,{graduationDate:fields.graduationDate.value,documentDate:fields.documentDate.value,documentCity:fields.documentCity.value});drawSettings();toast('Tanggal dokumen kelulusan berhasil disimpan.');}
      catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-layout]').onsubmit=event=>{
      event.preventDefault();const fields=event.currentTarget.elements;
      try{saveTranscriptSettings(session,{title:fields.title.value,identityGapMm:fields.identityGapMm.value,headerHeightMm:fields.headerHeightMm.value,rowHeightMm:fields.rowHeightMm.value,headerPercent:fields.headerPercent.value});drawSettings();toast('Tata letak transkrip berhasil disimpan.');}
      catch(error){toast(error.message,'error');}
    };
  }

  /* Status kelulusan memakai koleksi graduationStatus yang sama dengan Rapor, sehingga SKL dan
     keterangan Lulus pada Rapor tidak mungkin berbeda. Koleksi itu hanya berlaku untuk kelas 6,
     jadi pada rombel lain pilihannya dimatikan dengan keterangan - bukan disembunyikan. */
  function statusCell(scope,student,lulusan){
    if(!lulusan)return '<span class="muted-note">Kelas 6 saja</span>';
    let current='';
    try{current=getGraduationStatus(scope,student.id)?.status||'';}catch{current='';}
    return `<select class="input" data-status="${escapeHtml(student.id)}"><option value="">Belum ditetapkan</option>${GRADUATION_DECISIONS.map(item=>`<option value="${item.id}" ${item.id===current?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select>`;
  }

  /* ------------------------------------------------- TEMPLATE EXCEL NOMOR & STATUS

     Alurnya sama dengan Import yang sudah ada di aplikasi: unduh template berisi siswa rombel
     terpilih, isi di laptop, lalu unggah kembali. Unggahan TIDAK langsung menyimpan - hasilnya
     ditampilkan sebagai preview beserta setiap baris bermasalah, dan tombol simpan baru
     terbuka bila seluruh baris valid. */
  async function unduhTemplate(){
    const template=numberStatusTemplate(session,classId);
    await saveFile({name:template.fileName,
      mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data:createWorkbookBytes(template.sheetName,template.rows,
        {columnWidths:template.columnWidths,textColumns:template.textColumns})});
  }

  function bukaPreviewImport(preview,fileName){
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-extra-wide"><div class="modal-head"><div><h3>Preview Import Nomor & Status Dokumen</h3><p>${escapeHtml(fileName)} · Kelas ${escapeHtml(preview.classId)} · ${preview.validCount} valid · ${preview.invalidCount} bermasalah</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="table-scroll import-preview-table"><table class="data-table"><thead><tr><th>Baris</th><th>NIS/NISN</th><th>Siswa</th><th>Ijazah</th><th>Transkrip</th><th>SKL</th><th>SKKB</th><th>Peserta Ujian</th><th>Status</th><th>Predikat</th><th>Validasi</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${row.rowNumber}</td><td>${escapeHtml(row.identifier||'—')}</td><td>${escapeHtml(row.studentName||'—')}</td><td>${escapeHtml(row.diplomaNumber||'—')}</td><td>${escapeHtml(row.transcriptNumber||'—')}</td><td>${escapeHtml(row.sklNumber||'—')}</td><td>${escapeHtml(row.skkbNumber||'—')}</td><td>${escapeHtml(row.examNumber||'—')}</td><td>${escapeHtml(row.graduationStatus?GRADUATION_DECISIONS.find(item=>item.id===row.graduationStatus)?.label||row.graduationStatus:'—')}</td><td>${escapeHtml(row.conductPredicate||'—')}</td><td>${row.valid?'<span class="status-ok">Valid</span>':`<span class="status-error">${escapeHtml(row.errors.join(' '))}</span>`}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions"><button class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" data-commit ${preview.canCommit?'':'disabled'}>Simpan ${preview.validCount} Baris</button></div></div></div>`);
    document.body.append(modal);const close=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
    modal.querySelector('[data-commit]').onclick=async()=>{
      if(!preview.canCommit)return;
      if(!await confirmDialog({title:'Konfirmasi Import',message:`Simpan ${preview.validCount} baris Nomor & Status Dokumen Kelas ${preview.classId}?`,confirmText:'Simpan Import'}))return;
      try{
        const ringkas=commitNumberStatusImport(session,classId,preview);
        close();drawNumbers();
        toast(`${ringkas.students} siswa diperbarui · ${ringkas.diplomas} nomor ijazah · ${ringkas.statuses} status kelulusan.`);
      }catch(error){toast(error.message,'error');}
    };
  }

  async function unggahImport(){
    const file=await pickFile({accept:'.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'});
    if(!file)return;
    const matrix=/\.csv$/i.test(file.name)?parseCsv(file.text):readWorkbookRows(file.arrayBuffer);
    bukaPreviewImport(previewNumberStatusImport(session,classId,matrix),file.name);
  }

  function drawNumbers(){
    const scope={...session,role:'teacher',classId};
    const students=listStudents(scope,{classId});
    const lulusan=gradeOf(classId)===6;
    actions.innerHTML=`<button class="btn btn-light" data-template>${icon('download',16)} Unduh Template Excel</button><button class="btn btn-light" data-import>${icon('upload',16)} Import Excel</button>`;
    actions.querySelector('[data-template]').onclick=()=>unduhTemplate().catch(error=>toast(error.message,'error'));
    actions.querySelector('[data-import]').onclick=()=>unggahImport().catch(error=>toast(error.message,'error'));
    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label for="documentClass">Rombel</label><select class="input" id="documentClass" data-class>${CLASSES.map(item=>`<option value="${item}" ${item===classId?'selected':''}>Kelas ${item}</option>`).join('')}</select></div><div class="scope-note">TRANSKRIP-SKL-SKKB<span>${escapeHtml(session.academicYear)} · ${students.length} siswa</span></div></section>${students.length?`<section class="card wide-table-card"><div class="table-scroll"><table class="data-table document-number-table"><thead><tr><th>Siswa</th><th>Nomor Ijazah</th><th>Nomor Transkrip</th><th>Nomor SKL</th><th>Nomor SKKB</th><th>No. Peserta Ujian</th><th>Status SKL</th><th>Predikat SKKB</th></tr></thead><tbody>${students.map(student=>{
      const record=getStudentDocument(session,student.id);
      const ijazah=getDiplomaNumber(session,student.id)?.number||'';
      return `<tr><td><strong>${escapeHtml(student.name)}</strong><span>${escapeHtml(student.nisn||student.nis||'—')}</span></td><td><input class="input" data-field="diplomaNumber" data-student="${escapeHtml(student.id)}" value="${escapeHtml(ijazah)}" placeholder="Belum ada"/></td><td><input class="input" data-field="transcriptNumber" data-student="${escapeHtml(student.id)}" value="${escapeHtml(record.transcriptNumber)}" placeholder="Belum ada"/></td><td><input class="input" data-field="sklNumber" data-student="${escapeHtml(student.id)}" value="${escapeHtml(record.sklNumber)}" placeholder="Belum ada"/></td><td><input class="input" data-field="skkbNumber" data-student="${escapeHtml(student.id)}" value="${escapeHtml(record.skkbNumber)}" placeholder="Belum ada"/></td><td><input class="input" data-field="examNumber" data-student="${escapeHtml(student.id)}" value="${escapeHtml(record.examNumber)}" placeholder="Belum ada"/></td><td>${statusCell(scope,student,lulusan)}</td><td><select class="input" data-predicate="${escapeHtml(student.id)}"><option value="">Belum ditetapkan</option>${CONDUCT_PREDICATES.map(item=>`<option value="${escapeHtml(item)}" ${item===record.conductPredicate?'selected':''}>${escapeHtml(item)}</option>`).join('')}</select></td></tr>`;
    }).join('')}</tbody></table></div><div class="actions"><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Kelas ${escapeHtml(classId)}</button></div></section>`:'<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa pada rombel ini terlebih dahulu.</p></section>'}`;
    view.querySelector('[data-class]').onchange=event=>{classId=event.target.value;drawNumbers();};
    const save=view.querySelector('[data-save]');
    if(save)save.onclick=()=>{
      const baca=(field,studentId)=>view.querySelector(`[data-field="${field}"][data-student="${CSS.escape(studentId)}"]`)?.value||'';
      const dokumen=students.map(student=>({studentId:student.id,
        transcriptNumber:baca('transcriptNumber',student.id),sklNumber:baca('sklNumber',student.id),
        skkbNumber:baca('skkbNumber',student.id),examNumber:baca('examNumber',student.id),
        conductPredicate:view.querySelector(`[data-predicate="${CSS.escape(student.id)}"]`)?.value||''}));
      const ijazah=students.map(student=>({studentId:student.id,number:baca('diplomaNumber',student.id)})).filter(item=>item.number.trim());
      try{
        saveStudentDocuments(session,dokumen);
        if(ijazah.length)saveDiplomaNumbers(session,ijazah);
        if(lulusan)for(const student of students){
          const status=view.querySelector(`[data-status="${CSS.escape(student.id)}"]`)?.value||'';
          if(status)saveGraduationStatus({...session,role:'teacher',classId},student.id,status);
        }
        drawNumbers();toast(`Dokumen ${students.length} siswa Kelas ${classId} berhasil disimpan.`);
      }catch(error){toast(error.message,'error');}
    };
  }

  if(bagian==='settings')drawSettings();else drawNumbers();
  return root;
}
