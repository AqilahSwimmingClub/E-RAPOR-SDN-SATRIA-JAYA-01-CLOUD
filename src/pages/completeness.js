import { ACTIVITY_PREDICATES, cocurricularDescriptionsForClass, listCocurricularActivities, createExtracurricular, deleteExtracurricular, getGraduationStatus, getHomeroomNote, getPromotionStatus, getStudentCocurricular, GRADUATION_STATUSES, listExtracurriculars, prepareGraduationStatus, pramukaDescriptionsForClass, pramukaPresetForClass, PROMOTION_STATUSES, saveCocurricularBulk, saveExtracurricularBulk, saveGraduationStatus, saveHomeroomNote, saveHomeroomNoteBulk, savePromotionStatus, saveStudentCocurricular, getStudentIntracurricular, saveStudentIntracurricular, saveIntracurricularBulk, updateExtracurricular } from '../services/completeness.js';
import { listStudents } from '../services/students.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

function studentOptions(students,selected=''){return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('');}
function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();}
function avatar(student){return student.photo?`<img class="student-photo student-photo-small" src="${escapeHtml(student.photo)}" alt="Foto ${escapeHtml(student.name)}"/>`:`<div class="student-photo student-photo-small student-initials">${escapeHtml(initials(student.name))}</div>`;}

/* Setiap bagian kini punya route kanonik sendiri di sidebar, sehingga halaman ini tidak lagi
   membawa bilah tab internal. Judul halaman mengikuti bagian yang dibuka. */
const COMPLETENESS_SECTIONS=Object.freeze({
  extracurricular:{title:'Input Nilai Ekskul',lead:'Catat kegiatan dan predikat ekstrakurikuler siswa.'},
  cocurricular:{title:'Input Nilai Kokurikuler',lead:'Catat kegiatan dan deskripsi kokurikuler siswa.'},
  intracurricular:{title:'Input Nilai Intrakurikuler',lead:'Catat kegiatan penguatan pembelajaran dan deskripsinya.'},
  note:{title:'Input Catatan Wali Kelas',lead:'Tuliskan catatan wali kelas untuk setiap siswa.'},
  promotion:{title:'Input Kenaikan Kelas',lead:'Tentukan status kenaikan kelas atau kelulusan siswa.'}
});

