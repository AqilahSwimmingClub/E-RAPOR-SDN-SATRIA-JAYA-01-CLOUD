import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentScores } from '../services/assessment.js';
import { fillAllAssessmentScores } from '../services/assessment-bulk.js';
import { assessmentTemplateFilename, assessmentTemplateWorkbook, commitAssessmentImport, previewAssessmentImport } from '../services/assessment-import.js';
import { pickFile, saveFile } from '../services/file-io.js';
import { attendanceDerivedSheet, getDailyAttendanceMode } from '../services/report.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

function formatAverage(value){return value===null?'—':Number(value.toFixed(2)).toLocaleString('id-ID');}

/* window.prompt tidak tersedia pada Electron sehingga tombol Isi Semua Nilai seolah tidak
   dapat diklik. Dialog di dalam aplikasi dipakai agar berfungsi sama pada Web, Android,
   dan Windows. */
function askScore({title,message,defaultValue='80'}){
  return new Promise(resolve=>{
    const modal=el(`<div class="modal-backdrop"><form class="modal-card" role="dialog" aria-modal="true"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p><div class="field"><label for="bulkScoreValue">Nilai 0–100</label><input class="input" id="bulkScoreValue" type="number" min="0" max="100" step="0.01" value="${escapeHtml(defaultValue)}" required autofocus/></div><div class="login-error hidden" data-error></div><div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button><button type="submit" class="btn btn-primary" data-ok>Terapkan</button></div></form></div>`);
    document.body.append(modal);
    const input=modal.querySelector('input');
    const tutup=value=>{modal.remove();resolve(value);};
    modal.querySelector('[data-cancel]').onclick=()=>tutup(null);
    modal.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      const nilai=Number(input.value);
      if(input.value.trim()===''||!Number.isFinite(nilai)||nilai<0||nilai>100){
        const box=modal.querySelector('[data-error]');box.textContent='Nilai harus berupa angka 0 sampai 100.';box.classList.remove('hidden');return;
      }
      tutup(input.value);
    };
    setTimeout(()=>input.focus(),0);
  });
}

