import { defaultExtracurricularActivities, findExtracurricularDefault, generateExtracurricularDescription } from '../data/extracurricular-defaults.js';
import { ACTIVITY_PREDICATES, DEFAULT_ACTIVITY_PREDICATE, getStudentExtracurricular, saveExtracurricularBulk, saveStudentExtracurricular } from '../services/completeness.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Input Nilai Ekstrakurikuler memakai pola yang sama persis dengan Intrakurikuler:
   pilih siswa, pilih kegiatan, pilih predikat, lalu isi deskripsi. Tidak ada lagi langkah
   menambah master kegiatan lebih dahulu; pilihan kegiatan sudah tersedia di dropdown dengan
   Pramuka sebagai pilihan utama sesuai tingkat kelas. */

function studentOptions(students,selected=''){
  return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('');
}
function predicateOptions(selected){
  return ACTIVITY_PREDICATES.map(value=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(value)}</option>`).join('');
}

export function renderExtracurricularInput(session){
  let selectedStudentId='';
  const root=el(`<div><div class="page-head"><div><h1>Input Nilai Ekstrakurikuler</h1><p>Catat kegiatan ekstrakurikuler Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]');

  function draw(){
    const students=listStudents(session,{classId:session.classId});
    if(!students.length){
      view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa melalui menu Data Siswa terlebih dahulu.</p></section>';
      return;
    }
    if(!students.some(student=>student.id===selectedStudentId))selectedStudentId=students[0].id;
    const activities=defaultExtracurricularActivities(session.classId);
    const current=getStudentExtracurricular(session,selectedStudentId);
    const student=students.find(item=>item.id===selectedStudentId);
    const choices=[...activities];
    /* Kegiatan yang pernah disimpan guru tetap muncul walau di luar daftar bawaan. */
    if(current?.name&&!choices.some(item=>item.name===current.name))choices.unshift({name:current.name,description:''});
    const selectedActivityName=current?.name||choices[0]?.name||'';

    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section class="card"><div class="section-head"><div><h3>Ekstrakurikuler ${escapeHtml(student.name)}</h3><p>Pilihan kegiatan sudah tersedia, dengan ${escapeHtml(activities[0].name)} sebagai kegiatan utama Kelas ${escapeHtml(session.classId)}.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Ekstrakurikuler *</label><select class="input" data-activity>${choices.map(item=>`<option value="${escapeHtml(item.name)}" ${item.name===selectedActivityName?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(current?.predicate||DEFAULT_ACTIVITY_PREDICATE)}</select></div><div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Tuliskan capaian siswa pada kegiatan ini...">${escapeHtml(current?.description||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div><div class="actions"><button class="btn btn-light" data-bulk>Terapkan ke Siswa Kosong</button><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;

    const input=()=>({name:view.querySelector('[data-activity]').value,predicate:view.querySelector('[data-predicate]').value,description:view.querySelector('[data-description]').value});
    const activityByName=name=>choices.find(item=>item.name===name)||findExtracurricularDefault(session.classId,name)||{name,description:''};
    view.querySelector('[data-generate-description]').onclick=()=>{
      const activity=activityByName(view.querySelector('[data-activity]').value);
      const predicate=view.querySelector('[data-predicate]').value;
      view.querySelector('[data-description]').value=generateExtracurricularDescription({studentName:student.name,activity,predicate,classId:session.classId});
      toast('Deskripsi ekstrakurikuler berhasil dibuat otomatis.');
    };
    view.querySelector('[data-save]').onclick=()=>{try{saveStudentExtracurricular(session,selectedStudentId,input());draw();toast('Ekstrakurikuler siswa berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-bulk]').onclick=()=>{try{const result=saveExtracurricularBulk(session,input(),{onlyEmpty:true});draw();toast(result.skipped?`Diterapkan ke ${result.studentCount-result.skipped} siswa. ${result.skipped} siswa yang sudah terisi dipertahankan.`:`Diterapkan ke ${result.studentCount} siswa.`);}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
  }

  draw();
  return root;
}
