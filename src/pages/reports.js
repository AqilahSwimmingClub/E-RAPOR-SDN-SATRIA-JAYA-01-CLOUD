import { getAssessmentSettings } from '../services/assessment.js';
import { generateAllReportDescriptions, generateReportDescription, getReportDescription, lockReportDescription, saveReportDescription } from '../services/descriptions.js';
import { listCpButirForSemester } from '../services/cp-butir.js';
import { commitReportImport, previewReportImport, reportTemplateCsv } from '../services/report-import.js';
import { calculateReportSheet, getCompletionSummary, getReportScore, getStoredReportRows, saveAutomaticReportScores, saveManualReportScore, saveManualReportScoresBulk, visibleStoredReportRows } from '../services/report.js';
import { saveAllAutomaticReports } from '../services/report-bulk.js';
import { getReportStatistics } from '../services/analytics.js';
import { listStudents } from '../services/students.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { digitalGauge } from '../ui/digital-gauge.js';

function number(value,digits=2){return value===null||value===undefined?'—':Number(value.toFixed(digits)).toLocaleString('id-ID');}
function subjectOptions(subjects,selected){return subjects.map(subject=>`<option value="${escapeHtml(subject.id)}" ${subject.id===selected?'selected':''}>${escapeHtml(subject.name)}</option>`).join('');}
function statusBadge(status,label){return `<span class="badge ${status?'badge-active':'badge-inactive'}">${escapeHtml(label)}</span>`;}
const REPORT_INPUT_MODES=Object.freeze({
  input:{title:'Input Nilai Rapor',lead:'Hitung atau override nilai tanpa finalisasi otomatis.',tab:'automatic'},
  import:{title:'Import Nilai Rapor',lead:'Unggah berkas CSV Nilai Rapor lalu periksa pratinjaunya sebelum disimpan.',tab:'import'}
});

