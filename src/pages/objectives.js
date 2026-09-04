import { capaianPembelajaranFor, listSchoolObjectives } from '../services/learning-objectives.js';
import { createCpButir, deleteCpButir, getCpButirScoreSheet, JENIS_PENILAIAN, jenisPenilaian,
  listCpButir, saveCpButirScores, setCpButirActive, updateCpButir } from '../services/cp-butir.js';
import { phaseForClass } from '../services/objectives.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Menu Capaian Pembelajaran — pusat pengelolaan CP dan Butir CP Penilaian.

   RANTAI YANG DIPAKAI HALAMAN INI:
   CP resmi -> Elemen -> Butir CP -> Semester -> Jenis Penilaian -> Nilai siswa.

   CP resmi ditetapkan pemerintah per mata pelajaran dan fase, dan ditampilkan apa adanya pada
   kartu di atas. Karena naskah CP berupa paragraf panjang per elemen, yang dinilai bukan
   paragraf itu melainkan BUTIR CP: pemecahan lingkupnya menjadi satuan yang dapat dinilai.

   Fase tidak pernah dipilih manual - ia dihitung dari tingkat rombel aktif - dan fase tidak
   pernah ikut ke deskripsi murid. Semester adalah pemetaan internal aplikasi: guru bebas
   memindahkan butir antara Semester 1 dan Semester 2 sesuai perencanaan pembelajarannya. */

const SEMESTER_LABEL={1:'Semester 1',2:'Semester 2'};

