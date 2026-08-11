import { createLearningObjective, deleteLearningObjective, listLearningObjectives, phaseForClass, reorderLearningObjective, setLearningObjectiveActive, updateLearningObjective } from '../services/objectives.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export function renderObjectives(session){
  const subjects=listActiveSubjects(session);let subjectId=subjects[0]?.id||'';
  const root=el(`<div><div class="page-head"><div><h1>Tujuan Pembelajaran</h1><p>Kelola TP per kelas, mapel, semester, dan tahun pelajaran.</p></div><div class="actions"><button class="btn btn-primary" data-add>${icon('target',17)} Tambah TP</button></div></div><section class="card module-filter"><div class="field compact-field"><label for="objectiveSubject">Mata Pelajaran Aktif</label><select class="input" id="objectiveSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><div data-list></div></div>`);
  const listHost=root.querySelector('[data-list]');const addButton=root.querySelector('[data-add]');
  if(!subjects.length){root.querySelector('[data-subject]').disabled=true;addButton.disabled=true;listHost.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';return root;}

  function draw(){
    const objectives=listLearningObjectives(session,subjectId);const activeCount=objectives.filter(item=>item.active).length;
    if(!objectives.length){listHost.innerHTML='<section class="card empty-state"><h3>Belum ada Tujuan Pembelajaran</h3><p>Tambahkan TP pertama untuk mata pelajaran ini.</p></section>';return;}
    listHost.innerHTML=`<section class="card objective-card"><div class="section-head"><div><h3>${escapeHtml(subjects.find(subject=>subject.id===subjectId)?.name||'')}</h3><p>${activeCount} aktif dari ${objectives.length} TP · Fase ${phaseForClass(session.classId)} · urutan tersimpan otomatis</p></div></div><div class="objective-list">${objectives.map((objective,index)=>`<article class="objective-row" data-id="${escapeHtml(objective.id)}"><div class="order-actions"><button class="btn btn-light btn-icon" data-up title="Naik" ${index===0?'disabled':''}>${icon('arrowUp',15)}</button><button class="btn btn-light btn-icon" data-down title="Turun" ${index===objectives.length-1?'disabled':''}>${icon('arrowDown',15)}</button></div><div class="objective-order">${index+1}</div><div class="objective-main"><div><strong>${escapeHtml(objective.code)}</strong><span class="badge badge-a">Fase ${escapeHtml(objective.phase)}</span><span class="badge ${objective.active?'badge-active':'badge-inactive'}">${objective.active?'Aktif':'Nonaktif'}</span></div><p>${escapeHtml(objective.description)}</p></div><label class="switch"><input type="checkbox" data-active ${objective.active?'checked':''}/> Aktif</label><div class="row-actions"><button class="btn btn-light btn-small" data-edit>Edit</button><button class="btn btn-danger btn-small" data-delete>Hapus</button></div></article>`).join('')}</div></section>`;
    listHost.querySelectorAll('[data-id]').forEach(row=>{
      const id=row.dataset.id;const objective=objectives.find(item=>item.id===id);
      row.querySelector('[data-up]').onclick=()=>{reorderLearningObjective(session,subjectId,id,-1);draw();};
      row.querySelector('[data-down]').onclick=()=>{reorderLearningObjective(session,subjectId,id,1);draw();};
      row.querySelector('[data-active]').onchange=event=>{setLearningObjectiveActive(session,subjectId,id,event.target.checked);draw();toast(`TP ${event.target.checked?'diaktifkan':'dinonaktifkan'}.`);};
      row.querySelector('[data-edit]').onclick=()=>openForm(objective);
      row.querySelector('[data-delete]').onclick=()=>removeObjective(objective);
    });
  }
  function closeModal(modal){modal.remove();}
  function openForm(objective=null){
    const nextNumber=listLearningObjectives(session,subjectId).reduce((max,item)=>Math.max(max,Number.parseInt(String(item.code||'').match(/(\d+)$/)?.[1]||'0',10)),0)+1;
    const modal=el(`<div class="modal-backdrop"><form class="modal-card modal-wide objective-form"><div class="modal-head"><div><h3>${objective?'Edit':'Tambah'} Tujuan Pembelajaran</h3><p>${escapeHtml(subjects.find(subject=>subject.id===subjectId)?.name||'')} · Kelas ${escapeHtml(session.classId)}</p></div><button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div><div class="form-grid"><div class="field"><label>Kode TP Otomatis</label><input class="input readonly" value="${escapeHtml(objective?.code||`TP-${nextNumber}`)}" readonly/></div><div class="field"><label>Fase Otomatis</label><input class="input readonly" value="Fase ${phaseForClass(session.classId)}" readonly/></div></div><div class="field"><label>Deskripsi TP *</label><textarea class="input" name="description" maxlength="1000" rows="6" required>${escapeHtml(objective?.description||'')}</textarea></div><label class="switch objective-active-field"><input type="checkbox" name="active" ${objective?.active===false?'':'checked'}/> TP Aktif</label><div class="login-error hidden" data-error></div><div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button><button type="submit" class="btn btn-primary">${objective?'Simpan Perubahan':'Tambah TP'}</button></div></form></div>`);
    document.body.append(modal);const form=modal.querySelector('form');modal.querySelector('[data-close]').onclick=()=>closeModal(modal);modal.querySelector('[data-cancel]').onclick=()=>closeModal(modal);
    form.onsubmit=event=>{event.preventDefault();const errorBox=modal.querySelector('[data-error]');errorBox.classList.add('hidden');try{const input={description:form.elements.description.value,active:form.elements.active.checked};if(objective)updateLearningObjective(session,subjectId,objective.id,input);else createLearningObjective(session,subjectId,input);closeModal(modal);draw();toast(objective?'TP berhasil diperbarui.':'TP berhasil ditambahkan.');}catch(error){errorBox.textContent=error.message;errorBox.classList.remove('hidden');}};
  }
  async function removeObjective(objective){
    if(!await confirmDialog({title:'Hapus Tujuan Pembelajaran',message:`Hapus ${objective.code} dari mata pelajaran ini?`,confirmText:'Hapus',danger:true}))return;
    deleteLearningObjective(session,subjectId,objective.id);draw();toast('TP berhasil dihapus.','warning');
  }
  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};addButton.onclick=()=>openForm();draw();return root;
}
