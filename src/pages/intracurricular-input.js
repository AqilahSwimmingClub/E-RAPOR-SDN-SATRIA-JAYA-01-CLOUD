import { listAssignedIntracurricularActivities } from '../services/intracurricular.js';
import { ACTIVITY_PREDICATES, getStudentIntracurricular, saveIntracurricularBulk, saveStudentIntracurricular } from '../services/completeness.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

function studentOptions(students,selected=''){
  return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('');
}
function predicateOptions(selected){
  return ACTIVITY_PREDICATES.map(value=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(value)}</option>`).join('');
}

export function renderIntracurricularInput(session){
  let selectedStudentId='';
  const root=el(`<div><div class="page-head"><div><h1>Input Nilai Intrakurikuler</h1><p>Catat kegiatan penguatan pembelajaran Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]');

  function draw(){
    const students=listStudents(session,{classId:session.classId});
    if(!students.length){
      view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa melalui menu Data Siswa terlebih dahulu.</p></section>';
      return;
    }
    if(!students.some(student=>student.id===selectedStudentId))selectedStudentId=students[0].id;
    const activities=listAssignedIntracurricularActivities(session);
    const current=getStudentIntracurricular(session,selectedStudentId);
    const student=students.find(item=>item.id===selectedStudentId);
    const choices=[...new Set([...activities.map(item=>item.name),...(current?.activity?[current.activity]:[])])];

    if(!choices.length){
      view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section class="card empty-state"><div class="placeholder-icon">${icon('activity',26)}</div><h3>Belum ada kegiatan intrakurikuler</h3><p>Admin belum menetapkan kegiatan intrakurikuler untuk kelas dan periode aktif.</p></section>`;
      view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
      return;
    }

    const selectedActivity=current?.activity||choices[0];
    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section class="card"><div class="section-head"><div><h3>Intrakurikuler ${escapeHtml(student.name)}</h3><p>Kegiatan mengikuti Data Intrakurikuler yang ditetapkan Admin.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Kegiatan *</label><select class="input" data-activity>${choices.map(name=>`<option value="${escapeHtml(name)}" ${name===selectedActivity?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></div><div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(current?.predicate||ACTIVITY_PREDICATES[0])}</select></div><div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Tuliskan capaian siswa pada kegiatan ini...">${escapeHtml(current?.description||'')}</textarea></div></div><div class="actions"><button class="btn btn-light" data-bulk>Terapkan ke Siswa Kosong</button><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;

    const input=()=>({activity:view.querySelector('[data-activity]').value,predicate:view.querySelector('[data-predicate]').value,description:view.querySelector('[data-description]').value});
    view.querySelector('[data-save]').onclick=()=>{try{saveStudentIntracurricular(session,selectedStudentId,input());draw();toast('Intrakurikuler siswa berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-bulk]').onclick=()=>{try{const result=saveIntracurricularBulk(session,input(),{overwrite:false});draw();toast(result.skipped?`Diterapkan ke ${result.studentCount-result.skipped} siswa. ${result.skipped} siswa yang sudah terisi dipertahankan.`:`Diterapkan ke ${result.studentCount} siswa.`);}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
  }

  draw();
  return root;
}
