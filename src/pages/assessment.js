import { ASSESSMENT_TYPES, getAssessmentSheet, saveAssessmentScores } from '../services/assessment.js';
import { fillAllAssessmentScores } from '../services/assessment-bulk.js';
import { attendanceDerivedSheet, getDailyAttendanceMode } from '../services/report.js';
import { listActiveSubjects } from '../services/subjects.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

function formatAverage(value){return value===null?'—':Number(value.toFixed(2)).toLocaleString('id-ID');}

export function renderAssessment(session){
  const subjects=listActiveSubjects(session);let subjectId=subjects[0]?.id||'';let assessmentType=ASSESSMENT_TYPES[0].id;
  const root=el(`<div><div class="page-head"><div><h1>Penilaian</h1><p>Input nilai 0–100 untuk siswa Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div><div class="actions"><button class="btn btn-primary" data-save>${icon('save',17)} Simpan Nilai</button></div></div><section class="card assessment-filter"><div class="field compact-field"><label for="assessmentSubject">Mata Pelajaran Aktif</label><select class="input" id="assessmentSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div><div class="field compact-field"><label for="assessmentType">Jenis Penilaian</label><select class="input" id="assessmentType" data-type>${ASSESSMENT_TYPES.map(type=>`<option value="${type.id}">${escapeHtml(type.label)}</option>`).join('')}</select></div><div class="field compact-field"><label for="assessmentFillTarget">Sasaran Isi Semua Nilai</label><select class="input" id="assessmentFillTarget" data-fill-target><option value="">Semua Siswa</option></select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section data-summary></section><div data-list></div></div>`);
  root.querySelector('.page-head .actions').insertAdjacentHTML('afterbegin','<button class="btn btn-light" data-fill-all>Isi Semua Nilai</button>');
  const listHost=root.querySelector('[data-list]');const summaryHost=root.querySelector('[data-summary]');const saveButton=root.querySelector('[data-save]');
  if(!subjects.length){root.querySelector('[data-subject]').disabled=true;root.querySelector('[data-type]').disabled=true;saveButton.disabled=true;listHost.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';return root;}

  function draw(){
    const attendanceMode=assessmentType==='daily'&&getDailyAttendanceMode(session,subjectId);const sheet=attendanceMode?attendanceDerivedSheet(session,subjectId):getAssessmentSheet(session,subjectId,assessmentType);drawSummary(sheet.average,sheet.pendingCount,sheet.filledCount,sheet.rows.length,attendanceMode);
    saveButton.disabled=!sheet.rows.length||attendanceMode;saveButton.innerHTML=attendanceMode?`${icon('calendar',17)} Dihitung dari Absensi`:`${icon('save',17)} Simpan Nilai`;
    const target=root.querySelector('[data-fill-target]');const chosen=target.value;
    target.innerHTML=`<option value="">Semua Siswa</option>${sheet.rows.map(row=>`<option value="${escapeHtml(row.studentId)}">${escapeHtml(row.name)}</option>`).join('')}`;
    if(sheet.rows.some(row=>row.studentId===chosen))target.value=chosen;
    if(!sheet.rows.length){listHost.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan Data Siswa sebelum mengisi Penilaian.</p></section>';return;}
    const rows=sheet.rows.map((row,index)=>`<tr><td>${index+1}</td><td><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.nis)} · ${escapeHtml(row.nisn)}</span></td><td><input class="input score-input" type="number" min="0" max="100" step="0.01" data-score data-id="${escapeHtml(row.studentId)}" value="${row.score??''}" aria-label="Nilai ${escapeHtml(row.name)}" ${attendanceMode?'disabled':''}/></td><td><span class="score-state ${row.saved?'status-ok':'muted'}" data-state>${attendanceMode?(row.saved?'Dari Absensi':'Belum ada absensi'):(row.saved?'Tersimpan':'Belum diisi')}</span></td></tr>`).join('');
    const cards=sheet.rows.map((row,index)=>`<article class="card assessment-mobile-card"><div class="assessment-student"><span>${index+1}</span><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.nis)} · ${escapeHtml(row.nisn)}</small></div></div><div class="score-mobile-input"><label>Nilai 0–100</label><input class="input score-input" type="number" min="0" max="100" step="0.01" data-score data-id="${escapeHtml(row.studentId)}" value="${row.score??''}" aria-label="Nilai ${escapeHtml(row.name)}" ${attendanceMode?'disabled':''}/><span class="score-state ${row.saved?'status-ok':'muted'}" data-state>${attendanceMode?(row.saved?'Dari Absensi':'Belum ada absensi'):(row.saved?'Tersimpan':'Belum diisi')}</span></div></article>`).join('');
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
  saveButton.onclick=()=>{
    const values=Object.fromEntries(allInputs().map(input=>[input.dataset.id,input.value]));
    try{saveAssessmentScores(session,subjectId,assessmentType,values);draw();toast('Nilai berhasil disimpan. Nilai kosong tetap tidak dinilai.');}catch(error){toast(error.message,'error');}
  };
  root.querySelector('[data-fill-all]').onclick=()=>{
    const target=root.querySelector('[data-fill-target]');
    const studentId=target.value||null;
    const namaSasaran=studentId?target.options[target.selectedIndex].textContent:'semua siswa';
    const value=window.prompt(`Nilai yang diterapkan ke ${namaSasaran} pada lima jenis penilaian:`, '80');
    if(value===null)return;
    try{
      const result=fillAllAssessmentScores(session,subjectId,value,{studentId});
      draw();
      const sasaran=studentId?`${namaSasaran} saja`:`${result.studentCount} siswa`;
      toast(result.dailyFromAttendance?`Nilai massal disimpan untuk ${sasaran}. Penilaian Harian dilewati karena memakai Absensi.`:`Nilai massal berhasil disimpan ke lima jenis penilaian untuk ${sasaran}.`);
    }catch(error){toast(error.message,'error');}
  };
  draw();return root;
}