export function renderObjectives(session){
  const subjects=listActiveSubjects(session);
  let subjectId=subjects[0]?.id||'';
  let filterSemester='ALL';
  const fase=(()=>{try{return phaseForClass(session.classId);}catch{return '';}})();
  const tingkat=Number.parseInt(String(session.classId||''),10)||'';
  const namaMapel=()=>subjects.find(item=>item.id===subjectId)?.name||'';

  const root=el(`<div><div class="page-head"><div><h1>Capaian Pembelajaran</h1><p>Kelola CP dan Butir CP Penilaian per mata pelajaran. Fase ditentukan otomatis dari rombel aktif.</p></div></div>
    <section class="card module-filter"><div class="field compact-field"><label for="objectiveSubject">Mata Pelajaran Aktif</label><select class="input" id="objectiveSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div>
    <div class="field compact-field"><label for="objectivePhase">Fase</label><input class="input readonly" id="objectivePhase" value="Fase ${escapeHtml(fase)} · Kelas ${escapeHtml(String(tingkat))}" readonly/></div>
    <div class="field compact-field"><label for="objectiveSemester">Semester</label><select class="input" id="objectiveSemester" data-semester><option value="ALL">Semua Semester</option><option value="1">Semester 1</option><option value="2">Semester 2</option></select></div>
    <div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
    <div data-cp></div><div data-list></div><div data-legacy></div></div>`);
  const cpHost=root.querySelector('[data-cp]');
  const listHost=root.querySelector('[data-list]');
  const legacyHost=root.querySelector('[data-legacy]');
  if(!subjects.length){
    root.querySelector('[data-subject]').disabled=true;
    listHost.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';
    return root;
  }

  /* ---------------------------------------------------------- Acuan CP (mapel + fase) */
  function drawCp(){
    const cp=capaianPembelajaranFor(session,subjectId);
    if(!cp){cpHost.innerHTML='';return;}
    /* Status Muatan Lokal dibaca dari KEWENANGAN penetapan CP-nya, bukan dari label yang
       tersimpan pada Mapping. */
    const mulok=cp.regulation.scope==='muatan_lokal';
    const rujukan=cp.regulation.decision
      ? `Rujukan: <strong>${escapeHtml(cp.regulation.decision)}</strong> — ${escapeHtml(cp.regulation.title)}.`
      : `Rujukan: <strong>${escapeHtml(cp.regulation.title)}</strong> — kewenangan ${escapeHtml(cp.regulation.authority||'pemerintah daerah')}.`;
    const naskah=cp.naskah
      ? `<div class="cp-naskah">${escapeHtml(cp.naskah)}</div>`
      : `<p class="cp-empty">Naskah CP resmi belum tersedia pada dataset aplikasi. ${escapeHtml(cp.naskahReason)}</p>`;
    cpHost.innerHTML=`<section class="card cp-card"><div class="section-head"><div><h3>Capaian Pembelajaran — Fase ${escapeHtml(cp.phase)}</h3><p>${escapeHtml(namaMapel())} · Kelas ${escapeHtml(String(cp.grade||''))} · acuan kompetensi resmi yang menjadi induk seluruh Butir CP di bawah.</p></div><div class="cp-badges">${mulok?'<span class="badge badge-c">Muatan Lokal</span>':''}<span class="badge badge-a">Fase ${escapeHtml(cp.phase)}</span></div></div>
      ${cp.available?'':`<p class="cp-empty">Mata pelajaran ini belum berlaku pada Fase ${escapeHtml(cp.phase)}. ${escapeHtml(cp.naskahReason)}</p>`}
      ${cp.elements.length?`<div class="cp-elements">${cp.elements.map(item=>`<span class="cp-element">${escapeHtml(item.name)}</span>`).join('')}</div>`:''}
      ${cp.available?naskah:''}
      <p class="cp-source">${rujukan}${cp.regulation.note?` ${escapeHtml(cp.regulation.note)}`:''} Butir CP di bawah adalah pemecahan lingkup CP tersebut agar dapat dinilai; induknya tetap elemen CP resmi ini.</p></section>`;
  }

  /* ------------------------------------------------------- Modal + Tambah CP (aktifkan) */
  function openButirPicker(done){
    const nonaktif=listCpButir(session,subjectId,{semester:filterSemester}).filter(item=>item.active===false);
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-wide objective-picker" role="dialog" aria-modal="true" aria-labelledby="pilihCpJudul">
      <div class="modal-head"><div><h3 id="pilihCpJudul">Tambah Capaian Pembelajaran</h3>
        <p>${escapeHtml(namaMapel())} · Kelas ${escapeHtml(String(tingkat))} · ${escapeHtml(session.semester)}</p></div>
        <button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      ${nonaktif.length
        ? `<div class="picker-toolbar"><label class="objective-reference-item picker-all"><input type="checkbox" data-pilih-semua/><span><strong>Pilih Semua</strong></span></label><span class="objective-picker-count" data-pick-count>0 Butir CP dipilih</span></div>
           <div class="objective-reference-list" data-picker-list>${nonaktif.map(item=>`<label class="objective-reference-item"><input type="checkbox" data-ref value="${escapeHtml(item.id)}"/><span>${escapeHtml(item.name)}<small class="cp-tag">Elemen CP: ${escapeHtml(item.elementName)} · ${escapeHtml(SEMESTER_LABEL[item.semester]||'')}</small></span></label>`).join('')}</div>`
        : '<p class="objective-picker-note">Seluruh Butir CP mata pelajaran ini sudah aktif pada daftar. Gunakan <strong>Buat CP Manual</strong> bila ingin menambah butir rumusan sendiri.</p>'}
      <div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button>
        <button type="button" class="btn btn-primary" data-simpan${nonaktif.length?'':' disabled'}>Aktifkan Butir CP Terpilih</button></div></div></div>`);
    document.body.append(modal);
    const tutup=()=>modal.remove();
    const kotak=()=>[...modal.querySelectorAll('[data-ref]')];
    const hitung=()=>{
      const n=kotak().filter(item=>item.checked).length;
      modal.querySelector('[data-pick-count]').textContent=`${n} Butir CP dipilih`;
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
      if(!ids.length){toast('Pilih minimal satu Butir CP.','warning');return;}
      try{
        ids.forEach(id=>setCpButirActive(session,subjectId,id,true));
        tutup();done();
        toast(`${ids.length} Butir CP diaktifkan.`);
      }catch(error){toast(error.message,'error');}
    };
  }

  /* ------------------------------------------------------------- Modal CP manual / edit */
  function openManualForm(butir,done){
    const cp=capaianPembelajaranFor(session,subjectId);
    const elemen=cp?.elements||[];
    const modal=el(`<div class="modal-backdrop"><form class="modal-card modal-wide objective-form" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>${butir?'Edit':'Buat'} Capaian Pembelajaran</h3>
        <p>${escapeHtml(namaMapel())} · Kelas ${escapeHtml(String(tingkat))}</p></div>
        <button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      <div class="field"><label for="cpElemen">Elemen CP *</label>
        <select class="input" id="cpElemen" name="elementId" required>${elemen.map(item=>`<option value="${escapeHtml(item.id)}"${butir?.elementId===item.id?' selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="cpNama">Nama Butir CP *</label>
        <input class="input" id="cpNama" name="name" maxlength="150" required value="${escapeHtml(butir?.name||'')}"/></div>
      <div class="field"><label for="cpTeori">Isi Butir CP — Pengetahuan</label>
        <textarea class="input" id="cpTeori" name="teori" maxlength="400" rows="2" placeholder="dibaca setelah kata memahami/menguasai">${escapeHtml(butir?.teori||'')}</textarea></div>
      <div class="field"><label for="cpPraktik">Isi Butir CP — Keterampilan</label>
        <textarea class="input" id="cpPraktik" name="praktik" maxlength="400" rows="2" placeholder="dibaca setelah kata mampu/terampil">${escapeHtml(butir?.praktik||'')}</textarea></div>
      <div class="field"><label for="cpSemester">Semester *</label>
        <select class="input" id="cpSemester" name="semester">${[1,2].map(nomor=>`<option value="${nomor}"${Number(butir?.semester||1)===nomor?' selected':''}>${SEMESTER_LABEL[nomor]}</option>`).join('')}</select></div>
      <div class="field"><label for="cpJenis">Jenis Penilaian *</label>
        <select class="input" id="cpJenis" name="jenis">${JENIS_PENILAIAN.map(item=>`<option value="${escapeHtml(item.id)}"${(butir?.jenis||'teori')===item.id?' selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select></div>
      <label class="objective-reference-item"><input type="checkbox" name="active" ${butir?.active===false?'':'checked'}/><span><strong>Aktif</strong> — dipakai penilaian, Intrakurikuler, dan deskripsi rapor.</span></label>
      <div class="login-error hidden" data-error></div>
      <div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button>
        <button type="submit" class="btn btn-primary">${butir?'Simpan Perubahan':'Tambah CP'}</button></div></form></div>`);
    document.body.append(modal);
    const tutup=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=tutup;
    modal.querySelector('[data-cancel]').onclick=tutup;
    modal.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      const kotak=modal.querySelector('[data-error]');kotak.classList.add('hidden');
      const form=event.currentTarget.elements;
      const isian={elementId:form.elementId.value,name:form.name.value,teori:form.teori.value,
        praktik:form.praktik.value,semester:form.semester.value,jenis:form.jenis.value,
        active:form.active.checked};
      try{
        if(butir)updateCpButir(session,subjectId,butir.id,isian);
        else createCpButir(session,subjectId,isian);
        tutup();done();toast(butir?'Butir CP berhasil diperbarui.':'Butir CP berhasil ditambahkan.');
      }catch(error){kotak.textContent=error.message;kotak.classList.remove('hidden');}
    };
  }

  /* ------------------------------------------------------------ Modal input nilai butir */
  function openScoreForm(butir,done){
    let sheet;
    try{sheet=getCpButirScoreSheet(session,subjectId,butir.id);}
    catch(error){toast(error.message,'error');return;}
    const info=sheet.jenis;
    const kolom=`${sheet.kolomTeori?'<th>Nilai Teori</th>':''}${sheet.kolomPraktik?'<th>Nilai Praktik</th>':''}`;
    const modal=el(`<div class="modal-backdrop"><form class="modal-card modal-wide" role="dialog" aria-modal="true">
      <div class="modal-head"><div><h3>Nilai Butir CP</h3>
        <p>${escapeHtml(butir.name)} · Elemen ${escapeHtml(butir.elementName)} · ${escapeHtml(info.label)}</p></div>
        <button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      ${sheet.rows.length
        ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>No</th><th>Nama Siswa</th>${kolom}</tr></thead>
           <tbody>${sheet.rows.map((row,index)=>`<tr data-student="${escapeHtml(row.studentId)}"><td>${index+1}</td><td>${escapeHtml(row.name)}</td>
             ${sheet.kolomTeori?`<td><input class="input" type="number" min="0" max="100" step="0.01" data-teori value="${row.teori===null?'':escapeHtml(String(row.teori))}"/></td>`:''}
             ${sheet.kolomPraktik?`<td><input class="input" type="number" min="0" max="100" step="0.01" data-praktik value="${row.praktik===null?'':escapeHtml(String(row.praktik))}"/></td>`:''}</tr>`).join('')}</tbody></table></div>`
        : '<p class="objective-picker-note">Belum ada siswa pada rombel ini.</p>'}
      <div class="login-error hidden" data-error></div>
      <div class="modal-actions"><button type="button" class="btn btn-light" data-cancel>Batal</button>
        <button type="submit" class="btn btn-primary" data-simpan-nilai>Simpan Nilai</button></div></form></div>`);
    document.body.append(modal);
    const tutup=()=>modal.remove();
    modal.querySelector('[data-close]').onclick=tutup;
    modal.querySelector('[data-cancel]').onclick=tutup;
    modal.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      const kotak=modal.querySelector('[data-error]');kotak.classList.add('hidden');
      const values={};
      modal.querySelectorAll('[data-student]').forEach(row=>{
        values[row.dataset.student]={
          teori:row.querySelector('[data-teori]')?.value??'',
          praktik:row.querySelector('[data-praktik]')?.value??'',
        };
      });
      try{
        const hasil=saveCpButirScores(session,subjectId,butir.id,values);
        tutup();done();toast(`Nilai ${hasil.tersimpan} siswa tersimpan.`);
      }catch(error){kotak.textContent=error.message;kotak.classList.remove('hidden');}
    };
  }

  /* --------------------------------------------------------------- Riwayat TP lama (baca) */
  function drawLegacy(){
    let lama=[];
    try{lama=listSchoolObjectives(session,subjectId);}catch{lama=[];}
    if(!lama.length){legacyHost.innerHTML='';return;}
    /* Data TP yang pernah dibuat sekolah TIDAK dihapus dan tetap dapat dibaca di sini. Ia tidak
       lagi menjadi dasar penilaian; penilaian kompetensi memakai Butir CP di atas. */
    legacyHost.innerHTML=`<section class="card"><div class="section-head"><div><h3>Arsip Tujuan Pembelajaran</h3>
      <p>${lama.length} catatan TP lama pada mata pelajaran ini tetap tersimpan dan dapat dibaca. Penilaian kompetensi kini memakai Butir CP di atas.</p></div></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>No</th><th>Tujuan Pembelajaran</th><th>Status</th></tr></thead>
      <tbody>${lama.map((item,index)=>`<tr><td>${index+1}</td><td class="objective-text">${escapeHtml(item.description)}</td><td><span class="badge ${item.active?'badge-active':'badge-inactive'}">${item.active?'Aktif':'Nonaktif'}</span></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* ------------------------------------------------------------------ Tabel Butir CP */
  function draw(){
    drawCp();
    drawLegacy();
    let daftar=[];
    try{daftar=listCpButir(session,subjectId,{semester:filterSemester});}
    catch{daftar=[];}
    const aktif=daftar.filter(item=>item.active!==false).length;
    const kepala=`<div class="section-head"><div><h3>Butir CP Penilaian</h3><p>${escapeHtml(namaMapel())} · ${daftar.length?`${aktif} aktif dari ${daftar.length} Butir CP`:'belum ada Butir CP'} · Butir CP aktif menjadi objek penilaian, sumber deskripsi Intrakurikuler, dan sumber deskripsi rapor.</p></div>
      <div class="row-actions"><button class="btn btn-primary btn-small" data-tambah>${icon('target',15)} Tambah CP</button><button class="btn btn-light btn-small" data-manual>Buat CP Manual</button></div></div>`;
    if(!daftar.length){
      listHost.innerHTML=`<section class="card">${kepala}<div class="empty-state"><h3>Belum ada Butir CP</h3><p>Tekan <strong>Buat CP Manual</strong> untuk merumuskan Butir CP sendiri pada mata pelajaran ini.</p></div></section>`;
    }else{
      listHost.innerHTML=`<section class="card">${kepala}
        <div class="table-scroll"><table class="data-table objective-table"><thead><tr><th>No</th><th>Elemen CP</th><th>Butir CP</th><th>Semester</th><th>Jenis Penilaian</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${daftar.map((item,index)=>{
          const info=jenisPenilaian(item.jenis)||jenisPenilaian('teori');
          return `<tr data-id="${escapeHtml(item.id)}"><td>${index+1}</td><td>${escapeHtml(item.elementName)}</td>
          <td class="objective-text"><strong>${escapeHtml(item.name)}</strong>${item.teori?`<small class="cp-tag">Pengetahuan: ${escapeHtml(item.teori)}</small>`:''}${item.praktik?`<small class="cp-tag">Keterampilan: ${escapeHtml(item.praktik)}</small>`:''}${item.isDefault?'':'<small class="cp-tag">Butir CP buatan guru</small>'}</td>
          <td><span class="badge badge-a">${escapeHtml(String(item.semester))}</span></td>
          <td><select class="input compact-input" data-jenis>${JENIS_PENILAIAN.map(pilihan=>`<option value="${escapeHtml(pilihan.id)}"${pilihan.id===info.id?' selected':''}>${escapeHtml(pilihan.singkat)}</option>`).join('')}</select></td>
          <td><span class="badge ${item.active!==false?'badge-active':'badge-inactive'}">${item.active!==false?'Aktif':'Nonaktif'}</span></td>
          <td><div class="row-actions"><button class="btn btn-primary btn-small" data-nilai${item.active===false?' disabled':''}>Nilai</button><button class="btn btn-light btn-small" data-toggle>${item.active!==false?'Nonaktifkan':'Aktifkan'}</button><button class="btn btn-light btn-small" data-edit>Edit</button>${item.isDefault?'':'<button class="btn btn-danger btn-small" data-delete>Hapus</button>'}</div></td></tr>`;}).join('')}</tbody></table></div></section>`;
      listHost.querySelectorAll('[data-id]').forEach(row=>{
        const id=row.dataset.id;
        const butir=daftar.find(item=>item.id===id);
        row.querySelector('[data-jenis]').onchange=event=>{
          try{updateCpButir(session,subjectId,id,{...butir,jenis:event.target.value});draw();
            toast('Jenis penilaian Butir CP diperbarui.');}
          catch(error){toast(error.message,'error');draw();}
        };
        row.querySelector('[data-nilai]').onclick=()=>openScoreForm(butir,draw);
        row.querySelector('[data-toggle]').onclick=()=>{
          try{setCpButirActive(session,subjectId,id,butir.active===false);draw();
            toast(`Butir CP ${butir.active===false?'diaktifkan':'dinonaktifkan'}.`);}
          catch(error){toast(error.message,'error');}
        };
        row.querySelector('[data-edit]').onclick=()=>openManualForm(butir,draw);
        const hapus=row.querySelector('[data-delete]');
        if(hapus)hapus.onclick=async()=>{
          if(!await confirmDialog({title:'Hapus Butir CP',
            message:'Butir CP buatan guru ini dihapus dari daftar. Nilai siswa yang sudah tersimpan tidak ikut terhapus.',
            confirmText:'Hapus Butir CP'}))return;
          try{deleteCpButir(session,subjectId,id);draw();toast('Butir CP dihapus.');}
          catch(error){toast(error.message,'error');}
        };
      });
    }
    listHost.querySelector('[data-tambah]').onclick=()=>openButirPicker(draw);
    listHost.querySelector('[data-manual]').onclick=()=>openManualForm(null,draw);
  }

  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};
  root.querySelector('[data-semester]').onchange=event=>{filterSemester=event.target.value;draw();};
  draw();
  return root;
}