export function renderAssessment(session){
  const subjects=listActiveSubjects(session);let subjectId=subjects[0]?.id||'';let assessmentType=ASSESSMENT_TYPES[0].id;
  const root=el(`<div><div class="page-head"><div><h1>Penilaian</h1><p>Input nilai 0–100 untuk siswa Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div><div class="actions"><button class="btn btn-primary" data-save>${icon('save',17)} Simpan Nilai</button></div></div><section class="card assessment-filter"><div class="field compact-field"><label for="assessmentSubject">Mata Pelajaran Aktif</label><select class="input" id="assessmentSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div><div class="field compact-field"><label for="assessmentType">Jenis Penilaian</label><select class="input" id="assessmentType" data-type>${ASSESSMENT_TYPES.map(type=>`<option value="${type.id}">${escapeHtml(type.label)}</option>`).join('')}</select></div><div class="field compact-field"><label for="assessmentFillTarget">Tampilkan Siswa</label><select class="input" id="assessmentFillTarget" data-fill-target><option value="">Semua Siswa</option></select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section data-summary></section><div data-list></div></div>`);
  root.querySelector('.page-head .actions').insertAdjacentHTML('afterbegin','<button class="btn btn-light" data-template>Download Template Nilai</button><button class="btn btn-light" data-import>Import Nilai</button><button class="btn btn-light" data-fill-all>Isi Semua Nilai</button>');
  const listHost=root.querySelector('[data-list]');const summaryHost=root.querySelector('[data-summary]');const saveButton=root.querySelector('[data-save]');
  if(!subjects.length){root.querySelector('[data-subject]').disabled=true;root.querySelector('[data-type]').disabled=true;saveButton.disabled=true;root.querySelector('[data-template]').disabled=true;root.querySelector('[data-import]').disabled=true;listHost.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';return root;}

  /* Template Nilai membawa seluruh siswa rombel aktif beserta nilai yang sudah tersimpan pada
     mapel yang sedang dipilih, lalu hasil editnya diimpor kembali lewat preview. */
  async function unduhTemplate(){
    try{
      const jumlah=getAssessmentSheet(session,subjectId,ASSESSMENT_TYPES[0].id).rows.length;
      await saveFile({name:assessmentTemplateFilename(session,subjectId),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:assessmentTemplateWorkbook(session,subjectId)});
      toast(jumlah?`Template nilai berisi ${jumlah} siswa untuk mapel terpilih siap diisi.`:'Template nilai kosong berhasil diunduh.');
    }catch(error){toast(error.message,'error');}
  }
  function bukaPreviewImport(preview,fileName){
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-extra-wide"><div class="modal-head"><div><h3>Preview Import Nilai</h3><p>${escapeHtml(fileName)} · ${escapeHtml(preview.subjectName)} · Rombel ${escapeHtml(preview.classId)} · ${preview.rows.length} baris · ${preview.validCount} valid · ${preview.newScoreCount} nilai baru · ${preview.updatedScoreCount} nilai diperbarui · ${preview.invalidCount} bermasalah</p></div><button class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="table-scroll import-preview-table"><table class="data-table"><thead><tr><th>Baris</th><th>Siswa</th><th>NIS</th>${ASSESSMENT_TYPES.map(type=>`<th>${escapeHtml(type.label)}</th>`).join('')}<th>Validasi</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><td>${row.rowNumber}</td><td>${escapeHtml(row.studentName)}</td><td>${escapeHtml(row.nis||'—')}</td>${ASSESSMENT_TYPES.map(type=>`<td>${Object.hasOwn(row.scores,type.id)&&row.scores[type.id]!==null?row.scores[type.id]:'—'}</td>`).join('')}<td>${row.valid?'<span class="status-ok">Valid</span>':`<span class="status-error">${escapeHtml(row.errors.join(' '))}</span>`}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions"><button class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" data-commit ${preview.canCommit?'':'disabled'}>Simpan ${preview.filledScoreCount} Nilai</button></div></div></div>`);
    document.body.append(modal);
    const tutup=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=tutup;modal.querySelector('[data-cancel]').onclick=tutup;
    modal.querySelector('[data-commit]').onclick=async()=>{
      if(!preview.canCommit)return;
      if(!await confirmDialog({title:'Konfirmasi Import Nilai',message:`Simpan ${preview.filledScoreCount} nilai (${preview.newScoreCount} baru, ${preview.updatedScoreCount} diperbarui) untuk ${preview.subjectName}?`,confirmText:'Simpan Nilai'}))return;
      try{commitAssessmentImport(session,preview);tutup();draw();toast(`Import nilai selesai: ${preview.newScoreCount} nilai baru, ${preview.updatedScoreCount} diperbarui.`);}catch(error){toast(error.message,'error');}
    };
  }
  async function importNilai(){
    try{
      const file=await pickFile({accept:'.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      if(!file)return;
      bukaPreviewImport(previewAssessmentImport(session,subjectId,file.arrayBuffer),file.name);
    }catch(error){toast(error.message,'error');}
  }
  root.querySelector('[data-template]').onclick=unduhTemplate;
  root.querySelector('[data-import]').onclick=importNilai;

  function draw(){
    const attendanceMode=assessmentType==='daily'&&getDailyAttendanceMode(session,subjectId);const sheet=attendanceMode?attendanceDerivedSheet(session,subjectId):getAssessmentSheet(session,subjectId,assessmentType);drawSummary(sheet.average,sheet.pendingCount,sheet.filledCount,sheet.rows.length,attendanceMode);
    saveButton.disabled=!sheet.rows.length||attendanceMode;saveButton.innerHTML=attendanceMode?`${icon('calendar',17)} Dihitung dari Absensi`:`${icon('save',17)} Simpan Nilai`;
    const target=root.querySelector('[data-fill-target]');const chosen=target.value;
    target.innerHTML=`<option value="">Semua Siswa</option>${sheet.rows.map(row=>`<option value="${escapeHtml(row.studentId)}">${escapeHtml(row.name)}</option>`).join('')}`;
    if(sheet.rows.some(row=>row.studentId===chosen))target.value=chosen;
    /* Memilih satu siswa menampilkan HANYA siswa itu. Nilai tersimpan tidak tersentuh karena
       penyaringan hanya memengaruhi tampilan. */
    const dipilih=target.value;
    const tampil=dipilih?sheet.rows.filter(row=>row.studentId===dipilih):sheet.rows;
    if(!tampil.length&&sheet.rows.length){listHost.innerHTML='<section class="card empty-state"><h3>Siswa tidak ditemukan</h3><p>Pilih siswa lain atau kembali ke Semua Siswa.</p></section>';return;}
    if(!sheet.rows.length){listHost.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan Data Siswa sebelum mengisi Penilaian.</p></section>';return;}
    const rows=tampil.map((row,index)=>`<tr><td>${index+1}</td><td><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.nis)} · ${escapeHtml(row.nisn)}</span></td><td><input class="input score-input" type="number" min="0" max="100" step="0.01" data-score data-id="${escapeHtml(row.studentId)}" value="${row.score??''}" aria-label="Nilai ${escapeHtml(row.name)}" ${attendanceMode?'disabled':''}/></td><td><span class="score-state ${row.saved?'status-ok':'muted'}" data-state>${attendanceMode?(row.saved?'Dari Absensi':'Belum ada absensi'):(row.saved?'Tersimpan':'Belum diisi')}</span></td></tr>`).join('');
    const cards=tampil.map((row,index)=>`<article class="card assessment-mobile-card"><div class="assessment-student"><span>${index+1}</span><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.nis)} · ${escapeHtml(row.nisn)}</small></div></div><div class="score-mobile-input"><label>Nilai 0–100</label><input class="input score-input" type="number" min="0" max="100" step="0.01" data-score data-id="${escapeHtml(row.studentId)}" value="${row.score??''}" aria-label="Nilai ${escapeHtml(row.name)}" ${attendanceMode?'disabled':''}/><span class="score-state ${row.saved?'status-ok':'muted'}" data-state>${attendanceMode?(row.saved?'Dari Absensi':'Belum ada absensi'):(row.saved?'Tersimpan':'Belum diisi')}</span></div></article>`).join('');
    listHost.innerHTML=`<section class="card assessment-table-card"><div class="table-scroll"><table class="data-table assessment-table"><thead><tr><th>No.</th><th>Siswa</th><th>Nilai 0–100</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section><div class="assessment-card-list">${cards}</div>`;
    bindInputs();
  }
  function drawSummary(average,pending,filled,total,attendanceMode=false){
    summaryHost.innerHTML=`${attendanceMode?'<div class="source-banner">Penilaian Harian dihitung dari absensi menggunakan konversi terpusat. Data nilai manual tetap tersimpan terpisah.</div>':''}<div class="assessment-summary"><article class="stat-card"><div class="stat-label">Rata-rata Kelas</div><div class="stat-value" data-average>${formatAverage(average)}</div><div class="stat-foot">Nilai kosong tidak dihitung</div></article><article class="stat-card"><div class="stat-label">Sudah Dinilai</div><div class="stat-value" data-filled>${filled}</div><div class="stat-foot">dari ${total} siswa</div></article><article class="stat-card"><div class="stat-label">Belum Dinilai</div><div class="stat-value" data-pending>${pending}</div><div class="stat-foot">nilai masih kosong</div></article></div>`;
  }
  function allInputs(){return [...listHost.querySelectorAll('.assessment-table-card [data-score]')];}
  function updateLiveSummary(){
    const inputs=allInputs();const filled=inputs.map(input=>input.value.trim()).filter(Boolean).map(Number).filter(value=>Number.isFinite(value)&&value>=0&&value<=100);
    const average=filled.length?filled.reduce((sum,value)=>sum+value,0)/filled.length:null;drawSummary(average,inputs.length-filled.length,filled.length,inputs.length);
  }
  function bindInputs(){
    listHost.querySelectorAll('[data-score]').forEach(input=>input.oninput=()=>{
      const matching=[...listHost.querySelectorAll(`[data-score][data-id="${CSS.escape(input.dataset.id)}"]`)];matching.forEach(other=>{if(other!==input)other.value=input.value;const state=other.parentElement.parentElement.querySelector('[data-state]')||other.parentElement.querySelector('[data-state]');if(state){state.textContent=input.value.trim()===''?'Belum diisi':'Belum disimpan';state.className='score-state muted';}});updateLiveSummary();
    });
  }
  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};root.querySelector('[data-type]').onchange=event=>{assessmentType=event.target.value;draw();};
root.querySelector('[data-fill-target]').onchange=()=>draw();
  saveButton.onclick=()=>{
    const values=Object.fromEntries(allInputs().map(input=>[input.dataset.id,input.value]));
    try{saveAssessmentScores(session,subjectId,assessmentType,values);draw();toast('Nilai berhasil disimpan. Nilai kosong tetap tidak dinilai.');}catch(error){toast(error.message,'error');}
  };
  /* Sasaran mengikuti siswa yang sedang tampil: satu siswa terpilih hanya mengisi siswa itu,
     pilihan Semua Siswa mengisi seluruh siswa rombel. */
  const fillButton=root.querySelector('[data-fill-all]');
  fillButton.onclick=async()=>{
    const target=root.querySelector('[data-fill-target]');
    const studentId=target.value||null;
    const namaSasaran=studentId?target.options[target.selectedIndex].textContent:'semua siswa';
    const value=await askScore({title:'Isi Semua Nilai',message:`Nilai berikut diterapkan ke ${namaSasaran} pada lima jenis penilaian mapel ini.`});
    if(value===null)return;
    const label=fillButton.textContent;
    fillButton.disabled=true;fillButton.textContent='Mengisi…';
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    try{
      const result=fillAllAssessmentScores(session,subjectId,value,{studentId});
      draw();
      const sasaran=studentId?`${namaSasaran} saja`:`${result.studentCount} siswa`;
      toast(result.dailyFromAttendance?`Nilai massal disimpan untuk ${sasaran}. Penilaian Harian dilewati karena memakai Absensi.`:`Nilai massal berhasil disimpan ke lima jenis penilaian untuk ${sasaran}.`);
    }catch(error){toast(error.message,'error');}
    finally{fillButton.disabled=false;fillButton.textContent=label;}
  };
  draw();return root;
}