export function renderReportInput(session,mode='input'){
  const halaman=REPORT_INPUT_MODES[Object.hasOwn(REPORT_INPUT_MODES,mode)?mode:'input'];
  const subjects=listActiveSubjects(session);let subjectId=subjects[0]?.id||'';let tab=halaman.tab;
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(halaman.title)}</h1><p>${escapeHtml(halaman.lead)}</p></div><div class="actions" data-actions></div></div>${halaman.tab==='import'?'':'<div class="report-tabs"><button class="tab active" data-tab="automatic">Nilai Otomatis</button><button class="tab" data-tab="manual">Input Manual</button></div>'}<section class="card module-filter"><div class="field compact-field"><label for="reportSubject">Mata Pelajaran Aktif</label><select class="input" id="reportSubject" data-subject>${subjectOptions(subjects,subjectId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><div data-view></div><input class="hidden" type="file" accept=".csv,text/csv" data-import-file/></div>`);
  const view=root.querySelector('[data-view]');const actions=root.querySelector('[data-actions]');const fileInput=root.querySelector('[data-import-file]');
  if(!subjects.length){root.querySelector('[data-subject]').disabled=true;root.querySelectorAll('[data-tab]').forEach(button=>button.disabled=true);view.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mapel melalui Mapping Mata Pelajaran.</p></section>';return root;}

  function draw(){
    root.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
    if(tab==='automatic')drawAutomatic();if(tab==='manual')drawManual();if(tab==='import')drawImport();
  }
  function drawAutomatic(){
    const rows=calculateReportSheet(session,subjectId);const complete=rows.filter(row=>row.completionStatus==='COMPLETE').length;actions.innerHTML=`<button class="btn btn-light" data-generate-all title="Susun ulang deskripsi mata pelajaran ini untuk seluruh siswa">${icon('activity',17)} Generate Semua Siswa</button><button class="btn btn-light" data-save-all-auto>Simpan Otomatis Semua Mapel</button><button class="btn btn-primary" data-save-auto>${icon('save',17)} Simpan Hasil Otomatis</button>`;
    if(!rows.length){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa sebelum menghitung Nilai Rapor.</p></section>';actions.querySelector('[data-save-auto]').disabled=true;actions.querySelector('[data-generate-all]').disabled=true;return;}
    view.innerHTML=`<div class="report-summary"><article class="stat-card"><div class="stat-label">Nilai Lengkap</div><div class="stat-value">${complete}</div><div class="stat-foot">dari ${rows.length} siswa</div></article><article class="stat-card"><div class="stat-label">Belum Lengkap</div><div class="stat-value">${rows.length-complete}</div><div class="stat-foot">komponen kosong bukan 0</div></article><article class="stat-card"><div class="stat-label">KKTP Mapel</div><div class="stat-value">${getAssessmentSettings(session,subjectId).kktp}</div><div class="stat-foot">mengikuti Bobot Penilaian</div></article></div><section class="card report-table-card"><div class="table-scroll"><table class="data-table report-table"><thead><tr><th>Siswa</th><th>5 Komponen</th><th>Mentah</th><th>Pembulatan</th><th>KKTP</th><th>Status</th><th>Deskripsi</th></tr></thead><tbody>${rows.map(row=>automaticRow(row)).join('')}</tbody></table></div></section><div class="report-card-list">${rows.map(row=>automaticCard(row)).join('')}</div>`;
    bindDescriptionButtons();
    /* Kedua tombol diberi status sibuk, penanganan galat, dan umpan balik. Sebelumnya galat
       apa pun membuat tombol seolah tidak bisa diklik karena tidak ada reaksi sama sekali. */
    const jalankan=async(button,label,kerja)=>{
      const semula=button.innerHTML;
      button.disabled=true;button.textContent=label;
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      try{await kerja();}
      catch(error){toast(error.message,'error');}
      finally{if(button.isConnected){button.disabled=false;button.innerHTML=semula;}}
    };
    actions.querySelector('[data-save-auto]').onclick=()=>jalankan(actions.querySelector('[data-save-auto]'),'Menyimpan…',()=>{
      const saved=saveAutomaticReportScores(session,subjectId);
      const bernilai=saved.filter(item=>item.finalScore!==null).length;
      drawAutomatic();
      toast(`${bernilai} dari ${saved.length} siswa memperoleh nilai rapor. Override manual tetap dipertahankan.`);
    });
    /* GENERATE SEMUA SISWA - satu klik, satu mata pelajaran.

       `subjectId` dibaca dari state halaman saat tombol ditekan dan dikunci ke variabel lokal
       sebelum proses berjalan, lalu dipakai juga untuk menggambar ulang. Halaman TIDAK pernah
       berpindah mapel karenanya: pilihan guru tetap seperti semula, dan hasilnya tersimpan pada
       mata pelajaran itu juga. */
    actions.querySelector('[data-generate-all]').onclick=async()=>{
      const mapelDiproses=subjectId;
      const nama=subjects.find(item=>item.id===mapelDiproses)?.name||'';
      if(!await confirmDialog({title:'Generate Semua Siswa',
        message:`Buat deskripsi rapor untuk seluruh siswa pada mata pelajaran ${nama}? Deskripsi yang terkunci dan yang sudah Anda edit sendiri tetap dipertahankan.`,
        confirmText:'Generate Semua'}))return;
      await jalankan(actions.querySelector('[data-generate-all]'),'Memproses…',()=>{
        const hasil=generateAllReportDescriptions(session,mapelDiproses);
        drawAutomatic();
        const catatan=[`${hasil.terisi} dari ${hasil.total} siswa`];
        if(hasil.dilewati.length)catatan.push(`${hasil.dilewati.length} dipertahankan`);
        if(hasil.gagal.length)catatan.push(`${hasil.gagal.length} gagal`);
        toast(`${nama}: ${catatan.join(' · ')}`,hasil.gagal.length?'warning':'success');
      });
    };
    actions.querySelector('[data-save-all-auto]').onclick=async()=>{
      if(!await confirmDialog({title:'Simpan Otomatis Semua Mapel',message:'Hitung Nilai Akhir seluruh mapel aktif, lalu buat dan simpan Deskripsi Rapor untuk setiap siswa yang sudah punya nilai? Override manual, deskripsi terkunci, dan deskripsi yang Anda tulis sendiri tetap dipertahankan.',confirmText:'Proses Semua'}))return;
      await jalankan(actions.querySelector('[data-save-all-auto]'),'Memproses…',()=>{
        const result=saveAllAutomaticReports(session);
        drawAutomatic();
        const catatan=[`${result.scoreCount} nilai dan ${result.descriptionCount} deskripsi tersimpan otomatis`];
        if(result.skippedCount)catatan.push(`${result.skippedCount} dipertahankan atau belum bernilai`);
        if(result.errors.length)catatan.push(`${result.errors.length} belum dapat dibuat — aktifkan Butir CP mapel tersebut pada menu Capaian Pembelajaran`);
        toast(catatan.join(' · '),result.errors.length?'warning':'success');
      });
    };
  }
  function componentsHtml(row){return `<div class="component-pills">${row.components.map(component=>`<span class="${component.score===null?'component-missing':''}" title="${escapeHtml(component.label)} · Bobot ${component.weight}% · ${component.source==='attendance'?'Absensi':'Manual'}"><b>${component.label.split(' ').map(word=>word[0]).join('')}</b>${number(component.score)}${component.source==='attendance'?'<i>A</i>':''}</span>`).join('')}</div>`;}
  function automaticRow(row){
    const saved=getReportScore(session,subjectId,row.studentId);const description=getReportDescription(session,subjectId,row.studentId);
    return `<tr><td><strong>${escapeHtml(row.studentName)}</strong><span>${escapeHtml(row.nis)} · ${escapeHtml(row.nisn)}</span></td><td>${componentsHtml(row)}</td><td>${number(row.rawScore)}</td><td><strong>${number(row.roundedScore,0)}</strong></td><td>${row.kktp}</td><td>${statusBadge(row.completionStatus==='COMPLETE',row.completionLabel)}${row.masteryStatus?`<span>${escapeHtml(row.masteryStatus)}</span>`:''}${saved?.isManualOverride?'<span>Override Manual</span>':''}</td><td><button class="btn btn-light btn-small" data-description data-id="${escapeHtml(row.studentId)}">${description?.text?'Edit Deskripsi':'Buat Deskripsi'}</button>${description?`<span>${description.status==='LOCKED'?'Terkunci':description.status==='EDITED'?'Diedit Guru':'Otomatis'}</span>`:''}</td></tr>`;
  }
  function automaticCard(row){
    const description=getReportDescription(session,subjectId,row.studentId);return `<article class="card report-mobile-card"><div class="student-card-head"><div><h3>${escapeHtml(row.studentName)}</h3><p>${escapeHtml(row.nis)} · ${escapeHtml(row.nisn)}</p></div>${statusBadge(row.completionStatus==='COMPLETE',row.completionLabel)}</div>${componentsHtml(row)}<div class="report-result-grid"><span><b>Mentah</b>${number(row.rawScore)}</span><span><b>Pembulatan</b>${number(row.roundedScore,0)}</span><span><b>KKTP</b>${row.kktp}</span><span><b>Ketuntasan</b>${escapeHtml(row.masteryStatus||'—')}</span></div><button class="btn btn-light btn-small" data-description data-id="${escapeHtml(row.studentId)}">${description?.text?'Edit Deskripsi':'Buat Deskripsi'}</button></article>`;
  }
  function bindDescriptionButtons(){view.querySelectorAll('[data-description]').forEach(button=>button.onclick=()=>openDescription(button.dataset.id));}
  function drawManual(){
    const rows=calculateReportSheet(session,subjectId);actions.innerHTML=`<button class="btn btn-primary" data-save-manual>${icon('save',17)} Simpan Override</button>`;
    if(!rows.length){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa sebelum input manual.</p></section>';actions.querySelector('[data-save-manual]').disabled=true;return;}
    const tableRows=rows.map(row=>{const saved=getReportScore(session,subjectId,row.studentId);return `<tr><td><strong>${escapeHtml(row.studentName)}</strong><span>${escapeHtml(row.nis)} · ${escapeHtml(row.nisn)}</span></td><td>${number(row.roundedScore,0)}<span>${row.completionLabel}</span></td><td><input class="input score-input" type="number" min="0" max="100" step="0.01" data-manual data-id="${escapeHtml(row.studentId)}" value="${saved?.isManualOverride?saved.finalScore:''}" aria-label="Override ${escapeHtml(row.studentName)}"/></td><td>${saved?.isManualOverride?statusBadge(true,`Override ${saved.finalScore}`):'<span class="muted">Belum override</span>'}</td></tr>`;}).join('');
    const cards=rows.map(row=>{const saved=getReportScore(session,subjectId,row.studentId);return `<article class="card report-mobile-card"><div class="student-card-head"><div><h3>${escapeHtml(row.studentName)}</h3><p>Referensi otomatis: ${number(row.roundedScore,0)} · ${row.completionLabel}</p></div></div><div class="field compact-field"><label>Nilai Override 0–100</label><input class="input" type="number" min="0" max="100" step="0.01" data-manual data-id="${escapeHtml(row.studentId)}" value="${saved?.isManualOverride?saved.finalScore:''}" aria-label="Override ${escapeHtml(row.studentName)}"/></div></article>`;}).join('');
    view.innerHTML=`<div class="source-banner warning-banner">Override manual menyimpan nilai otomatis atau nilai tersimpan sebelumnya sebagai referensi.</div><section class="card report-table-card"><div class="table-scroll"><table class="data-table manual-report-table"><thead><tr><th>Siswa</th><th>Referensi Otomatis</th><th>Nilai Override</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table></div></section><div class="report-card-list">${cards}</div>`;bindMirroredInputs('[data-manual]');
    /* Seluruh nilai dikumpulkan dulu lalu ditulis dalam satu commit, bukan satu penyimpanan
   per sel, sehingga simpan satu rombel penuh cepat dan UI tidak membeku. */
    actions.querySelector('[data-save-manual]').onclick=async()=>{
      const values=[...view.querySelectorAll('.report-table-card [data-manual]')].filter(input=>input.value.trim()!=='');
      if(!values.length){toast('Isi minimal satu nilai override.','warning');return;}
      const button=actions.querySelector('[data-save-manual]');
      const label=button.innerHTML;
      button.disabled=true;button.textContent='Menyimpan…';
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      try{
        const hasil=saveManualReportScoresBulk(session,values.map(input=>({subjectId,studentId:input.dataset.id,value:input.value})));
        drawManual();toast(`${hasil.saved} nilai berhasil disimpan sekaligus.`);
      }catch(error){toast(error.message,'error');button.disabled=false;button.innerHTML=label;}
    };
  }
  function bindMirroredInputs(selector){view.querySelectorAll(selector).forEach(input=>input.oninput=()=>view.querySelectorAll(`${selector}[data-id="${CSS.escape(input.dataset.id)}"]`).forEach(other=>{if(other!==input)other.value=input.value;}));}
  function drawImport(){
    actions.innerHTML='';const students=listStudents(session,{classId:session.classId});view.innerHTML=`<section class="card import-report-card"><div class="placeholder-icon">${icon('upload',26)}</div><h2>Import Nilai Rapor Manual</h2><p>Unduh template berisi siswa mapel terpilih, isi Nilai Manual 0–100, lalu upload untuk Preview dan Validasi. Data belum disimpan saat upload.</p><div class="actions"><button class="btn btn-light" data-template>${icon('download',17)} Download Template</button><button class="btn btn-primary" data-upload ${students.length?'':'disabled'}>${icon('upload',17)} Upload CSV</button></div></section>`;
    view.querySelector('[data-template]').onclick=downloadTemplate;view.querySelector('[data-upload]').onclick=()=>{fileInput.value='';fileInput.click();};
  }
  function downloadTemplate(){const blob=new Blob([reportTemplateCsv(session,subjectId)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`TEMPLATE-NILAI-RAPOR-${session.classId}-${subjectId}-${session.semester.split(' ')[0].toUpperCase()}-${session.academicYear.replace('/','-')}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  fileInput.onchange=async()=>{const file=fileInput.files?.[0];if(!file)return;try{openImportPreview(previewReportImport(session,subjectId,await file.text()),file.name);}catch(error){toast(error.message,'error');}};
  function openImportPreview(preview,fileName){
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-extra-wide"><div class="modal-head"><div><h3>Preview Import Nilai Rapor</h3><p>${escapeHtml(fileName)} · ${preview.validCount} valid · ${preview.invalidCount} bermasalah</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="table-scroll import-preview-table"><table class="data-table"><thead><tr><th>Baris</th><th>NIS</th><th>NISN</th><th>Siswa</th><th>Nilai</th><th>Validasi</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${row.rowNumber}</td><td>${escapeHtml(row.nis)}</td><td>${escapeHtml(row.nisn)}</td><td>${escapeHtml(row.studentName)}</td><td>${row.score??'—'}</td><td>${row.valid?'<span class="status-ok">Valid</span>':`<span class="status-error">${escapeHtml(row.errors.join(' '))}</span>`}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions"><button class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" data-commit ${preview.canCommit?'':'disabled'}>Simpan ${preview.validCount} Nilai</button></div></div></div>`);
    document.body.append(modal);const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;modal.querySelector('[data-commit]').onclick=async()=>{if(!preview.canCommit||!await confirmDialog({title:'Konfirmasi Import Nilai',message:`Simpan ${preview.validCount} nilai sebagai override manual?`,confirmText:'Simpan Import'}))return;try{const saved=commitReportImport(session,preview);close();toast(`${saved.length} nilai berhasil diimport.`);}catch(error){toast(error.message,'error');}};
  }
  function openDescription(studentId){
    /* DESKRIPSI RAPOR BERSUMBER BUTIR CP.

       Dulu modal ini menolak terbuka selama belum ada TP aktif, lalu memaksa guru memilih dua
       TP - "capaian terbaik" dan "perlu ditingkatkan" - yang kemudian dikirim sebagai
       objectiveIds sehingga penyusun deskripsi selalu mengambil jalur TP. TP sudah TIDAK LAGI
       menjadi basis generator: tidak ada pilihan TP di sini, tidak ada objectiveIds yang
       dikirim, dan tidak ada pesan yang menyuruh guru memeriksa TP.

       Yang ditampilkan sekarang adalah Butir CP aktif mana saja yang menjadi bahan kalimat,
       supaya guru tahu persis dari mana deskripsi itu berasal. Rapor tetap satu Nilai Akhir per
       mata pelajaran; tidak ada kolom maupun pilihan Teori/Praktik di halaman ini. */
    let butir=[];
    try{butir=listCpButirForSemester(session,subjectId);}catch{butir=[];}
    const current=getReportDescription(session,subjectId,studentId);
    const student=listStudents(session,{classId:session.classId}).find(item=>item.id===studentId);
    const locked=Boolean(current?.locked);
    const daftarButir=butir.map(item=>item.name).join(', ');
    const banner=butir.length
      ? `Deskripsi disusun dari ${butir.length} Butir CP aktif: ${escapeHtml(daftarButir)}. Tingkat capaiannya mengikuti Nilai Akhir dari lima jenis penilaian — tidak ada nilai Teori atau Praktik terpisah di rapor.`
      : 'Belum ada Butir CP aktif pada mata pelajaran ini. Deskripsi disusun dari lingkup kompetensi CP mata pelajaran; aktifkan Butir CP pada menu Capaian Pembelajaran agar kalimatnya menyebut kompetensi yang benar-benar diajarkan.';
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-wide description-modal"><div class="modal-head"><div><h3>Deskripsi Rapor</h3><p>${escapeHtml(student?.name||'')} · ${escapeHtml(subjects.find(subject=>subject.id===subjectId)?.name||'')}</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="description-status">${statusBadge(Boolean(current?.text),current?.status==='LOCKED'?'Terkunci':current?.status==='EDITED'?'Diedit Guru':current?.status==='AUTO'?'Otomatis':'Belum Disimpan')}</div><div class="source-banner" data-sumber-cp>${banner}</div><div class="form-grid"><div class="field form-span-2"><label>Deskripsi</label><textarea class="input" rows="6" maxlength="1500" data-text ${locked?'disabled':''}>${escapeHtml(current?.text||'')}</textarea></div></div><div class="modal-actions"><button class="btn btn-light" data-generate ${locked?'disabled':''}>Generate</button><button class="btn btn-primary" data-save-description ${locked?'disabled':''}>Simpan</button><button class="btn btn-warning" data-lock ${locked?'disabled':''}>Kunci</button></div></div></div>`);
    document.body.append(modal);const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;
    /* Tidak ada objectiveIds yang dikirim: penyusun deskripsi memakai jalur CP/Butir CP. */
    const values=()=>({text:modal.querySelector('[data-text]').value});
    modal.querySelector('[data-generate]').onclick=()=>{try{modal.querySelector('[data-text]').value=generateReportDescription(session,subjectId,studentId,{}).text;toast('Deskripsi otomatis berhasil dibuat.');}catch(error){toast(error.message,'error');}};
    modal.querySelector('[data-save-description]').onclick=()=>{try{saveReportDescription(session,subjectId,studentId,values());close();drawAutomatic();toast('Deskripsi rapor berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    modal.querySelector('[data-lock]').onclick=async()=>{if(!await confirmDialog({title:'Kunci Deskripsi',message:'Deskripsi yang terkunci tidak dapat diedit lagi.',confirmText:'Kunci'}))return;try{lockReportDescription(session,subjectId,studentId);close();drawAutomatic();toast('Deskripsi berhasil dikunci.');}catch(error){toast(error.message,'error');}};
  }
  root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;draw();});root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};draw();return root;
}

const SAVED_MODES=Object.freeze({
  scores:{title:'Cek Nilai Rapor',lead:'Nilai Rapor tersimpan per siswa mengikuti Mapping Mata Pelajaran aktif.'},
  descriptions:{title:'Cek Deskripsi Rapor',lead:'Deskripsi rapor tersimpan per siswa mengikuti Mapping Mata Pelajaran aktif.'}
});

export function renderSavedScores(session,mode='scores'){
  const tampilan=Object.hasOwn(SAVED_MODES,mode)?mode:'scores';const halaman=SAVED_MODES[tampilan];
  const subjects=listActiveSubjects(session);let subjectId='ALL';const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(halaman.title)}</h1><p>${escapeHtml(halaman.lead)}</p></div></div><section class="card module-filter"><div class="field compact-field"><label for="savedSubject">Mata Pelajaran</label><select class="input" id="savedSubject" data-subject><option value="ALL">Semua Mapel Aktif</option>${subjectOptions(subjects,'')}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><div data-list></div></div>`);const host=root.querySelector('[data-list]');
  function draw(){const all=visibleStoredReportRows(getStoredReportRows(session));const rows=all.filter(row=>subjectId==='ALL'||row.subject.id===subjectId);if(!rows.length){host.innerHTML='<section class="card empty-state"><h3>Belum ada data untuk ditampilkan</h3><p>Pastikan Data Siswa dan Mapping Mata Pelajaran tersedia.</p></section>';return;}host.innerHTML=`<section class="card saved-table-card"><div class="table-scroll"><table class="data-table saved-report-table"><thead><tr><th>Siswa</th><th>Mapel</th>${tampilan==='scores'?'<th>Nilai Akhir</th><th>KKTP</th><th>Ketuntasan</th>':'<th>Deskripsi</th>'}<th>Status</th></tr></thead><tbody>${rows.map(row=>`<tr><td><strong>${escapeHtml(row.student.name)}</strong><span>${escapeHtml(row.student.nis)}</span></td><td>${escapeHtml(row.subject.name)}</td>${tampilan==='scores'?`<td><strong>${row.score?.finalScore??'—'}</strong>${row.score?.isManualOverride?'<span>Override Manual</span>':''}</td><td>${row.score?.kktp??getAssessmentSettings(session,row.subject.id).kktp}</td><td>${escapeHtml(row.score?.masteryStatus||'—')}</td>`:`<td><span class="description-cell">${escapeHtml(row.description?.text||'Belum ada deskripsi')}</span></td>`}<td>${statusBadge(row.complete,row.complete?'Lengkap':'Belum Lengkap')}</td></tr>`).join('')}</tbody></table></div></section><div class="saved-card-list">${rows.map(row=>`<article class="card saved-mobile-card"><div class="student-card-head"><div><h3>${escapeHtml(row.student.name)}</h3><p>${escapeHtml(row.subject.name)}</p></div>${statusBadge(row.complete,row.complete?'Lengkap':'Belum Lengkap')}</div><div class="report-result-grid"><span><b>Nilai Akhir</b>${row.score?.finalScore??'—'}</span><span><b>KKTP</b>${row.score?.kktp??getAssessmentSettings(session,row.subject.id).kktp}</span><span><b>Ketuntasan</b>${escapeHtml(row.score?.masteryStatus||'—')}</span><span><b>Deskripsi</b>${row.description?.status==='LOCKED'?'Terkunci':row.description?.text?'Tersimpan':'Belum ada'}</span></div><p class="saved-description">${escapeHtml(row.description?.text||'Belum ada deskripsi.')}</p></article>`).join('')}</div>`;}
  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};draw();return root;
}

const ASSESSMENT_CHECK_MODES=Object.freeze({
  status:{title:'Status Penilaian',lead:'Periksa kelengkapan nilai dan deskripsi per mata pelajaran aktif.'},
  achievement:{title:'Capaian Nilai Rapor',lead:'Rata-rata, nilai tertinggi, dan nilai terendah per mata pelajaran aktif.'},
  graph:{title:'Grafik Nilai Rapor',lead:'Ringkasan digital kelengkapan dan rata-rata Nilai Rapor tersimpan.'}
});

function assessmentOverall(summaries){return summaries.length?Math.round(summaries.reduce((sum,item)=>sum+item.percentage,0)/summaries.length):0;}

export function renderAssessmentCheck(session,mode='status'){
  const tampilan=Object.hasOwn(ASSESSMENT_CHECK_MODES,mode)?mode:'status';const halaman=ASSESSMENT_CHECK_MODES[tampilan];
  let selectedId=listActiveSubjects(session)[0]?.id||'';const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(halaman.title)}</h1><p>${escapeHtml(halaman.lead)}</p></div></div><section class="card completion-gauge-row" data-gauge></section><div data-subjects></div><section class="card missing-card" data-missing></section></div>`);const subjectsHost=root.querySelector('[data-subjects]');const missingHost=root.querySelector('[data-missing]');
  if(tampilan!=='status'){
    const summaries=getCompletionSummary(session);
    const statistik=getReportStatistics(session);
    missingHost.classList.add('hidden');
    if(tampilan==='graph'){
      root.querySelector('[data-gauge]').innerHTML=`${digitalGauge(assessmentOverall(summaries),{label:'Kelengkapan',tone:'green',caption:'Nilai dan deskripsi'})}${digitalGauge(statistik.overall.average??0,{label:'Rata-rata',tone:'blue',caption:`${statistik.overall.count} nilai tersimpan`})}`;
      subjectsHost.innerHTML='';
      return root;
    }
    root.querySelector('[data-gauge]').innerHTML=digitalGauge(statistik.overall.average??0,{label:'Rata-rata',tone:'blue',caption:`${statistik.overall.count} nilai tersimpan`});
    subjectsHost.innerHTML=statistik.subjects.length?`<section class="card saved-table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Mata Pelajaran</th><th>Nilai Tersimpan</th><th>Rata-rata</th><th>Tertinggi</th><th>Terendah</th></tr></thead><tbody>${statistik.subjects.map(item=>`<tr><td><strong>${escapeHtml(item.subject.name)}</strong></td><td>${item.count}</td><td><strong>${item.count?item.average:'—'}</strong></td><td>${item.count?item.highest:'—'}</td><td>${item.count?item.lowest:'—'}</td></tr>`).join('')}</tbody></table></div></section>`:'<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3></section>';
    return root;
  }
  function draw(){const summaries=getCompletionSummary(session);if(!summaries.length){subjectsHost.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3></section>';missingHost.classList.add('hidden');return;}if(!summaries.some(item=>item.subject.id===selectedId))selectedId=summaries[0].subject.id;subjectsHost.innerHTML=`<div class="completion-grid">${summaries.map(item=>`<button class="card completion-subject ${item.subject.id===selectedId?'selected':''}" data-id="${escapeHtml(item.subject.id)}"><div class="completion-head"><strong>${escapeHtml(item.subject.name)}</strong>${statusBadge(item.status==='COMPLETE',item.status==='COMPLETE'?'Lengkap':'Belum Lengkap')}</div><div class="completion-numbers"><span><b>${item.scoreComplete}/${item.studentCount}</b>Nilai lengkap</span><span><b>${item.descriptionComplete}/${item.studentCount}</b>Deskripsi lengkap</span><span><b>${item.percentage}%</b>Persentase</span></div><div class="bar"><span style="width:${item.percentage}%"></span></div></button>`).join('')}</div>`;subjectsHost.querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>{selectedId=button.dataset.id;draw();});const selected=summaries.find(item=>item.subject.id===selectedId);missingHost.classList.remove('hidden');missingHost.innerHTML=`<div class="section-head"><div><h3>Siswa Belum Lengkap</h3><p>${escapeHtml(selected.subject.name)}</p></div><span class="badge badge-a">${selected.missing.length} siswa</span></div>${selected.missing.length?`<div class="missing-list">${selected.missing.map(item=>`<div><strong>${escapeHtml(item.student.name)}</strong><span>${[item.missingScore?'Nilai rapor':'',item.missingDescription?'Deskripsi':''].filter(Boolean).join(' & ')}</span></div>`).join('')}</div>`:'<div class="empty-inline">Seluruh siswa sudah memiliki nilai dan deskripsi.</div>'}`;}
  draw();root.querySelector('[data-gauge]').innerHTML=digitalGauge(assessmentOverall(getCompletionSummary(session)),{label:'Kelengkapan',tone:'green',caption:'Nilai dan deskripsi'});return root;
}
