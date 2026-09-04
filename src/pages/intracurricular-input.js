import { defaultIntracurricularActivities, generateIntracurricularDescription } from '../data/intracurricular-defaults.js';
import { ACTIVITY_PREDICATES, DEFAULT_ACTIVITY_PREDICATE, getStudentIntracurricular, saveIntracurricularBulk, saveStudentIntracurricular } from '../services/completeness.js';
import { composeIntracurricularDescriptionFromCp, fillAllIntracurricular,
  getIntracurricularCp, getStudentIntracurricularSelection, INTRACURRICULAR_PREDICATES,
  listAssignedIntracurricularActivities, listIntracurricularSubjects,
  saveStudentIntracurricularSelection } from '../services/intracurricular.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Alur Intrakurikuler: Mata Pelajaran → Fase otomatis dari rombel → CP resmi → Predikat →
   Deskripsi otomatis.

   Guru TIDAK lagi diminta memilih atau mencentang Tujuan Pembelajaran di sini. Acuannya adalah
   Capaian Pembelajaran mata pelajaran pada fase rombel, sehingga tidak ada pekerjaan mencentang
   ulang TP yang sudah aktif. Menu Tujuan Pembelajaran sendiri tidak berubah.

   Bila rombel belum punya mapel ber-CP, halaman kembali ke alur kegiatan lama sehingga sekolah
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

  /* ------------------------------------------- Alur CP: mapel, fase, predikat, deskripsi */
  function drawSubjectFlow(students,student,subjects){
    const current=getStudentIntracurricularSelection(session,selectedStudentId);
    let subjectId=subjects.some(item=>item.id===current?.subjectId)?current.subjectId:subjects[0].id;
    let predicate=INTRACURRICULAR_PREDICATES.includes(current?.predicate)?current.predicate:DEFAULT_ACTIVITY_PREDICATE;

    function render(){
      const subject=subjects.find(item=>item.id===subjectId);
      const cp=getIntracurricularCp(session,subjectId);
      view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><section class="card"><div class="section-head"><div><h3>Intrakurikuler ${escapeHtml(student.name)}</h3><p>Pilih mata pelajaran, tentukan predikat, lalu deskripsi tersusun otomatis dari Capaian Pembelajaran fase rombel. Tidak perlu memilih Tujuan Pembelajaran.</p></div><button class="btn btn-light" type="button" data-fill-all>${icon('activity',16)} Isi Otomatis Semua Siswa</button></div><div class="form-grid"><div class="field"><label>Mata Pelajaran *</label><select class="input" data-subject>${subjects.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===subjectId?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(predicate)}</select></div><div class="field form-span-2"><label>Acuan Capaian Pembelajaran</label>${cp.available?`<div class="cp-elements">${cp.elements.map(nama=>`<span class="cp-element">${escapeHtml(nama)}</span>`).join('')}</div><div class="objective-reference-foot">Fase ${escapeHtml(cp.phase)} · ditentukan otomatis dari tingkat rombel. Deskripsi Intrakurikuler disusun dari acuan ini.</div>`:`<p class="cp-empty">${escapeHtml(cp.reason||'CP belum tersedia untuk mata pelajaran ini pada fase rombel aktif.')}</p>`}</div><div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Kosongkan untuk memakai deskripsi otomatis...">${escapeHtml(current?.description||'')}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div><div class="actions"><button class="btn btn-primary" data-save>${icon('save',16)} Simpan Siswa Ini</button></div></section>`;

      /* `studentId` WAJIB ikut: tanpanya penyusun deskripsi tidak dapat membaca nilai Butir CP
         murid ini dan jatuh ke kalimat lingkup elemen. Akibatnya tombol Generate menampilkan
         kalimat yang lebih lemah daripada yang tersimpan saat Simpan ditekan - dua kalimat
         berbeda untuk murid yang sama. */
      const susun=()=>composeIntracurricularDescriptionFromCp(session,{
        studentName:student.name,subjectName:subject?.name||'',subjectId,
        studentId:student.id,
        predicate:view.querySelector('[data-predicate]').value,
      });
      /* Deskripsi otomatis menyesuaikan setiap kali mapel atau predikat berubah, kecuali guru
         sudah menuliskan kalimatnya sendiri. Tulisan guru tidak pernah ditimpa. */
      let terakhirOtomatis=current?.description||'';
      const segarkanDeskripsi=()=>{
        const kotak=view.querySelector('[data-description]');
        const isi=kotak.value.trim();
        if(isi&&isi!==terakhirOtomatis.trim())return;
        terakhirOtomatis=susun()||'';
        kotak.value=terakhirOtomatis;
      };
      view.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;render();};
      view.querySelector('[data-predicate]').onchange=event=>{predicate=event.target.value;segarkanDeskripsi();};
      view.querySelector('[data-generate-description]').onclick=()=>{
        const teks=susun();
        if(!teks){toast(cp.reason||'CP belum tersedia untuk mata pelajaran ini.','warning');return;}
        terakhirOtomatis=teks;
        view.querySelector('[data-description]').value=teks;
        toast('Deskripsi intrakurikuler berhasil dibuat otomatis.');
      };
      view.querySelector('[data-fill-all]').onclick=()=>{
        try{
          const hasil=fillAllIntracurricular(session,{subjectId,
            predicate:view.querySelector('[data-predicate]').value});
          draw();
          const catatan=[`${hasil.terisi} dari ${hasil.total} siswa terisi`];
          if(hasil.dilewati.length)catatan.push(`${hasil.dilewati.length} dilewati karena deskripsi manual`);
          if(hasil.gagal.length)catatan.push(`${hasil.gagal.length} gagal`);
          toast(catatan.join(' · '),hasil.gagal.length?'warning':'success');
        }catch(error){toast(error.message,'error');}
      };
      view.querySelector('[data-save]').onclick=()=>{
        try{
          saveStudentIntracurricularSelection(session,selectedStudentId,{
            subjectId,predicate:view.querySelector('[data-predicate]').value,
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
