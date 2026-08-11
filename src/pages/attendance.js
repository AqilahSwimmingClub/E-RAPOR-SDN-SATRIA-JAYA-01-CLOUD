import { ATTENDANCE_STATUSES, dailyAttendanceRecap, getAttendance, monthlyAttendanceRecap, saveAttendance, semesterAttendanceRecap } from '../services/attendance.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { digitalGauge } from '../ui/digital-gauge.js';

function localDate(){
  const now=new Date();const offset=now.getTimezoneOffset()*60000;
  return new Date(now.getTime()-offset).toISOString().slice(0,10);
}
function statusOptions(selected=''){
  return `<option value="">Pilih Status</option>${ATTENDANCE_STATUSES.map(status=>`<option value="${status}" ${selected===status?'selected':''}>${status}</option>`).join('')}`;
}
function recapTable(recap){
  if(!recap.students.length)return '<div class="empty-inline">Belum ada siswa untuk direkap.</div>';
  return `<div class="table-scroll"><table class="data-table recap-table"><thead><tr><th>NIS</th><th>Nama</th><th>H</th><th>S</th><th>I</th><th>A</th></tr></thead><tbody>${recap.students.map(student=>`<tr><td>${escapeHtml(student.nis)}</td><td><strong>${escapeHtml(student.name)}</strong></td><td>${student.Hadir}</td><td>${student.Sakit}</td><td>${student.Izin}</td><td>${student.Alpa}</td></tr>`).join('')}</tbody></table></div>`;
}
function countCards(totals){
  const total=ATTENDANCE_STATUSES.reduce((sum,status)=>sum+Number(totals[status]||0),0);const present=total?Math.round(Number(totals.Hadir||0)/total*100):0;return `${digitalGauge(present,{label:'Kehadiran',tone:'blue',size:'small'})}${ATTENDANCE_STATUSES.map(status=>`<div class="attendance-count count-${status.toLowerCase()}"><span>${status}</span><strong>${totals[status]}</strong></div>`).join('')}`;
}

export function renderAttendance(session){
  let selectedDate=localDate();
  let students=[];let statuses={};
  const root=el(`<div>
    <div class="page-head"><div><h1>Absensi</h1><p>Catat satu status per siswa untuk Kelas ${escapeHtml(session.classId)} · ${escapeHtml(session.semester)}.</p></div><div class="actions"><button class="btn btn-light" data-all-present>${icon('check-circle',17)} Tandai Semua Hadir</button><button class="btn btn-primary" data-save>${icon('save',17)} Simpan Absensi</button></div></div>
    <section class="card attendance-control"><div class="field compact-field"><label for="attendanceDate">Tanggal</label><input class="input" type="date" id="attendanceDate" value="${selectedDate}" data-date /></div><div data-record-state></div></section>
    <section class="card"><div class="section-head"><div><h3>Daftar Siswa Kelas ${escapeHtml(session.classId)}</h3><p>Pilih Hadir, Sakit, Izin, atau Alpa untuk setiap siswa.</p></div><span class="badge badge-a" data-student-count></span></div><div data-attendance-list></div></section>
    <section class="attendance-recap-grid" data-recaps></section>
  </div>`);
  const listHost=root.querySelector('[data-attendance-list]');

  function loadDate(){
    students=listStudents(session,{classId:session.classId});
    const existing=getAttendance(session,selectedDate,{classId:session.classId});
    statuses={...(existing?.statuses||{})};
    draw(existing);drawRecaps();
  }
  function draw(existing=null){
    root.querySelector('[data-record-state]').innerHTML=existing?'<span class="status-ok">Absensi tanggal ini sudah tersimpan dan dapat diedit.</span>':'<span class="muted">Belum ada absensi tersimpan pada tanggal ini.</span>';
    root.querySelector('[data-student-count]').textContent=`${students.length} siswa`;
    if(!students.length){listHost.innerHTML='<div class="empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan Data Siswa terlebih dahulu sebelum mengisi absensi.</p></div>';return;}
    listHost.innerHTML=`<div class="attendance-list">${students.map((student,index)=>`<div class="attendance-row"><div class="attendance-number">${index+1}</div><div class="attendance-student"><strong>${escapeHtml(student.name)}</strong><span>${escapeHtml(student.nis)} · ${escapeHtml(student.nisn)}</span></div><select class="input attendance-status status-${String(statuses[student.id]||'').toLowerCase()}" data-status data-id="${escapeHtml(student.id)}">${statusOptions(statuses[student.id])}</select></div>`).join('')}</div>`;
    listHost.querySelectorAll('[data-status]').forEach(select=>select.onchange=()=>{statuses[select.dataset.id]=select.value;select.className=`input attendance-status status-${select.value.toLowerCase()}`;});
  }
  function drawRecaps(){
    const daily=dailyAttendanceRecap(session,selectedDate,{classId:session.classId});
    const monthly=monthlyAttendanceRecap(session,selectedDate.slice(0,7),{classId:session.classId});
    const semester=semesterAttendanceRecap(session,{classId:session.classId});
    root.querySelector('[data-recaps]').innerHTML=`
      <article class="card attendance-daily"><div class="section-head"><div><h3>Rekap Harian</h3><p>${escapeHtml(selectedDate)} · ${daily.saved?'Tersimpan':'Belum tersimpan'}</p></div></div><div class="attendance-counts">${countCards(daily.totals)}</div></article>
      <article class="card attendance-recap-card"><div class="section-head"><div><h3>Rekap Bulanan</h3><p>${escapeHtml(selectedDate.slice(0,7))} · ${monthly.daysRecorded} hari tercatat</p></div></div>${recapTable(monthly)}</article>
      <article class="card attendance-recap-card"><div class="section-head"><div><h3>Rekap Semester</h3><p>${escapeHtml(session.semester)} · ${semester.daysRecorded} hari tercatat</p></div></div>${recapTable(semester)}</article>`;
  }
  root.querySelector('[data-date]').onchange=event=>{selectedDate=event.target.value;try{loadDate();}catch(error){toast(error.message,'error');}};
  root.querySelector('[data-all-present]').onclick=()=>{if(!students.length){toast('Belum ada siswa untuk ditandai.','warning');return;}statuses=Object.fromEntries(students.map(student=>[student.id,'Hadir']));draw(getAttendance(session,selectedDate,{classId:session.classId}));toast('Semua siswa ditandai Hadir.');};
  root.querySelector('[data-save]').onclick=()=>{try{saveAttendance(session,selectedDate,statuses,{classId:session.classId});loadDate();toast('Absensi berhasil disimpan.');}catch(error){toast(error.message,'error');}};
  loadDate();return root;
}
