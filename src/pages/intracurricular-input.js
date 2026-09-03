import { defaultIntracurricularActivities, generateIntracurricularDescription } from '../data/intracurricular-defaults.js';
import { ACTIVITY_PREDICATES, DEFAULT_ACTIVITY_PREDICATE, getStudentIntracurricular, saveIntracurricularBulk, saveStudentIntracurricular } from '../services/completeness.js';
import { composeIntracurricularDescription, getStudentIntracurricularSelection, INTRACURRICULAR_PREDICATES,
  listAssignedIntracurricularActivities, listInactiveReferencedObjectives,
  listIntracurricularObjectives, listIntracurricularSubjects,
  saveStudentIntracurricularSelection } from '../services/intracurricular.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Alur Tahap 8E: Mata Pelajaran → Tujuan Pembelajaran → Predikat → Deskripsi otomatis.

   Bila rombel belum punya mapel ber-TP, halaman kembali ke alur kegiatan lama sehingga sekolah
   yang sudah memakainya tidak kehilangan apa pun. Tidak ada input angka pada halaman ini:
   Intrakurikuler menghasilkan predikat dan deskripsi, bukan nilai. */

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
    const student=students.find(item=>item.id===selectedStudentId);
    const subjects=listIntracurricularSubjects(session);
    if(subjects.length)return drawSubjectFlow(students,student,subjects);
    return drawLegacyFlow(students,student);
  }

  /* ------------------------------------------------- Alur baru: mapel, TP, predikat, deskripsi */
  function drawSubjectFlow(students,student,subjects){
    const current=getStudentIntracurricularSelection(session,selectedStudentId);
    let subjectId=subjects.some(item=>item.id===current?.subjectId)?current.subjectId:subjects[0].id;
    let predicate=INTRACURRICULAR_PREDICATES.includes(current?.predicate)?current.predicate:DEFAULT_ACTIVITY_PREDICATE;
    let objectiveIds=[...(current?.objectiveIds||[])];

    function render(){
      const objectives=listIntracurricularObjectives(session,subjectId);
      /* TP yang pernah dipilih lalu dinonaktifkan di menu Tujuan Pembelajaran tidak dibuang
         diam-diam: catatan lamanya tetap ditampilkan beserta keterangannya, tetapi tidak lagi
         dapat dipakai untuk input baru. */
      const nonaktif=listInactiveReferencedObjectives(session,subjectId,objectiveIds);
      objectiveIds=objectiveIds.filter(id=>objectives.some(item=>item.id===id));
      const subject=subjects.find(item=>item.id===subjectId);
      view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section class="card"><div class="section-head"><div><h3>Intrakurikuler ${escapeHtml(student.name)}</h3><p>Pilih mata pelajaran, tandai Tujuan Pembelajaran yang menjadi acuan, tentukan predikat, lalu deskripsi tersusun otomatis. Intrakurikuler tidak menghasilkan angka.</p></div></div><div class="form-grid"><div class="field"><label>Mata Pelajaran *</label><select class="input" data-subject>${subjects.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===subjectId?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(predicate)}</select></div><div class="field form-span-2"><label>Tujuan Pembelajaran *</label><div class="objective-reference-list">${objectives.map(item=>`<label class="objective-reference-item"><input type="checkbox" data-objective value="${escapeHtml(item.id)}" ${objectiveIds.includes(item.id)?'checked':''}/><span><strong>${escapeHtml(item.code)}</strong> ${escapeHtml(item.description)}</span></label>`).join('')}</div>${nonaktif.length?`<div class="objective-inactive-note"><strong>${nonaktif.length} TP yang pernah dipilih kini nonaktif</strong> di menu Tujuan Pembelajaran, sehingga tidak dapat dipakai lagi untuk input baru. Catatan lama tidak dihapus.<ul class="objective-inactive-list">${nonaktif.map(item=>`<li><strong>${escapeHtml(item.code)}</strong> ${escapeHtml(item.description)} <span class="badge badge-inactive">Nonaktif</span></li>`).join('')}</ul></div>`:''}<div class="objective-reference-foot">${objectives.length?'Pilihan TP hanya berisi TP yang aktif pada menu Tujuan Pembelajaran.':'Belum ada TP aktif. Aktifkan TP pada menu Tujuan Pembelajaran terlebih dahulu.'}</div></div><div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Kosongkan untuk memakai deskripsi otomatis...">${escapeHtml(current?.description||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div><div class="actions"><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;

      const pilihanTp=()=>[...view.querySelectorAll('[data-objective]')].filter(item=>item.checked).map(item=>item.value);
      const susun=()=>composeIntracurricularDescription({
        studentName:student.name,subjectName:subject?.name||'',
        objectives:objectives.filter(item=>pilihanTp().includes(item.id)),
        predicate:view.querySelector('[data-predicate]').value,
      });
      /* Deskripsi otomatis ikut menyesuaikan setiap kali TP atau predikat berubah, kecuali guru
         sudah menuliskan kalimatnya sendiri. Tulisan guru tidak pernah ditimpa. */
      let terakhirOtomatis=current?.description||'';
      const segarkanDeskripsi=()=>{
        const kotak=view.querySelector('[data-description]');
        const isi=kotak.value.trim();
        if(isi&&isi!==terakhirOtomatis.trim())return;
        terakhirOtomatis=pilihanTp().length?susun():'';
        kotak.value=terakhirOtomatis;
      };
      view.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;objectiveIds=[];render();};
      view.querySelector('[data-predicate]').onchange=event=>{predicate=event.target.value;segarkanDeskripsi();};
      view.querySelectorAll('[data-objective]').forEach(box=>box.onchange=()=>{objectiveIds=pilihanTp();segarkanDeskripsi();});
      view.querySelector('[data-generate-description]').onclick=()=>{
        if(!pilihanTp().length){toast('Tandai minimal satu Tujuan Pembelajaran.','warning');return;}
        terakhirOtomatis=susun();
        view.querySelector('[data-description]').value=terakhirOtomatis;
        toast('Deskripsi intrakurikuler berhasil dibuat otomatis.');
      };
      view.querySelector('[data-save]').onclick=()=>{
        try{
          saveStudentIntracurricularSelection(session,selectedStudentId,{
            subjectId,objectiveIds:pilihanTp(),predicate:view.querySelector('[data-predicate]').value,
            description:view.querySelector('[data-description]').value,
          });
          draw();toast('Intrakurikuler siswa berhasil disimpan.');
        }catch(error){toast(error.message,'error');}
      };
      view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
    }
    render();
  }

  /* -------------------------------- Alur lama: dipakai bila belum ada mapel aktif yang punya TP */
  function drawLegacyFlow(students,student){
    const assigned=listAssignedIntracurricularActivities(session);
    const defaults=defaultIntracurricularActivities(session.classId);
    const activities=assigned.length?assigned:defaults;
    const current=getStudentIntracurricular(session,selectedStudentId);
    const currentActivity=current?.activity?{name:current.activity,description:''}:null;
    const choices=[...activities];
    if(currentActivity&&!choices.some(item=>item.name===currentActivity.name))choices.unshift(currentActivity);

    const selectedActivityName=current?.activity||choices[0]?.name||'';
    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section class="card"><div class="section-head"><div><h3>Intrakurikuler ${escapeHtml(student.name)}</h3><p>${assigned.length?'Kegiatan mengikuti Data Intrakurikuler yang ditetapkan Admin.':'Menggunakan kegiatan bawaan SD sesuai fase Kurikulum Merdeka.'}</p></div></div><div class="form-grid"><div class="field form-span-2"><label>Kegiatan *</label><select class="input" data-activity>${choices.map(item=>`<option value="${escapeHtml(item.name)}" ${item.name===selectedActivityName?'selected':''}>${escapeHtml(item.name)}${item.phase?` · Fase ${escapeHtml(item.phase)}`:''}</option>`).join('')}</select></div><div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(current?.predicate||ACTIVITY_PREDICATES[0])}</select></div><div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Tuliskan capaian siswa pada kegiatan ini...">${escapeHtml(current?.description||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div><div class="actions"><button class="btn btn-light" data-bulk>Terapkan ke Siswa Kosong</button><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;

    const input=()=>({activity:view.querySelector('[data-activity]').value,predicate:view.querySelector('[data-predicate]').value,description:view.querySelector('[data-description]').value});
    const activityByName=name=>choices.find(item=>item.name===name)||{name,description:''};
    view.querySelector('[data-generate-description]').onclick=()=>{
      const activity=activityByName(view.querySelector('[data-activity]').value);
      const predicate=view.querySelector('[data-predicate]').value;
      view.querySelector('[data-description]').value=generateIntracurricularDescription({studentName:student.name,activity,predicate});
      toast('Deskripsi intrakurikuler berhasil dibuat otomatis.');
    };
    view.querySelector('[data-save]').onclick=()=>{try{saveStudentIntracurricular(session,selectedStudentId,input());draw();toast('Intrakurikuler siswa berhasil disimpan.');}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-bulk]').onclick=()=>{try{const result=saveIntracurricularBulk(session,input(),{overwrite:false});draw();toast(result.skipped?`Diterapkan ke ${result.studentCount-result.skipped} siswa. ${result.skipped} siswa yang sudah terisi dipertahankan.`:`Diterapkan ke ${result.studentCount} siswa.`);}catch(error){toast(error.message,'error');}};
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
  }

  draw();
  return root;
}
