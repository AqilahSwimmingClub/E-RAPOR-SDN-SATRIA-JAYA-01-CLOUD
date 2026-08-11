import { ASSESSMENT_TYPES, getAssessmentSettings, resetAssessmentSettings, saveAssessmentSettings } from '../services/assessment.js';
import { ATTENDANCE_CONVERSION_DEFAULT, getAttendanceConversion, getDailyAttendanceMode, resetAttendanceConversion, saveAttendanceConversion, saveDailyAttendanceMode } from '../services/report.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export function renderWeights(session){
  const subjects=listActiveSubjects(session);let subjectId=subjects[0]?.id||'';
  const root=el(`<div>
    <div class="page-head"><div><h1>Bobot Penilaian & KKTP</h1><p>Atur bobot dan KKTP per mata pelajaran untuk Kelas ${escapeHtml(session.classId)} · ${escapeHtml(session.semester)}.</p></div><div class="actions"><button class="btn btn-light" data-reset>${icon('rotate',17)} Reset Default</button><button class="btn btn-primary" data-save>${icon('save',17)} Simpan Bobot</button></div></div>
    <section class="card module-filter"><div class="field compact-field"><label for="weightSubject">Mata Pelajaran Aktif</label><select class="input" id="weightSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
    <div data-editor></div>
  </div>`);
  const editor=root.querySelector('[data-editor]');const saveButton=root.querySelector('[data-save]');const resetButton=root.querySelector('[data-reset]');
  if(!subjects.length){
    root.querySelector('[data-subject]').disabled=true;saveButton.disabled=true;resetButton.disabled=true;
    editor.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';
    return root;
  }

  function draw(){
    const settings=getAssessmentSettings(session,subjectId);const conversion=getAttendanceConversion(session);const dailyMode=getDailyAttendanceMode(session,subjectId);
    editor.innerHTML=`<section class="card weights-card"><div class="section-head"><div><h3>${escapeHtml(subjects.find(subject=>subject.id===subjectId)?.name||'')}</h3><p>Seluruh bobot harus berjumlah tepat 100%.</p></div><div class="weight-total" data-total><span>Total Bobot</span><strong>100%</strong></div></div><div class="weight-grid">${ASSESSMENT_TYPES.map(type=>`<div class="weight-item"><label for="weight-${type.id}">${escapeHtml(type.label)}</label><div class="number-suffix"><input class="input" type="number" min="0" max="100" step="0.01" id="weight-${type.id}" data-weight="${type.id}" value="${settings[type.id]}"/><span>%</span></div></div>`).join('')}</div><div class="kktp-panel"><div><h3>KKTP Mata Pelajaran</h3><p>Kriteria Ketercapaian Tujuan Pembelajaran untuk mapel terpilih.</p></div><div class="number-suffix kktp-input"><input class="input" type="number" min="0" max="100" step="0.01" data-kktp value="${settings.kktp}"/><span>nilai</span></div></div><div class="daily-source-panel"><div><h3>Penilaian Harian dari Absensi</h3><p>ON menggunakan hasil konversi kehadiran. Nilai manual dan data absensi asli tidak diubah.</p></div><label class="switch"><input type="checkbox" data-daily-mode ${dailyMode?'checked':''}/> ${dailyMode?'ON':'OFF'}</label></div><div class="attendance-conversion"><div class="section-head"><div><h3>Konversi Kehadiran Terpusat</h3><p>Berlaku untuk semua mapel yang mengaktifkan opsi di atas pada scope ini.</p></div><button class="btn btn-light btn-small" data-reset-conversion>${icon('rotate',15)} Reset Konversi</button></div><div class="conversion-grid">${Object.keys(ATTENDANCE_CONVERSION_DEFAULT).map(status=>`<div class="weight-item"><label>${status}</label><div class="number-suffix"><input class="input" type="number" min="0" max="100" step="0.01" data-conversion="${status}" value="${conversion[status]}"/><span>nilai</span></div></div>`).join('')}</div></div><div class="login-error hidden" data-error></div></section>`;
    editor.querySelectorAll('[data-weight]').forEach(input=>input.oninput=updateTotal);updateTotal();
    editor.querySelector('[data-daily-mode]').onchange=event=>{event.target.parentElement.lastChild.textContent=event.target.checked?' ON':' OFF';};
    editor.querySelector('[data-reset-conversion]').onclick=async()=>{if(!await confirmDialog({title:'Reset Konversi Kehadiran',message:'Kembalikan Hadir 100, Sakit 80, Izin 80, dan Alpa 0?',confirmText:'Reset'}))return;resetAttendanceConversion(session);draw();toast('Konversi kehadiran dikembalikan ke default.','warning');};
  }
  function formValue(){
    const result={kktp:editor.querySelector('[data-kktp]').value};
    editor.querySelectorAll('[data-weight]').forEach(input=>{result[input.dataset.weight]=input.value;});return result;
  }
  function updateTotal(){
    const total=[...editor.querySelectorAll('[data-weight]')].reduce((sum,input)=>sum+(Number(input.value)||0),0);
    const valid=Math.abs(total-100)<0.000001;const totalNode=editor.querySelector('[data-total]');
    totalNode.className=`weight-total ${valid?'weight-valid':'weight-invalid'}`;totalNode.querySelector('strong').textContent=`${Number(total.toFixed(2))}%`;saveButton.disabled=!valid;
  }
  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};
  saveButton.onclick=()=>{
    const errorBox=editor.querySelector('[data-error]');errorBox.classList.add('hidden');
    try{saveAssessmentSettings(session,subjectId,formValue());saveDailyAttendanceMode(session,subjectId,editor.querySelector('[data-daily-mode]').checked);saveAttendanceConversion(session,Object.fromEntries([...editor.querySelectorAll('[data-conversion]')].map(input=>[input.dataset.conversion,input.value])));draw();toast('Bobot, KKTP, dan pengaturan absensi berhasil disimpan.');}
    catch(error){errorBox.textContent=error.message;errorBox.classList.remove('hidden');toast(error.message,'error');}
  };
  resetButton.onclick=async()=>{
    if(!await confirmDialog({title:'Reset Bobot & KKTP',message:'Kembalikan bobot menjadi 30%, 20%, 20%, 15%, 15% dan KKTP menjadi 75 untuk mata pelajaran ini?',confirmText:'Reset'}))return;
    resetAssessmentSettings(session,subjectId);saveDailyAttendanceMode(session,subjectId,false);draw();toast('Bobot, KKTP, dan sumber Penilaian Harian dikembalikan ke default.','warning');
  };
  draw();return root;
}
