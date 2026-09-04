import { ASSESSMENT_TYPES, getAssessmentSettings, resetAssessmentSettings, saveAllAssessmentSettings, saveAssessmentSettings } from '../services/assessment.js';
import { defaultReportRubric, NILAI_MAKSIMUM, NILAI_MINIMUM, normalizeReportRubric,
  REPORT_CATEGORIES } from '../services/report-rubric.js';
import { ATTENDANCE_CONVERSION_DEFAULT, getAttendanceConversion, getDailyAttendanceMode, resetAttendanceConversion, saveAttendanceConversion, saveDailyAttendanceMode } from '../services/report.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export function renderWeights(session){
  const subjects=listActiveSubjects(session);let subjectId=subjects[0]?.id||'';
  const root=el(`<div>
    <div class="page-head"><div><h1>Bobot Penilaian & KKTP</h1><p>Atur bobot, KKTP, dan rubrik kategori Deskripsi Rapor per mata pelajaran untuk Kelas ${escapeHtml(session.classId)} · ${escapeHtml(session.semester)}.</p></div><div class="actions"><button class="btn btn-light" data-reset>${icon('rotate',17)} Reset Default</button><button class="btn btn-primary" data-save>${icon('save',17)} Simpan Bobot</button></div></div>
    <div class="report-tabs weights-tabs"><button class="tab active" data-wtab="single">Per Mata Pelajaran</button><button class="tab" data-wtab="all">Semua Mapel Sekaligus</button></div><div data-single-view><section class="card module-filter"><div class="field compact-field"><label for="weightSubject">Mata Pelajaran Aktif</label><select class="input" id="weightSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
    <div data-editor></div></div><div data-all-view class="hidden"></div>
  </div>`);
  const editor=root.querySelector('[data-editor]');const saveButton=root.querySelector('[data-save]');const resetButton=root.querySelector('[data-reset]');
  if(!subjects.length){
    root.querySelector('[data-subject]').disabled=true;saveButton.disabled=true;resetButton.disabled=true;
    editor.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';
    return root;
  }

    const allView=root.querySelector('[data-all-view]');const singleView=root.querySelector('[data-single-view]');
  function drawAll(){
    const baris=subjects.map(subject=>({subject,settings:getAssessmentSettings(session,subject.id)}));
    allView.innerHTML=`<section class="card weights-bulk-card"><div class="section-head"><div><h3>Bobot & KKTP Seluruh Mata Pelajaran</h3><p>Ubah semua bobot lebih dulu, lalu simpan sekali. Total bobot tiap mapel harus tepat 100%.</p></div><span class="badge badge-active">${baris.length} mapel</span></div><div class="table-scroll"><table class="data-table weights-bulk-table"><thead><tr><th>Mata Pelajaran</th>${ASSESSMENT_TYPES.map(type=>`<th>${escapeHtml(type.label)}</th>`).join('')}<th>Total</th><th>KKTP</th></tr></thead><tbody>${baris.map(({subject,settings})=>`<tr data-row="${escapeHtml(subject.id)}"><td><strong>${escapeHtml(subject.name)}</strong><span>Kelompok ${escapeHtml(subject.group)}</span></td>${ASSESSMENT_TYPES.map(type=>`<td><input class="input score-input" type="number" min="0" max="100" data-w="${type.id}" value="${Number(settings[type.id])}"/></td>`).join('')}<td><b data-total>0</b></td><td><input class="input score-input" type="number" min="0" max="100" data-kktp value="${Number(settings.kktp)}"/></td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn btn-primary" data-save-all>${icon('save',17)} Simpan Semua Bobot</button></div></section>`;
    const hitung=row=>{const total=[...row.querySelectorAll('[data-w]')].reduce((sum,input)=>sum+(Number(input.value)||0),0);const cell=row.querySelector('[data-total]');cell.textContent=`${total}%`;cell.className=total===100?'status-ok':'status-error';return total;};
    const rows=[...allView.querySelectorAll('[data-row]')];
    rows.forEach(row=>{hitung(row);row.querySelectorAll('[data-w]').forEach(input=>input.oninput=()=>hitung(row));});
    allView.querySelector('[data-save-all]').onclick=()=>{
      const entri=rows.map(row=>({subjectId:row.dataset.row,kktp:row.querySelector('[data-kktp]').value,
        ...Object.fromEntries([...row.querySelectorAll('[data-w]')].map(input=>[input.dataset.w,input.value]))}));
      try{const hasil=saveAllAssessmentSettings(session,entri);drawAll();draw();toast(`Bobot dan KKTP ${hasil.length} mata pelajaran berhasil disimpan.`);}
      catch(error){toast(error.message,'error');}
    };
  }
  root.querySelectorAll('[data-wtab]').forEach(button=>button.onclick=()=>{
    const semua=button.dataset.wtab==='all';
    root.querySelectorAll('[data-wtab]').forEach(item=>item.classList.toggle('active',item===button));
    singleView.classList.toggle('hidden',semua);allView.classList.toggle('hidden',!semua);
    root.querySelector('.page-head .actions').classList.toggle('hidden',semua);
    if(semua)drawAll();
  });
