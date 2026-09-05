import { defaultExtracurricularActivities, findExtracurricularDefault,
  generateExtracurricularDescription } from '../data/extracurricular-defaults.js';
import { ACTIVITY_PREDICATES, DEFAULT_ACTIVITY_PREDICATE, listExtracurriculars,
  previewAllExtracurricular, saveAllExtracurricular } from '../services/completeness.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* INPUT NILAI EKSTRAKURIKULER — POLA YANG SAMA PERSIS DENGAN INTRAKURIKULER.

     Pilih Kegiatan -> pilih Predikat -> [Isi Otomatis Semua Siswa] -> guru cek/edit ->
     [Simpan Semua]

   BUG YANG DIPERBAIKI DI SINI sama persis dengan Kokurikuler: dropdown kegiatan tidak punya
   satu pun penangan perubahan, sehingga deskripsi yang dibuat untuk Kegiatan A tetap terpampang
   ketika guru berpindah ke Kegiatan B, lalu tersimpan sebagai deskripsi B.

   Draf DIPISAH PER KEGIATAN, dan setiap baris membawa nama kegiatannya sendiri. */

function studentOptions(students,selected=''){
  return students.map(student=>`<option value="${escapeHtml(student.id)}" ${student.id===selected?'selected':''}>${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('');
}
function predicateOptions(selected){
  return ACTIVITY_PREDICATES.map(value=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(value)}</option>`).join('');
}

