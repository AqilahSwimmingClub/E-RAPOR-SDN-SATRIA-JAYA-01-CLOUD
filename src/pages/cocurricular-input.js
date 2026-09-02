import { generateCocurricularDescription } from '../data/cocurricular.js';
import { ACTIVITY_PREDICATES, DEFAULT_ACTIVITY_PREDICATE, getStudentCocurricular, listCocurricularActivities, saveCocurricularBulk, saveStudentCocurricular } from '../services/completeness.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Input Nilai Kokurikuler mengikuti pola Intrakurikuler: siswa, kegiatan, predikat, deskripsi.
   Kegiatan diambil langsung dari preset aplikasi sehingga guru tidak perlu melewati
   konfigurasi apa pun sebelum mengisi nilai siswa. */

function studentOptions(students,selected=''){
  return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('');
}
function predicateOptions(selected){
  return ACTIVITY_PREDICATES.map(value=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(value)}</option>`).join('');
}

export function renderCocurricularInput(session){
  let selectedStudentId='';
  const root=el(`<div><div class="page-head"><div><h1>Input Nilai Kokurikuler</h1><p>Catat kegiatan kokurikuler Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]');

  function draw(){
    const students=listStudents(session,{classId:session.classId});
    if(!students.length){
      view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa melalui menu Data Siswa terlebih dahulu.</p></section>';
      return;
    }
    if(!students.some(student=>student.id===selectedStudentId))selectedStudentId=students[0].id;
    const current=getStudentCocurricular(session,selectedStudentId);
    const student=students.find(item=>item.id===selectedStudentId);
    const choices=[...listCocurricularActivities()];
    const saved=current?.activity||current?.projectTitle||current?.theme||'';
    if(saved&&!choices.includes(saved))choices.unshift(saved);
    const selectedActivityName=saved||choices[0]||'';

    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section class="card"><div class="section-head"><div><h3>Kokurikuler ${escapeHtml(student.name)}</h3><p>Kegiatan kokurikuler tersedia langsung tanpa konfigurasi tambahan.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Kegiatan Kokurikuler *</label><select class="input" data-activity>${choices.map(nama=>`<option value="${escapeHtml(nama)}" ${nama===selectedActivityName?'selected':''}>${escapeHtml(nama)}</option>`).join('')}</select></div><div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(current?.predicate||DEFAULT_ACTIVITY_PREDICATE)}</select></div><div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Tuliskan capaian siswa pada kegiatan ini...">${escapeHtml(current?.description||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div><div class="actions"><button class="btn btn-light" data-bulk>Terapkan ke Siswa Kosong</button><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;

    const input=()=>({activity:view.querySelector('[data-activity]').value,predicate:view.querySelector('[data-predicate]').value,description:view.querySelector('[data-description]').value});
    view.querySelector('[data-generate-description]').onclick=()=>{
      view.querySelector('[data-description]').value=generateCocurricularDescription({studentName:student.name,activity:view.querySelector('[data-activity]').value,predicate:view.querySelector('[data-predicate]').value,classId:session.classId});
      toast('Deskripsi kokurikuler berhasil dibuat otomatis.');
    };
    view.querySelector('[data-save]').onclick=()=>{try{saveStudentCocurricular(session,selectedStudentId,input());draw();toast('Kokurikuler siswa berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-bulk]').onclick=()=>{try{const result=saveCocurricularBulk(session,input(),{overwrite:false});draw();toast(result.skipped?`Diterapkan ke ${result.studentCount-result.skipped} siswa. ${result.skipped} siswa yang sudah terisi dipertahankan.`:`Diterapkan ke ${result.studentCount} siswa.`);}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
  }

  draw();
  return root;
}
