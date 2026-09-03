import { addReferenceObjectives, capaianPembelajaranFor, listReferenceObjectives,
  listSchoolObjectives, setActiveObjective } from '../services/learning-objectives.js';
import { createLearningObjective, deleteLearningObjective, phaseForClass,
  reorderLearningObjective, updateLearningObjective } from '../services/objectives.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Menu Tujuan Pembelajaran — pusat pengelolaan TP.

   Alurnya sengaja pendek: pilih mata pelajaran, lihat acuan CP-nya, tekan + Tambah TP,
   centang TP yang dipakai, simpan. Setelah itu TP tampil di tabel dan tinggal diaktifkan
   atau dinonaktifkan. Tidak ada langkah "adopsi katalog" yang harus dilewati lebih dulu.

   CP dan TP tidak dicampur. CP adalah acuan kompetensi resmi per mata pelajaran dan fase;
   TP adalah turunan operasionalnya yang dikelola guru. Fase tidak pernah dipilih manual —
   ia dihitung dari tingkat rombel yang sedang aktif. */

function semesterPendek(semester){
  const teks=String(semester||'');
  if(/genap/i.test(teks))return '2';
  if(/ganjil/i.test(teks))return '1';
  return teks;
}

export function renderObjectives(session){
  const subjects=listActiveSubjects(session);
  let subjectId=subjects[0]?.id||'';
  const fase=(()=>{try{return phaseForClass(session.classId);}catch{return '';}})();
  const tingkat=Number.parseInt(String(session.classId||''),10)||'';

  const root=el(`<div><div class="page-head"><div><h1>Tujuan Pembelajaran</h1><p>Kelola TP per mata pelajaran. Fase ditentukan otomatis dari rombel aktif.</p></div></div>
    <section class="card module-filter"><div class="field compact-field"><label for="objectiveSubject">Mata Pelajaran Aktif</label><select class="input" id="objectiveSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div>
    <div class="field compact-field"><label for="objectivePhase">Fase</label><input class="input readonly" id="objectivePhase" value="Fase ${escapeHtml(fase)} · Kelas ${escapeHtml(String(tingkat))}" readonly/></div>
    <div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
    <div data-cp></div><div data-list></div></div>`);
  const cpHost=root.querySelector('[data-cp]');
  const listHost=root.querySelector('[data-list]');
  if(!subjects.length){
    root.querySelector('[data-subject]').disabled=true;
    listHost.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';
    return root;
  }

  /* ---------------------------------------------------------- Acuan CP (mapel + fase) */
  function drawCp(){
    const cp=capaianPembelajaranFor(session,subjectId);
    if(!cp){cpHost.innerHTML='';return;}
    const nama=subjects.find(item=>item.id===subjectId)?.name||'';
    /* Status Muatan Lokal dibaca dari KEWENANGAN penetapan CP-nya, bukan dari label yang
       tersimpan pada Mapping. Mapping lama sebuah sekolah bisa saja masih menggolongkan
       Koding & KA sebagai muatan lokal, padahal CP-nya ditetapkan secara nasional. */
    const mulok=cp.regulation.scope==='muatan_lokal';
    /* Rujukan ditulis dari metadata yang benar-benar ada. Mata pelajaran yang regulasinya belum
       terverifikasi menyebut lembaga yang berwenang, bukan nomor keputusan yang tidak dimilikinya. */
    const rujukan=cp.regulation.decision
      ? `Rujukan: <strong>${escapeHtml(cp.regulation.decision)}</strong> — ${escapeHtml(cp.regulation.title)}.`
      : `Rujukan: <strong>${escapeHtml(cp.regulation.title)}</strong> — kewenangan ${escapeHtml(cp.regulation.authority||'pemerintah daerah')}.`;
    /* Naskah CP tidak pernah diganti teks pengganti. Selama kosong, yang ditampilkan adalah
       alasan kosongnya. */
    const naskah=cp.naskah
      ? `<div class="cp-naskah">${escapeHtml(cp.naskah)}</div>`
      : `<p class="cp-empty">Naskah CP resmi belum tersedia pada dataset aplikasi. ${escapeHtml(cp.naskahReason)}</p>`;
    cpHost.innerHTML=`<section class="card cp-card"><div class="section-head"><div><h3>Capaian Pembelajaran — Fase ${escapeHtml(cp.phase)}</h3><p>${escapeHtml(nama)} · Kelas ${escapeHtml(String(cp.grade||''))} · acuan kompetensi resmi yang menjadi dasar penyusunan TP.</p></div><div class="cp-badges">${mulok?'<span class="badge badge-c">Muatan Lokal</span>':''}<span class="badge badge-a">Fase ${escapeHtml(cp.phase)}</span></div></div>
      ${cp.available?'':`<p class="cp-empty">Mata pelajaran ini belum berlaku pada Fase ${escapeHtml(cp.phase)}. ${escapeHtml(cp.naskahReason)}</p>`}
      ${cp.elements.length?`<div class="cp-elements">${cp.elements.map(item=>`<span class="cp-element">${escapeHtml(item.name)}</span>`).join('')}</div>`:''}
      ${cp.available?naskah:''}
      <p class="cp-source">${rujukan}${cp.regulation.note?` ${escapeHtml(cp.regulation.note)}`:''} Naskah CP lengkap mengikuti dokumen resmi tersebut; aplikasi tidak menyalinnya agar tidak menjadi sumber kedua.</p></section>`;
  }

  /* ------------------------------------------------------------------ Modal + Tambah TP */
  function openReferencePicker(done){
    const referensi=listReferenceObjectives(session,subjectId);
    const nama=subjects.find(item=>item.id===subjectId)?.name||'';
    const tersedia=referensi.filter(item=>!item.sudahDipakai);
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-wide objective-picker" role="dialog" aria-modal="true" aria-labelledby="pilihTpJudul">
      <div class="modal-head"><div><h3 id="pilihTpJudul">Pilih Tujuan Pembelajaran</h3>
        <p>${escapeHtml(nama)} · Fase ${escapeHtml(fase)} · Kelas ${escapeHtml(String(tingkat))} · ${escapeHtml(session.semester)}</p></div>
        <button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      ${tersedia.length
        ? `<div class="picker-toolbar"><label class="objective-reference-item picker-all"><input type="checkbox" data-pilih-semua/><span><strong>Pilih Semua</strong></span></label><span class="objective-picker-count" data-pick-count>0 TP dipilih</span></div>
           <div class="objective-reference-list" data-picker-list>${tersedia.map(item=>`<label class="objective-reference-item"><input type="checkbox" data-ref value="${escapeHtml(item.id)}"/><span>${escapeHtml(item.description)}${item.cpElement?`<small class="cp-tag">Elemen CP: ${escapeHtml(item.cpElement.name)}</small>`:''}</span></label>`).join('')}</div>`
        : `<p class="objective-picker-note">${referensi.length?'Seluruh TP referensi untuk mata pelajaran dan fase ini sudah dimasukkan. Gunakan Buat TP Manual bila ingin menambah rumusan sendiri.':'Belum ada TP referensi untuk mata pelajaran ini pada Fase '+escapeHtml(fase)+'. Gunakan Buat TP Manual untuk merumuskan TP sekolah.'}</p>`}
      <div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button>
        <button type="button" class="btn btn-primary" data-simpan${tersedia.length?'':' disabled'}>Simpan TP Terpilih</button></div></div></div>`);
    document.body.append(modal);
    const tutup=()=>modal.remove();
    const kotak=()=>[...modal.querySelectorAll('[data-ref]')];
    const hitung=()=>{
      const n=kotak().filter(item=>item.checked).length;
      modal.querySelector('[data-pick-count]').textContent=`${n} TP dipilih`;
      const semua=modal.querySelector('[data-pilih-semua]');
      if(semua)semua.checked=n>0&&n===kotak().length;
    };
    kotak().forEach(box=>box.onchange=hitung);
    const semua=modal.querySelector('[data-pilih-semua]');
    if(semua)semua.onchange=()=>{kotak().forEach(box=>{box.checked=semua.checked;});hitung();};
    modal.querySelector('[data-close]').onclick=tutup;
    modal.querySelector('[data-cancel]').onclick=tutup;
    modal.querySelector('[data-simpan]').onclick=()=>{
      const ids=kotak().filter(item=>item.checked).map(item=>item.value);
      try{
        const hasil=addReferenceObjectives(session,subjectId,ids);
        tutup();done();
        toast(`${hasil.added} Tujuan Pembelajaran ditambahkan.`);
      }catch(error){toast(error.message,'error');}
    };
  }

  /* --------------------------------------------------------------- Modal TP manual */
  function openManualForm(objective,done){
    const nama=subjects.find(item=>item.id===subjectId)?.name||'';
    const modal=el(`<div class="modal-backdrop"><form class="modal-card modal-wide objective-form" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>${objective?'Edit':'Buat'} Tujuan Pembelajaran</h3>
        <p>${escapeHtml(nama)} · Fase ${escapeHtml(fase)} · Kelas ${escapeHtml(String(tingkat))}</p></div>
        <button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      <div class="field"><label for="tpDeskripsi">Tujuan Pembelajaran *</label>
        <textarea class="input" id="tpDeskripsi" name="description" maxlength="1000" rows="5" required>${escapeHtml(objective?.description||'')}</textarea></div>
      <label class="objective-reference-item"><input type="checkbox" name="active" ${objective?.active===false?'':'checked'}/><span><strong>Aktif</strong> — dipakai Penilaian, Intrakurikuler, dan deskripsi rapor.</span></label>
      <div class="login-error hidden" data-error></div>
      <div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button>
        <button type="submit" class="btn btn-primary">${objective?'Simpan Perubahan':'Tambah TP'}</button></div></form></div>`);
    document.body.append(modal);
    const tutup=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=tutup;
    modal.querySelector('[data-cancel]').onclick=tutup;
    modal.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      const kotak=modal.querySelector('[data-error]');kotak.classList.add('hidden');
      const isian={description:event.currentTarget.elements.description.value,
        active:event.currentTarget.elements.active.checked};
      try{
        if(objective)updateLearningObjective(session,subjectId,objective.id,isian);
        else createLearningObjective(session,subjectId,isian);
        tutup();done();toast(objective?'TP berhasil diperbarui.':'TP berhasil ditambahkan.');
      }catch(error){kotak.textContent=error.message;kotak.classList.remove('hidden');}
    };
  }

  /* ------------------------------------------------------------------------ Tabel TP */
  function draw(){
    drawCp();
    const daftar=listSchoolObjectives(session,subjectId);
    const aktif=daftar.filter(item=>item.active).length;
    const nama=subjects.find(item=>item.id===subjectId)?.name||'';
    const kepala=`<div class="section-head"><div><h3>Tujuan Pembelajaran</h3><p>${escapeHtml(nama)} · ${daftar.length?`${aktif} aktif dari ${daftar.length} TP`:'belum ada TP'} · TP aktif dipakai Penilaian, Intrakurikuler, dan deskripsi rapor.</p></div>
      <div class="row-actions"><button class="btn btn-primary btn-small" data-tambah>${icon('target',15)} Tambah TP</button><button class="btn btn-light btn-small" data-manual>Buat TP Manual</button></div></div>`;
    if(!daftar.length){
      listHost.innerHTML=`<section class="card">${kepala}<div class="empty-state"><h3>Belum ada Tujuan Pembelajaran</h3><p>Tekan <strong>Tambah TP</strong> untuk memilih TP yang diturunkan dari Capaian Pembelajaran di atas, atau <strong>Buat TP Manual</strong> untuk merumuskan sendiri.</p></div></section>`;
    }else{
      listHost.innerHTML=`<section class="card">${kepala}
        <div class="table-scroll"><table class="data-table objective-table"><thead><tr><th>No</th><th>Tingkat</th><th>Fase</th><th>Semester</th><th>Tujuan Pembelajaran</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${daftar.map((item,index)=>`<tr data-id="${escapeHtml(item.id)}"><td>${index+1}</td><td>${escapeHtml(String(item.grade||''))}</td><td>${escapeHtml(item.phase||'')}</td><td>${escapeHtml(semesterPendek(item.semester))}</td>
          <td class="objective-text">${escapeHtml(item.description)}${item.cpElement?`<small class="cp-tag">Elemen CP: ${escapeHtml(item.cpElement.name)}</small>`:''}</td>
          <td><span class="badge ${item.active?'badge-active':'badge-inactive'}">${item.active?'Aktif':'Nonaktif'}</span></td>
          <td><div class="row-actions"><button class="btn btn-light btn-small" data-toggle>${item.active?'Nonaktifkan':'Aktifkan'}</button><button class="btn btn-light btn-icon" data-up title="Naik" ${index===0?'disabled':''}>${icon('chevron',14)}</button><button class="btn btn-light btn-small" data-edit>Edit</button><button class="btn btn-danger btn-small" data-delete>Hapus</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
      listHost.querySelectorAll('[data-id]').forEach(row=>{
        const id=row.dataset.id;
        const objective=daftar.find(item=>item.id===id);
        row.querySelector('[data-toggle]').onclick=()=>{
          try{setActiveObjective(session,subjectId,id,!objective.active);draw();
            toast(`TP ${objective.active?'dinonaktifkan':'diaktifkan'}.`);}
          catch(error){toast(error.message,'error');}
        };
        row.querySelector('[data-up]').onclick=()=>{reorderLearningObjective(session,subjectId,id,-1);draw();};
        row.querySelector('[data-edit]').onclick=()=>openManualForm(objective,draw);
        row.querySelector('[data-delete]').onclick=async()=>{
          if(!await confirmDialog({title:'Hapus Tujuan Pembelajaran',
            message:'TP ini dihapus dari daftar mata pelajaran ini. Nilai dan deskripsi yang sudah tersimpan tidak ikut terhapus.',
            confirmText:'Hapus TP'}))return;
          try{deleteLearningObjective(session,subjectId,id);draw();toast('TP dihapus.');}
          catch(error){toast(error.message,'error');}
        };
      });
    }
    listHost.querySelector('[data-tambah]').onclick=()=>openReferencePicker(draw);
    listHost.querySelector('[data-manual]').onclick=()=>openManualForm(null,draw);
  }

  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};
  draw();
  return root;
}