export function renderExtracurricularInput(session){
  let selectedStudentId='';
  let kegiatan='';
  let predicate=DEFAULT_ACTIVITY_PREDICATE;
  const drafPerKegiatan=new Map();
  const draf=()=>{
    if(!drafPerKegiatan.has(kegiatan))drafPerKegiatan.set(kegiatan,new Map());
    return drafPerKegiatan.get(kegiatan);
  };
  const catatanKegiatan=(studentId,nama)=>listExtracurriculars(session,studentId)
    .find(item=>String(item.name||'').toLowerCase()===String(nama||'').toLowerCase())||null;

  const root=el(`<div><div class="page-head"><div><h1>Input Nilai Ekstrakurikuler</h1><p>Catat kegiatan ekstrakurikuler Kelas ${escapeHtml(session.classId)} pada scope aktif.</p></div></div><div data-view></div></div>`);
  const view=root.querySelector('[data-view]');

  function draw(){
    const students=listStudents(session,{classId:session.classId});
    if(!students.length){
      view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3><p>Tambahkan siswa melalui menu Data Siswa terlebih dahulu.</p></section>';
      return;
    }
    if(!students.some(student=>student.id===selectedStudentId))selectedStudentId=students[0].id;
    const student=students.find(item=>item.id===selectedStudentId);
    const activities=defaultExtracurricularActivities(session.classId);
    const choices=[...activities];
    /* Kegiatan yang pernah disimpan guru tetap muncul walau di luar daftar bawaan. */
    for(const catatan of listExtracurriculars(session,selectedStudentId))
      if(catatan.name&&!choices.some(item=>item.name===catatan.name))choices.unshift({name:catatan.name,description:''});
    if(!choices.some(item=>item.name===kegiatan))kegiatan=choices[0]?.name||'';

    const isian=draf();
    const barisSiswa=isian.get(selectedStudentId);
    const tersimpan=catatanKegiatan(selectedStudentId,kegiatan);
    if(barisSiswa)predicate=barisSiswa.predicate;
    else if(tersimpan?.predicate)predicate=tersimpan.predicate;
    const isiDeskripsi=barisSiswa?barisSiswa.description:(tersimpan?.description||'');

    const baris=students.map((item,index)=>{
      const drafBaris=isian.get(item.id);
      const simpan=catatanKegiatan(item.id,kegiatan);
      const sumber=drafBaris||simpan;
      const status=drafBaris?'<span class="badge badge-inactive">Draf · belum disimpan</span>'
        :simpan?'<span class="badge badge-active">Tersimpan</span>'
        :'<span class="badge badge-inactive">Belum diisi</span>';
      return `<tr><td>${index+1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(sumber?.predicate||'-')}</td><td>${status}</td><td>${escapeHtml(sumber?.description||'')}</td></tr>`;
    }).join('');

    view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
      <section class="card"><div class="section-head"><div><h3>Ekstrakurikuler ${escapeHtml(student.name)}</h3><p>Pilih kegiatan dan predikat, tekan Isi Otomatis Semua Siswa untuk melihat hasilnya, lalu Simpan Semua untuk menyimpannya.</p></div></div>
      <div class="form-grid"><div class="field form-span-2"><label>Ekstrakurikuler *</label><select class="input" data-activity>${choices.map(item=>`<option value="${escapeHtml(item.name)}" ${item.name===kegiatan?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(predicate)}</select></div>
      <div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Tekan Isi Otomatis Semua Siswa atau tuliskan sendiri...">${escapeHtml(isiDeskripsi)}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div>
      <div class="actions"><button class="btn btn-light" type="button" data-fill-all>${icon('activity',16)} Isi Otomatis Semua Siswa</button><button class="btn btn-primary" type="button" data-save-all ${isian.size?'':'disabled'}>${icon('save',16)} Simpan Semua</button></div></section>
      <section class="card"><div class="section-head"><div><h3>Hasil Semua Siswa</h3><p>${isian.size?`${isian.size} siswa berstatus draf pada kegiatan ${escapeHtml(kegiatan)} dan belum tersimpan.`:`Belum ada hasil baru untuk kegiatan ${escapeHtml(kegiatan)}.`}</p></div></div><div class="table-scroll"><table class="data-table" data-preview><thead><tr><th>No</th><th>Siswa</th><th>Predikat</th><th>Status</th><th>Deskripsi</th></tr></thead><tbody>${baris}</tbody></table></div></section>`;

    const kegiatanObjek=nama=>choices.find(item=>item.name===nama)
      ||findExtracurricularDefault(session.classId,nama)||{name:nama,description:''};
    const susun=(murid,predikat)=>generateExtracurricularDescription({studentName:murid.name,
      activity:kegiatanObjek(kegiatan),predicate:predikat,classId:session.classId});
    const catatDraf=teks=>{
      isian.set(selectedStudentId,{studentId:selectedStudentId,name:student.name,activity:kegiatan,
        predicate,description:String(teks||'').trim()});
    };
    view.querySelector('[data-description]').oninput=event=>catatDraf(event.target.value);
    view.querySelector('[data-generate-description]').onclick=()=>{
      const teks=susun(student,predicate);
      view.querySelector('[data-description]').value=teks;
      catatDraf(teks);
      draw();
      toast('Deskripsi ekstrakurikuler dibuat otomatis dan menunggu Simpan Semua.');
    };
    view.querySelector('[data-activity]').onchange=event=>{kegiatan=event.target.value;draw();};
    view.querySelector('[data-predicate]').onchange=event=>{
      predicate=event.target.value;
      if(isian.has(selectedStudentId))catatDraf(view.querySelector('[data-description]').value);
      draw();
    };
    view.querySelector('[data-fill-all]').onclick=()=>{
      try{
        const hasil=previewAllExtracurricular(session,{name:kegiatan,predicate,
          predicates:Object.fromEntries([...isian].map(([id,row])=>[id,row.predicate])),
          describe:({student:murid,predicate:predikat})=>susun(murid,predikat)});
        for(const row of hasil.rows)isian.set(row.studentId,{...row});
        draw();
        toast(`${hasil.rows.length} dari ${hasil.total} siswa tersusun · belum disimpan`);
      }catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-save-all]').onclick=()=>{
      try{
        const hasil=saveAllExtracurricular(session,{name:kegiatan,rows:[...isian.values()]});
        isian.clear();
        draw();
        const catatan=[`${hasil.tersimpan} dari ${hasil.total} siswa tersimpan`];
        if(hasil.gagal.length)catatan.push(`${hasil.gagal.length} gagal`);
        toast(catatan.join(' · '),hasil.gagal.length?'warning':'success');
      }catch(error){toast(error.message,'error');}
    };
    view.querySelector('[data-student]').onchange=event=>{selectedStudentId=event.target.value;draw();};
  }

  draw();
  return root;
}