export function renderCompleteness(session,initialSection='extracurricular'){
  const tab=Object.hasOwn(COMPLETENESS_SECTIONS,initialSection)?initialSection:'extracurricular';
  const bagian=COMPLETENESS_SECTIONS[tab];
  let selectedStudentId='';
  const root=el(`<div><div class="page-head"><div><h1>${escapeHtml(bagian.title)}</h1><p>${escapeHtml(bagian.lead)} Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]');
  function students(){return listStudents(session,{classId:session.classId});}
  function ensureSelected(items){if(!items.some(student=>student.id===selectedStudentId))selectedStudentId=items[0]?.id||'';}
  function draw(){if(tab==='extracurricular')drawExtracurricular();if(tab==='cocurricular')drawCocurricular();if(tab==='intracurricular')drawIntracurricular();if(tab==='note')drawNote();if(tab==='promotion')drawPromotion();}
  function empty(){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa melalui menu Data Siswa terlebih dahulu.</p></section>';}
  function studentFilter(items,title,description){return `<section class="card module-filter"><div class="field compact-field"><label for="completenessStudent">${escapeHtml(title)}</label><select class="input" id="completenessStudent" data-student>${studentOptions(items,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(description)}</span></div></section><div data-module></div>`;}
  /* Pilihan kegiatan, predikat, dan deskripsi disediakan otomatis. Guru tidak lagi mengetik
     nama Pramuka maupun deskripsinya; kegiatan Pramuka sudah terpilih sesuai tingkat kelas
     dan deskripsinya berasal dari lima preset tingkat tersebut. Kegiatan lain tetap dapat
     ditambahkan manual bila sekolah memiliki ekstrakurikuler selain Pramuka. */
  const LAINNYA='__lainnya__';
  function extraActivityOptions(selected){
    const preset=pramukaPresetForClass(session.classId);
    const daftar=[preset,...(selected&&selected!==preset?[selected]:[])];
    return `${daftar.map(nama=>`<option value="${escapeHtml(nama)}" ${nama===selected?'selected':''}>${escapeHtml(nama)}</option>`).join('')}<option value="${LAINNYA}">Kegiatan lain (ketik sendiri)…</option>`;
  }
  function predicateOptions(selected){return ACTIVITY_PREDICATES.map(value=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(value)}</option>`).join('');}
  function descriptionOptions(daftar,selected){
    const pilihan=[...daftar,...(selected&&!daftar.includes(selected)?[selected]:[])];
    return `${pilihan.map(text=>`<option value="${escapeHtml(text)}" ${text===selected?'selected':''}>${escapeHtml(text)}</option>`).join('')}<option value="${LAINNYA}">Tulis deskripsi sendiri…</option>`;
  }

  function drawExtracurricular(){
    const items=students();ensureSelected(items);if(!items.length){empty();return;}
    view.innerHTML=studentFilter(items,'Siswa','Kegiatan Pramuka otomatis mengikuti tingkat kelas.');
    const module=view.querySelector('[data-module]');
    const drawList=()=>{
      const selected=items.find(student=>student.id===selectedStudentId);
      const records=listExtracurriculars(session,selectedStudentId);
      module.innerHTML=`<section class="card"><div class="section-head"><div><h3>Ekstrakurikuler ${escapeHtml(selected.name)}</h3><p>Pramuka ${escapeHtml(pramukaPresetForClass(session.classId))} sudah tersedia otomatis untuk Kelas ${escapeHtml(session.classId)}.</p></div><div class="actions"><button class="btn btn-light" data-extra-bulk>Terapkan ke Semua Siswa</button><button class="btn btn-primary" data-add-activity>${icon('edit',16)} Tambah Ekstrakurikuler</button></div></div>${records.length?`<div class="activity-record-list">${records.map(record=>`<article><div><strong>${escapeHtml(record.name)}</strong><span class="badge badge-a">${escapeHtml(record.predicate)}</span><p>${escapeHtml(record.description)}</p></div><div class="row-actions"><button class="btn btn-light btn-small" data-edit-activity="${escapeHtml(record.id)}">Edit</button><button class="btn btn-danger btn-small" data-delete-activity="${escapeHtml(record.id)}">Hapus</button></div></article>`).join('')}</div>`:'<div class="empty-inline completeness-empty">Belum ada kegiatan ekstrakurikuler untuk siswa ini.</div>'}</section>`;
      module.querySelector('[data-add-activity]').onclick=()=>openActivityForm();
      module.querySelector('[data-extra-bulk]').onclick=()=>openActivityForm(null,{bulk:true});
      module.querySelectorAll('[data-edit-activity]').forEach(button=>button.onclick=()=>openActivityForm(records.find(record=>record.id===button.dataset.editActivity)));
      module.querySelectorAll('[data-delete-activity]').forEach(button=>button.onclick=async()=>{
        const record=records.find(item=>item.id===button.dataset.deleteActivity);
        if(await confirmDialog({title:'Hapus Ekstrakurikuler',message:`Hapus ${record.name} dari siswa ini?`,confirmText:'Hapus',danger:true})){deleteExtracurricular(session,selectedStudentId,record.id);drawList();toast('Data ekstrakurikuler dihapus.','warning');}
      });
    };

    const openActivityForm=(record=null,{bulk=false}={})=>{
      const namaAwal=record?.name||pramukaPresetForClass(session.classId);
      const predikatAwal=record?.predicate||ACTIVITY_PREDICATES[0];
      const modal=el(`<div class="modal-backdrop"><form class="modal-card modal-wide"><div class="modal-head"><div><h3>${bulk?'Terapkan Ekstrakurikuler ke Semua Siswa':`${record?'Edit':'Tambah'} Ekstrakurikuler`}</h3><p>${bulk?`Seluruh siswa Kelas ${escapeHtml(session.classId)} menerima kegiatan, predikat, dan deskripsi yang sama.`:'Pilih kegiatan, predikat, lalu salah satu deskripsi otomatis.'}</p></div><button type="button" class="btn btn-light btn-icon" data-close>${icon('x',17)}</button></div><div class="form-grid"><div class="field form-span-2"><label>Kegiatan *</label><select class="input" data-activity>${extraActivityOptions(namaAwal)}</select><input class="input hidden" data-activity-custom placeholder="Nama ekstrakurikuler lain" value=""/></div><div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(predikatAwal)}</select></div><div class="field form-span-2"><label>Deskripsi *</label><select class="input" data-description></select><textarea class="input hidden" rows="3" data-description-custom placeholder="Tulis deskripsi sendiri"></textarea></div></div><div class="login-error hidden" data-error></div><div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button><button class="btn btn-primary" type="submit">${bulk?'Terapkan ke Semua Siswa':'Simpan'}</button></div></form></div>`);
      document.body.append(modal);
      const form=modal.querySelector('form'),close=()=>modal.remove();
      modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
      const activity=modal.querySelector('[data-activity]'),activityCustom=modal.querySelector('[data-activity-custom]');
      const description=modal.querySelector('[data-description]'),descriptionCustom=modal.querySelector('[data-description-custom]');
      const namaKegiatan=()=>activity.value===LAINNYA?activityCustom.value.trim():activity.value;
      /* Deskripsi Pramuka mengikuti tingkat kelas; kegiatan lain memakai deskripsi bebas. */
      const refreshDescriptions=(terpilih='')=>{
        const nama=namaKegiatan();
        const daftar=/pramuka/i.test(nama)?pramukaDescriptionsForClass(session.classId):[];
        description.innerHTML=descriptionOptions(daftar,terpilih);
        if(!daftar.length)description.value=LAINNYA;
        description.dispatchEvent(new Event('change'));
      };
      activity.onchange=()=>{activityCustom.classList.toggle('hidden',activity.value!==LAINNYA);refreshDescriptions();};
      description.onchange=()=>descriptionCustom.classList.toggle('hidden',description.value!==LAINNYA);
      refreshDescriptions(record?.description||'');
      if(record?.description&&description.value===LAINNYA)descriptionCustom.value=record.description;

      form.onsubmit=async event=>{
        event.preventDefault();
        const box=modal.querySelector('[data-error]');box.classList.add('hidden');
        const input={name:namaKegiatan(),predicate:modal.querySelector('[data-predicate]').value,description:description.value===LAINNYA?descriptionCustom.value.trim():description.value};
        try{
          if(bulk){
            const punyaData=items.filter(student=>listExtracurriculars(session,student.id).some(item=>item.name.toLowerCase()===input.name.toLowerCase())).length;
            /* Data individual yang sudah ada hanya ditimpa setelah guru menyetujuinya. */
            if(punyaData&&!await confirmDialog({title:'Timpa Data Individual',message:`${punyaData} siswa sudah memiliki kegiatan ${input.name}. Timpa dengan predikat dan deskripsi yang baru?`,confirmText:'Timpa Semua',danger:true}))return;
            const hasil=saveExtracurricularBulk(session,input);
            close();drawList();toast(`${input.name} diterapkan ke ${hasil.studentCount} siswa.`);
            return;
          }
          if(record)updateExtracurricular(session,selectedStudentId,record.id,input);
          else createExtracurricular(session,selectedStudentId,input);
          close();drawList();toast('Data ekstrakurikuler berhasil disimpan.');
        }catch(error){box.textContent=error.message;box.classList.remove('hidden');}
      };
    };

    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;drawList();};
    drawList();
  }

  function drawCocurricular(){
    const items=students();ensureSelected(items);if(!items.length){empty();return;}
    const current=getStudentCocurricular(session,selectedStudentId);
    const student=items.find(item=>item.id===selectedStudentId);
    const kegiatan=listCocurricularActivities();
    const kegiatanAwal=current?.activity||current?.projectTitle||current?.theme||kegiatan[0];
    /* Kegiatan kokurikuler dipilih dari preset, bukan diketik. Deskripsi mengikuti kegiatan
       yang dipilih DAN tingkat kelas, sehingga kelas rendah dan kelas tinggi berbeda. */
    view.innerHTML=`${studentFilter(items,'Siswa','Kokurikuler tersimpan per rombel, semester, dan tahun pelajaran.')}<section class="card"><div class="section-head"><div><h3>Kokurikuler ${escapeHtml(student.name)}</h3><p>Kegiatan dan deskripsi otomatis mengikuti tingkat Kelas ${escapeHtml(session.classId)}.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Kegiatan *</label><select class="input" data-coco-activity>${kegiatan.map(nama=>`<option value="${escapeHtml(nama)}" ${nama===kegiatanAwal?'selected':''}>${escapeHtml(nama)}</option>`).join('')}${kegiatanAwal&&!kegiatan.includes(kegiatanAwal)?`<option value="${escapeHtml(kegiatanAwal)}" selected>${escapeHtml(kegiatanAwal)}</option>`:''}</select></div><div class="field"><label>Predikat *</label><select class="input" data-coco-predicate>${predicateOptions(current?.predicate||ACTIVITY_PREDICATES[0])}</select></div><div class="field form-span-2"><label>Deskripsi *</label><select class="input" data-coco-description></select></div></div><div class="actions"><button class="btn btn-light" data-coco-bulk>Terapkan ke Semua Siswa</button><button class="btn btn-primary" data-coco-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;
    const activity=view.querySelector('[data-coco-activity]'),description=view.querySelector('[data-coco-description]');
    const refreshDescriptions=(terpilih='')=>{
      const daftar=cocurricularDescriptionsForClass(session.classId,activity.value);
      description.innerHTML=daftar.map(text=>`<option value="${escapeHtml(text)}" ${text===terpilih?'selected':''}>${escapeHtml(text)}</option>`).join('');
    };
    activity.onchange=()=>refreshDescriptions();
    refreshDescriptions(current?.description||'');
    const input=()=>({activity:activity.value,predicate:view.querySelector('[data-coco-predicate]').value,description:description.value});
    view.querySelector('[data-coco-save]').onclick=()=>{try{saveStudentCocurricular(session,selectedStudentId,input());drawCocurricular();toast('Kokurikuler siswa berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-coco-bulk]').onclick=async()=>{
      const nilai=input();
      const punyaData=items.filter(item=>getStudentCocurricular(session,item.id)).length;
      if(punyaData&&!await confirmDialog({title:'Timpa Data Individual',message:`${punyaData} siswa sudah memiliki data kokurikuler. Timpa dengan kegiatan, predikat, dan deskripsi yang baru?`,confirmText:'Timpa Semua',danger:true}))return;
      try{const hasil=saveCocurricularBulk(session,nilai);drawCocurricular();toast(`${nilai.activity} diterapkan ke ${hasil.studentCount} siswa.`);}
      catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;drawCocurricular();};
  }
  /* Kegiatan intrakurikuler berasal dari master Admin untuk rombel dan periode aktif.
     Deskripsi diketik wali kelas karena setiap kegiatan penguatan pembelajaran berbeda. */
  function drawIntracurricular(){
    const items=students();ensureSelected(items);if(!items.length){empty();return;}
    const kegiatan=listAssignedIntracurricularActivities(session);
    const current=getStudentIntracurricular(session,selectedStudentId);
    const student=items.find(item=>item.id===selectedStudentId);
    if(!kegiatan.length&&!current){
      view.innerHTML=`${studentFilter(items,'Siswa','Intrakurikuler tersimpan per rombel, semester, dan tahun pelajaran.')}<section class="card empty-state"><div class="placeholder-icon">${icon('activity',26)}</div><h3>Belum ada kegiatan intrakurikuler</h3><p>Admin belum menetapkan kegiatan intrakurikuler untuk Kelas ${escapeHtml(session.classId)} pada ${escapeHtml(session.semester)}.</p></section>`;
      view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;drawIntracurricular();};
      return;
    }
    const pilihan=[...new Set([...kegiatan.map(item=>item.name),...(current?.activity?[current.activity]:[])])];
    const kegiatanAwal=current?.activity||pilihan[0];
    view.innerHTML=`${studentFilter(items,'Siswa','Intrakurikuler tersimpan per rombel, semester, dan tahun pelajaran.')}<section class="card"><div class="section-head"><div><h3>Intrakurikuler ${escapeHtml(student.name)}</h3><p>Kegiatan mengikuti master Data Intrakurikuler Kelas ${escapeHtml(session.classId)}.</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Kegiatan *</label><select class="input" data-intra-activity>${pilihan.map(nama=>`<option value="${escapeHtml(nama)}" ${nama===kegiatanAwal?'selected':''}>${escapeHtml(nama)}</option>`).join('')}</select></div><div class="field"><label>Predikat *</label><select class="input" data-intra-predicate>${predicateOptions(current?.predicate||ACTIVITY_PREDICATES[0])}</select></div><div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-intra-description placeholder="Tuliskan capaian siswa pada kegiatan ini...">${escapeHtml(current?.description||'')}</textarea></div></div><div class="actions"><button class="btn btn-light" data-intra-bulk>Terapkan ke Siswa Kosong</button><button class="btn btn-primary" data-intra-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;
    const input=()=>({activity:view.querySelector('[data-intra-activity]').value,predicate:view.querySelector('[data-intra-predicate]').value,description:view.querySelector('[data-intra-description]').value});
    view.querySelector('[data-intra-save]').onclick=()=>{try{saveStudentIntracurricular(session,selectedStudentId,input());drawIntracurricular();toast('Intrakurikuler siswa berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-intra-bulk]').onclick=()=>{
      try{
        const hasil=saveIntracurricularBulk(session,input(),{overwrite:false});
        drawIntracurricular();
        toast(hasil.skipped?`Diterapkan ke ${hasil.studentCount-hasil.skipped} siswa. ${hasil.skipped} siswa yang sudah terisi dipertahankan.`:`Diterapkan ke ${hasil.studentCount} siswa.`);
      }catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;drawIntracurricular();};
  }
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
