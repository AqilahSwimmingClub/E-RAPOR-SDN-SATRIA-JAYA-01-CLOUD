import { getGraduationStatus, getHomeroomNote, getPromotionStatus, GRADUATION_STATUSES, prepareGraduationStatus, PROMOTION_STATUSES, saveGraduationStatus, saveHomeroomNote, saveHomeroomNoteBulk, savePromotionStatus } from '../services/completeness.js';
import { listStudents } from '../services/students.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

function studentOptions(students,selected=''){return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('');}
function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();}
function avatar(student){return student.photo?`<img class="student-photo student-photo-small" src="${escapeHtml(student.photo)}" alt="Foto ${escapeHtml(student.name)}"/>`:`<div class="student-photo student-photo-small student-initials">${escapeHtml(initials(student.name))}</div>`;}

/* Setiap bagian kini punya route kanonik sendiri di sidebar, sehingga halaman ini tidak lagi
   membawa bilah tab internal. Judul halaman mengikuti bagian yang dibuka. */
const COMPLETENESS_SECTIONS=Object.freeze({
  note:{title:'Input Catatan Wali Kelas',lead:'Tuliskan catatan wali kelas untuk setiap siswa.'},
  promotion:{title:'Input Kenaikan Kelas',lead:'Tentukan status kenaikan kelas atau kelulusan siswa.'}
});