function draw(){
    const settings=getAssessmentSettings(session,subjectId);const conversion=getAttendanceConversion(session);const dailyMode=getDailyAttendanceMode(session,subjectId);
    editor.innerHTML=`<section class="card weights-card"><div class="section-head"><div><h3>${escapeHtml(subjects.find(subject=>subject.id===subjectId)?.name||'')}</h3><p>Seluruh bobot harus berjumlah tepat 100%.</p></div><div class="weight-total" data-total><span>Total Bobot</span><strong>100%</strong></div></div><div class="weight-grid">${ASSESSMENT_TYPES.map(type=>`<div class="weight-item"><label for="weight-${type.id}">${escapeHtml(type.label)}</label><div class="number-suffix"><input class="input" type="number" min="0" max="100" step="0.01" id="weight-${type.id}" data-weight="${type.id}" value="${settings[type.id]}"/><span>%</span></div></div>`).join('')}</div><div class="kktp-panel"><div><h3>KKTP Mata Pelajaran</h3><p>Kriteria Ketercapaian Tujuan Pembelajaran untuk mapel terpilih.</p></div><div class="number-suffix kktp-input"><input class="input" type="number" min="0" max="100" step="0.01" data-kktp value="${settings.kktp}"/><span>nilai</span></div></div><div class="rubric-panel"><div class="section-head"><div><h3>Rubrik Kategori Deskripsi Rapor</h3><p>Rentang nilai yang menentukan kategori pada kalimat Deskripsi Rapor mata pelajaran ini. Nilai bawaan aplikasi, bukan ketentuan resmi - silakan sesuaikan. KKTP di atas tidak terpengaruh.</p></div><button class="btn btn-light btn-small" type="button" data-reset-rubric>${icon('rotate',15)} Reset Rubrik</button></div><div class="rubric-grid">${settings.rubric.map(item=>`<div class="rubric-row" data-rubric="${escapeHtml(item.category)}"><span class="rubric-name">${escapeHtml(item.category)}</span><div class="number-suffix"><input class="input" type="number" min="${NILAI_MINIMUM}" max="${NILAI_MAKSIMUM}" step="1" data-rubric-min value="${Number(item.min)}"/><span>s.d.</span></div><div class="number-suffix"><input class="input" type="number" min="${NILAI_MINIMUM}" max="${NILAI_MAKSIMUM}" step="1" data-rubric-max value="${Number(item.max)}"/><span>nilai</span></div></div>`).join('')}</div><div class="rubric-status" data-rubric-status></div></div><div class="daily-source-panel"><div><h3>Penilaian Harian dari Absensi</h3><p>ON menggunakan hasil konversi kehadiran. Nilai manual dan data absensi asli tidak diubah.</p></div><label class="switch"><input type="checkbox" data-daily-mode ${dailyMode?'checked':''}/> ${dailyMode?'ON':'OFF'}</label></div><div class="attendance-conversion"><div class="section-head"><div><h3>Konversi Kehadiran Terpusat</h3><p>Berlaku untuk semua mapel yang mengaktifkan opsi di atas pada scope ini.</p></div><button class="btn btn-light btn-small" data-reset-conversion>${icon('rotate',15)} Reset Konversi</button></div><div class="conversion-grid">${Object.keys(ATTENDANCE_CONVERSION_DEFAULT).map(status=>`<div class="weight-item"><label>${status}</label><div class="number-suffix"><input class="input" type="number" min="0" max="100" step="0.01" data-conversion="${status}" value="${conversion[status]}"/><span>nilai</span></div></div>`).join('')}</div></div><div class="login-error hidden" data-error></div></section>`;
    editor.querySelectorAll('[data-weight]').forEach(input=>input.oninput=updateTotal);updateTotal();
    editor.querySelectorAll('[data-rubric] input').forEach(input=>input.oninput=updateTotal);
    editor.querySelector('[data-reset-rubric]').onclick=async()=>{
      if(!await confirmDialog({title:'Reset Rubrik Deskripsi Rapor',
        message:`Kembalikan rentang menjadi ${defaultReportRubric().map(item=>`${item.category} ${item.min}-${item.max}`).join(', ')}?`,
        confirmText:'Reset'}))return;
      defaultReportRubric().forEach(item=>{
        const row=editor.querySelector(`[data-rubric="${item.category}"]`);
        if(!row)return;
        row.querySelector('[data-rubric-min]').value=item.min;
        row.querySelector('[data-rubric-max]').value=item.max;
      });
      updateTotal();
      toast('Rubrik dikembalikan ke nilai bawaan. Tekan Simpan untuk menyimpannya.','warning');
    };
    editor.querySelector('[data-daily-mode]').onchange=event=>{event.target.parentElement.lastChild.textContent=event.target.checked?' ON':' OFF';};
    editor.querySelector('[data-reset-conversion]').onclick=async()=>{if(!await confirmDialog({title:'Reset Konversi Kehadiran',message:'Kembalikan Hadir 100, Sakit 80, Izin 80, dan Alpa 0?',confirmText:'Reset'}))return;resetAttendanceConversion(session);draw();toast('Konversi kehadiran dikembalikan ke default.','warning');};
  }
  /* Rubrik dibaca apa adanya dari layar; pemeriksaannya satu-satunya ada di layanan, sehingga
     aturan yang berlaku di UI dan yang berlaku saat menyimpan tidak mungkin berbeda. */
  function rubricValue(){
    return [...editor.querySelectorAll('[data-rubric]')].map(row=>({category:row.dataset.rubric,
      min:row.querySelector('[data-rubric-min]').value,max:row.querySelector('[data-rubric-max]').value}));
  }
  function formValue(){
    const result={kktp:editor.querySelector('[data-kktp]').value,rubric:rubricValue()};
    editor.querySelectorAll('[data-weight]').forEach(input=>{result[input.dataset.weight]=input.value;});return result;
  }
  /* Guru diberi tahu SEBELUM menekan Simpan, dengan kalimat yang sama persis dengan kalimat
     penolakan layanan - termasuk rentang mana yang bertumpang tindih atau mana yang berlubang. */
  function updateRubricStatus(){
    const kotak=editor.querySelector('[data-rubric-status]');
    if(!kotak)return true;
    try{
      normalizeReportRubric(rubricValue());
      kotak.className='rubric-status rubric-valid';
      kotak.textContent=`Rubrik sah: setiap nilai ${NILAI_MINIMUM} sampai ${NILAI_MAKSIMUM} masuk tepat satu kategori.`;
      return true;
    }catch(error){
      kotak.className='rubric-status rubric-invalid';
      kotak.textContent=error.message;
      return false;
    }
  }
  function updateTotal(){
    const total=[...editor.querySelectorAll('[data-weight]')].reduce((sum,input)=>sum+(Number(input.value)||0),0);
    const valid=Math.abs(total-100)<0.000001;const totalNode=editor.querySelector('[data-total]');
    totalNode.className=`weight-total ${valid?'weight-valid':'weight-invalid'}`;totalNode.querySelector('strong').textContent=`${Number(total.toFixed(2))}%`;
    /* Simpan hanya terbuka bila bobot DAN rubrik keduanya sah. */
    saveButton.disabled=!valid||!updateRubricStatus();
  }
  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};
  saveButton.onclick=()=>{
    const errorBox=editor.querySelector('[data-error]');errorBox.classList.add('hidden');
    try{saveAssessmentSettings(session,subjectId,formValue());saveDailyAttendanceMode(session,subjectId,editor.querySelector('[data-daily-mode]').checked);saveAttendanceConversion(session,Object.fromEntries([...editor.querySelectorAll('[data-conversion]')].map(input=>[input.dataset.conversion,input.value])));draw();toast('Bobot, KKTP, rubrik Deskripsi Rapor, dan pengaturan absensi berhasil disimpan.');}
    catch(error){errorBox.textContent=error.message;errorBox.classList.remove('hidden');toast(error.message,'error');}
  };
  resetButton.onclick=async()=>{
    if(!await confirmDialog({title:'Reset Bobot & KKTP',message:'Kembalikan bobot menjadi 30%, 20%, 20%, 15%, 15%, KKTP menjadi 75, dan rubrik Deskripsi Rapor ke nilai bawaan untuk mata pelajaran ini?',confirmText:'Reset'}))return;
    resetAssessmentSettings(session,subjectId);saveDailyAttendanceMode(session,subjectId,false);draw();toast('Bobot, KKTP, rubrik Deskripsi Rapor, dan sumber Penilaian Harian dikembalikan ke default.','warning');
  };
  draw();return root;
}