export function renderCompleteness(session,initialSection='note'){
  const tab=Object.hasOwn(COMPLETENESS_SECTIONS,initialSection)?initialSection:'note';
  const bagian=COMPLETENESS_SECTIONS[tab];
  let selectedStudentId='';
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(bagian.title)}</h1><p>${escapeHtml(bagian.lead)} Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]');
  function students(){return listStudents(session,{classId:session.classId});}
  function ensureSelected(items){if(!items.some(student=>student.id===selectedStudentId))selectedStudentId=items[0]?.id||'';}
  function draw(){if(tab==='promotion')drawPromotion();else drawNote();}
  function empty(){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa melalui menu Data Siswa terlebih dahulu.</p></section>';}
  function studentFilter(items,title,description){return `<section class="card module-filter"><div class="field compact-field"><label for="completenessStudent">${escapeHtml(title)}</label><select class="input" id="completenessStudent" data-student>${studentOptions(items,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(description)}</span></div></section><div data-module></div>`;}
  function drawNote(){
    const items=students();ensureSelected(items);if(!items.length){empty();return;}view.innerHTML=studentFilter(items,'Siswa','Catatan tersimpan per semester dan tahun pelajaran.');const module=view.querySelector('[data-module]');const drawForm=()=>{const student=items.find(item=>item.id===selectedStudentId);const record=getHomeroomNote(session,selectedStudentId);module.innerHTML=`<section class="card homeroom-note-card"><div class="section-head"><div><h3>Catatan untuk ${escapeHtml(student.name)}</h3><p>${record?'Terakhir diperbarui '+new Date(record.updatedAt).toLocaleString('id-ID'):'Belum ada catatan tersimpan.'}</p></div></div><div class="field"><label>Catatan Wali Kelas</label><textarea class="input" rows="8" data-note placeholder="Tuliskan perkembangan, motivasi, atau arahan untuk siswa...">${escapeHtml(record?.text||'')}</textarea></div><div class="actions"><button class="btn btn-primary" data-save-note>${icon('save',16)} Simpan Catatan</button></div></section>`;module.querySelector('[data-save-note]').onclick=()=>{try{saveHomeroomNote(session,selectedStudentId,module.querySelector('[data-note]').value);drawForm();toast('Catatan wali kelas berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    module.querySelector('.homeroom-note-card .actions').insertAdjacentHTML('afterbegin','<button class="btn btn-light" data-bulk-note>Terapkan ke Semua Siswa</button>');
    module.querySelector('[data-bulk-note]').onclick=async()=>{
      const text=module.querySelector('[data-note]').value;
      try{
        const kosong=saveHomeroomNoteBulk(session,text);
        if(kosong.skipped){
          const timpa=await confirmDialog({title:'Catatan Wali Kelas Massal',message:`${kosong.saved} siswa yang catatannya masih kosong sudah diisi. ${kosong.skipped} siswa sudah punya catatan individual. Timpa juga catatan ${kosong.skipped} siswa tersebut?`,confirmText:'Timpa Semua',danger:true});
          if(timpa){const semua=saveHomeroomNoteBulk(session,text,{overwrite:true});toast(`Catatan diterapkan ke ${semua.saved} siswa.`);}
          else toast(`Catatan diterapkan ke ${kosong.saved} siswa. Catatan individual dipertahankan.`);
        }else toast(`Catatan diterapkan ke ${kosong.saved} siswa.`);
        drawForm();
      }catch(error){toast(error.message,'error');}
    };};view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;drawNote();};drawForm();
  }
  function drawPromotion(){
    if(!String(session.semester||'').startsWith('Genap ')){view.innerHTML='<section class="card empty-state"><h3>Kenaikan Kelas Tidak Diperlukan</h3><p>Status kenaikan kelas hanya diisi pada semester Genap. Semester Ganjil tidak mengurangi kelengkapan rapor.</p></section>';return;}
    const items=students();if(!items.length){empty();return;}const grade=Number.parseInt(session.classId,10);if(grade===6){items.forEach(student=>prepareGraduationStatus(session,student.id));view.innerHTML=`<section class="card"><div class="section-head"><div><h3>Status Kelulusan Kelas 6</h3><p>Struktur kelulusan terpisah dari kenaikan kelas dan digunakan untuk kelengkapan rapor.</p></div><span class="badge badge-active">Struktur siap</span></div><div class="promotion-list">${items.map(student=>{const record=getGraduationStatus(session,student.id);return `<article><div>${avatar(student)}<span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.nis)} · ${record?.status?'Status tersimpan':'Belum ditentukan'}</small></span></div><div class="promotion-action"><select class="input" data-graduation-select="${escapeHtml(student.id)}"><option value="">Pilih status akhir</option>${GRADUATION_STATUSES.map(status=>`<option value="${status.id}" ${record?.status===status.id?'selected':''}>${status.label}</option>`).join('')}</select><button class="btn btn-primary btn-small" data-save-graduation="${escapeHtml(student.id)}">Simpan</button></div></article>`;}).join('')}</div></section>`;view.querySelectorAll('[data-save-graduation]').forEach(button=>button.onclick=()=>{const select=view.querySelector(`[data-graduation-select="${CSS.escape(button.dataset.saveGraduation)}"]`);try{saveGraduationStatus(session,button.dataset.saveGraduation,select.value);drawPromotion();toast('Status kelulusan berhasil disimpan.');}catch(error){toast(error.message,'error');}});return;}
    view.innerHTML=`<section class="card"><div class="section-head"><div><h3>Kenaikan Kelas ${escapeHtml(session.classId)}</h3><p>Pilih status setiap siswa untuk semester aktif.</p></div><span class="badge badge-a">${items.length} siswa</span></div><div class="promotion-list">${items.map(student=>{const record=getPromotionStatus(session,student.id);return `<article><div>${avatar(student)}<span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.nis)} · ${record?.targetClass?`Tujuan ${escapeHtml(record.targetClass)}`:'Belum ditentukan'}</small></span></div><div class="promotion-action"><select class="input" data-promotion-select="${escapeHtml(student.id)}"><option value="">Pilih status</option>${PROMOTION_STATUSES.map(status=>`<option value="${status.id}" ${record?.status===status.id?'selected':''}>${status.label}</option>`).join('')}</select><button class="btn btn-primary btn-small" data-save-promotion="${escapeHtml(student.id)}">Simpan</button></div></article>`;}).join('')}</div></section>`;view.querySelectorAll('[data-save-promotion]').forEach(button=>button.onclick=()=>{const select=view.querySelector(`[data-promotion-select="${CSS.escape(button.dataset.savePromotion)}"]`);try{savePromotionStatus(session,button.dataset.savePromotion,select.value);drawPromotion();toast('Status kenaikan kelas berhasil disimpan.');}catch(error){toast(error.message,'error');}});
  }
  draw();return root;
}
