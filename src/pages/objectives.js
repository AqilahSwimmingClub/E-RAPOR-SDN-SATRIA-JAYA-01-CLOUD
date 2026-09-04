import { capaianPembelajaranFor, listSchoolObjectives } from '../services/learning-objectives.js';
import { deactivateAllCpButir } from '../services/cp-butir.js';
import { createCpButir, deleteCpButir, listCpButir, setCpButirActive,
  updateCpButir } from '../services/cp-butir.js';
import { phaseForClass } from '../services/objectives.js';
import { listActiveSubjects } from '../services/subjects.js';
import { confirmDialog, el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Menu Capaian Pembelajaran — SATU TUGAS SAJA: mengelola Butir CP.

   YANG DILIHAT GURU, dan tidak lebih dari ini:

       Pilih Mata Pelajaran -> Daftar Butir CP -> Aktif/Nonaktif, Edit, Tambah, Nonaktifkan Semua

   STRUKTUR CP INDUK TIDAK DITAMPILKAN. Halaman ini dulu membuka dengan kartu berisi naskah CP
   resmi lengkap - paragraf "Pada akhir Fase C ...", penomoran 3, 3.1, 3.2, deretan chip nama
   elemen, dan satu paragraf rujukan regulasi. Semuanya dibuang dari layar karena tidak satu pun
   dapat ditindaklanjuti guru: ia tidak dapat mengubahnya, tidak perlu memilihnya, dan pada HP
   ia justru mendorong daftar Butir CP - satu-satunya hal yang memang dikerjakan - jauh ke bawah.

   DATANYA SENDIRI TIDAK DIHAPUS. `curriculum-cp.js`, `curriculum-cp-naskah.js`, dan seluruh
   elemen resmi tetap utuh di dalam aplikasi dan tetap dipakai: setiap Butir CP masih menunjuk
   `elementId` induknya, form Tambah/Edit masih memilih Elemen CP resmi dari dataset itu, dan
   penyusun deskripsi masih membacanya. Yang hilang hanyalah tampilannya.

   Tidak ada Semester, Jenis Penilaian, Teori/Praktik, maupun input angka di sini - ketiganya
   milik Intrakurikuler dan Rapor. */

export function renderObjectives(session){
  const subjects=listActiveSubjects(session);
  let subjectId=subjects[0]?.id||'';
  const fase=(()=>{try{return phaseForClass(session.classId);}catch{return '';}})();
  const tingkat=Number.parseInt(String(session.classId||''),10)||'';
  const namaMapel=()=>subjects.find(item=>item.id===subjectId)?.name||'';

  const root=el(`<div><div class="page-head"><div><h1>Capaian Pembelajaran</h1><p>Kelola Butir CP per mata pelajaran. Fase ditentukan otomatis dari rombel aktif.</p></div></div>
    <section class="card module-filter"><div class="field compact-field"><label for="objectiveSubject">Mata Pelajaran Aktif</label><select class="input" id="objectiveSubject" data-subject>${subjects.map(subject=>`<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join('')}</select></div>
    <div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
    <div data-list></div><div data-legacy></div></div>`);
  const listHost=root.querySelector('[data-list]');
  const legacyHost=root.querySelector('[data-legacy]');
  if(!subjects.length){
    root.querySelector('[data-subject]').disabled=true;
    listHost.innerHTML='<section class="card empty-state"><h3>Tidak ada mata pelajaran aktif</h3><p>Aktifkan mata pelajaran melalui Mapping Mata Pelajaran.</p></section>';
    return root;
  }

  /* ------------------------------------------------------- Modal + Tambah CP (aktifkan) */
  function openButirPicker(done){
    const nonaktif=listCpButir(session,subjectId).filter(item=>item.active===false);
    const modal=el(`<div class="modal-backdrop"><div class="modal-card modal-wide objective-picker" role="dialog" aria-modal="true" aria-labelledby="pilihCpJudul">
      <div class="modal-head"><div><h3 id="pilihCpJudul">Tambah Capaian Pembelajaran</h3>
        <p>${escapeHtml(namaMapel())} · Kelas ${escapeHtml(String(tingkat))}</p></div>
        <button type="button" class="btn btn-light btn-icon" data-close aria-label="Tutup">${icon('x',17)}</button></div>
      ${nonaktif.length
        ? `<div class="picker-toolbar"><label class="objective-reference-item picker-all"><input type="checkbox" data-pilih-semua/><span><strong>Pilih Semua</strong></span></label><span class="objective-picker-count" data-pick-count>0 Butir CP dipilih</span></div>
           <div class="objective-reference-list" data-picker-list>${nonaktif.map(item=>`<label class="objective-reference-item"><input type="checkbox" data-ref value="${escapeHtml(item.id)}"/><span>${escapeHtml(item.name)}</span></label>`).join('')}</div>`
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

  /* ------------------------------------------------------------- Modal CP manual / edit

     Form ini TIDAK meminta Semester dan TIDAK meminta Jenis Penilaian. Yang diisi guru hanyalah
     elemen induknya, nama butir, dan rumusan substansinya. */
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
      <div class="field"><label for="cpTeori">Rumusan Pengetahuan</label>
        <textarea class="input" id="cpTeori" name="teori" maxlength="400" rows="2" placeholder="dibaca setelah kata memahami/menguasai">${escapeHtml(butir?.teori||'')}</textarea></div>
      <div class="field"><label for="cpPraktik">Rumusan Keterampilan</label>
        <textarea class="input" id="cpPraktik" name="praktik" maxlength="400" rows="2" placeholder="dibaca setelah kata mampu/terampil">${escapeHtml(butir?.praktik||'')}</textarea></div>
      <p class="objective-picker-note">Isi minimal salah satu rumusan. Teori atau Praktik dipilih saat penilaian Intrakurikuler, bukan di sini, dan semester mengikuti semester aplikasi yang sedang aktif.</p>
      <label class="objective-reference-item"><input type="checkbox" name="active" ${butir?.active===false?'':'checked'}/><span><strong>Aktif</strong> — dipakai Intrakurikuler dan deskripsi rapor.</span></label>
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
        praktik:form.praktik.value,active:form.active.checked};
      try{
        if(butir)updateCpButir(session,subjectId,butir.id,isian);
        else createCpButir(session,subjectId,isian);
        tutup();done();toast(butir?'Butir CP berhasil diperbarui.':'Butir CP berhasil ditambahkan.');
      }catch(error){kotak.textContent=error.message;kotak.classList.remove('hidden');}
    };
  }

  /* --------------------------------------------------------------- Riwayat TP lama (baca) */
  function drawLegacy(){
    let lama=[];
    try{lama=listSchoolObjectives(session,subjectId);}catch{lama=[];}
    if(!lama.length){legacyHost.innerHTML='';return;}
    /* Data TP yang pernah dibuat sekolah TIDAK dihapus dan tetap dapat dibaca di sini. Ia tidak
       lagi menjadi dasar penilaian maupun sumber deskripsi mana pun. */
    legacyHost.innerHTML=`<section class="card"><div class="section-head"><div><h3>Arsip Tujuan Pembelajaran</h3>
      <p>${lama.length} catatan TP lama pada mata pelajaran ini tetap tersimpan dan dapat dibaca. Penilaian kompetensi kini memakai Butir CP di atas.</p></div></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>No</th><th>Tujuan Pembelajaran</th><th>Status</th></tr></thead>
      <tbody>${lama.map((item,index)=>`<tr><td>${index+1}</td><td class="objective-text">${escapeHtml(item.description)}</td><td><span class="badge ${item.active?'badge-active':'badge-inactive'}">${item.active?'Aktif':'Nonaktif'}</span></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* ------------------------------------------------------------------ Daftar Butir CP

     DUA PENYAJIAN, SATU SUMBER DATA. Tabel dipakai pada layar lebar; kartu dipakai pada HP dan
     tablet portrait. Keduanya ditulis sekaligus dan CSS yang memilih mana yang tampil, sehingga
     aksi Aktif/Nonaktif dan Edit selalu berada di tempat yang dapat disentuh - tidak pernah
     tersembunyi jauh di kanan tabel yang harus digeser dulu. */
  function draw(){
    drawLegacy();
    let daftar=[];
    try{daftar=listCpButir(session,subjectId);}
    catch{daftar=[];}
    const aktif=daftar.filter(item=>item.active!==false).length;
    const kepala=`<div class="section-head"><div><h3>Butir CP</h3><p>${escapeHtml(namaMapel())} · ${daftar.length?`${aktif} aktif dari ${daftar.length} Butir CP`:'belum ada Butir CP'} · Butir CP aktif menjadi pilihan penilaian Intrakurikuler dan sumber deskripsi rapor.</p></div>
      <div class="row-actions"><button class="btn btn-primary btn-small" data-tambah>${icon('target',15)} Tambah CP</button><button class="btn btn-light btn-small" data-manual>Buat CP Manual</button>${aktif?'<button class="btn btn-danger btn-small" data-nonaktif-semua>Nonaktifkan Semua</button>':''}</div></div>`;
    if(!daftar.length){
      listHost.innerHTML=`<section class="card">${kepala}<div class="empty-state"><h3>Belum ada Butir CP</h3><p>Tekan <strong>Buat CP Manual</strong> untuk merumuskan Butir CP sendiri pada mata pelajaran ini.</p></div></section>`;
    }else{
      const substansi=item=>[
        item.teori?`<small class="cp-tag">Pengetahuan: ${escapeHtml(item.teori)}</small>`:'',
        item.praktik?`<small class="cp-tag">Keterampilan: ${escapeHtml(item.praktik)}</small>`:'',
        item.isDefault?'':'<small class="cp-tag">Butir CP buatan guru</small>',
      ].join('');
      const aksi=item=>`<button class="btn btn-light btn-small" data-toggle>${item.active!==false?'Nonaktifkan':'Aktifkan'}</button><button class="btn btn-light btn-small" data-edit>Edit</button>${item.isDefault?'':'<button class="btn btn-danger btn-small" data-delete>Hapus</button>'}`;
      const lencana=item=>`<span class="badge ${item.active!==false?'badge-active':'badge-inactive'}">${item.active!==false?'Aktif':'Nonaktif'}</span>`;
      listHost.innerHTML=`<section class="card">${kepala}
        <div class="table-scroll cp-table-wrap"><table class="data-table objective-table"><thead><tr><th>No</th><th>Butir CP</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${daftar.map((item,index)=>`<tr data-id="${escapeHtml(item.id)}"><td>${index+1}</td>
          <td class="objective-text"><strong>${escapeHtml(item.name)}</strong>${substansi(item)}</td>
          <td>${lencana(item)}</td>
          <td><div class="row-actions">${aksi(item)}</div></td></tr>`).join('')}</tbody></table></div>
        <div class="cp-card-list">${daftar.map(item=>`<article class="cp-butir-card" data-id="${escapeHtml(item.id)}">
          <div class="cp-butir-head"><h4>${escapeHtml(item.name)}</h4>${lencana(item)}</div>
          ${substansi(item)}
          <div class="row-actions cp-butir-actions">${aksi(item)}</div></article>`).join('')}</div></section>`;
      /* Satu butir muncul dua kali di DOM - sekali sebagai baris tabel, sekali sebagai kartu -
         sehingga penanganannya dipasang ke SELURUH simpul dengan id yang sama. */
      const perButir=new Map();
      listHost.querySelectorAll('[data-id]').forEach(simpul=>{
        const id=simpul.dataset.id;
        if(!perButir.has(id))perButir.set(id,[]);
        perButir.get(id).push(simpul);
      });
      for(const [id,simpulan] of perButir){
        const butir=daftar.find(item=>item.id===id);
        if(!butir)continue;
        for(const simpul of simpulan){
          simpul.querySelector('[data-toggle]').onclick=()=>{
            try{setCpButirActive(session,subjectId,id,butir.active===false);draw();
              toast(`Butir CP ${butir.active===false?'diaktifkan':'dinonaktifkan'}.`);}
            catch(error){toast(error.message,'error');}
          };
          simpul.querySelector('[data-edit]').onclick=()=>openManualForm(butir,draw);
          const hapus=simpul.querySelector('[data-delete]');
          if(hapus)hapus.onclick=async()=>{
            if(!await confirmDialog({title:'Hapus Butir CP',
              message:'Butir CP buatan guru ini dihapus dari daftar. Catatan siswa yang sudah tersimpan tidak ikut terhapus.',
              confirmText:'Hapus Butir CP'}))return;
            try{deleteCpButir(session,subjectId,id);draw();toast('Butir CP dihapus.');}
            catch(error){toast(error.message,'error');}
          };
        }
      }
    }
    listHost.querySelector('[data-tambah]').onclick=()=>openButirPicker(draw);
    listHost.querySelector('[data-manual]').onclick=()=>openManualForm(null,draw);
    /* NONAKTIFKAN SEMUA - hanya mata pelajaran yang SEDANG DIPILIH.

       `subjectId` dikunci ke variabel lokal sebelum dialog konfirmasi dibuka, sehingga
       seandainya guru sempat mengganti mapel sementara dialog terbuka, yang dinonaktifkan tetap
       mapel yang ia maksud saat menekan tombol - bukan mapel yang kebetulan aktif sesudahnya.

       Tidak ada tombol "Aktifkan Semua", dan itu disengaja: menonaktifkan seluruh butir adalah
       titik awal yang wajar - guru menyalakan hanya kompetensi yang benar-benar ia ajarkan -
       sedangkan menyalakan semuanya sekaligus mengembalikan keadaan yang justru ingin dihindari. */
    const tombolNonaktif=listHost.querySelector('[data-nonaktif-semua]');
    if(tombolNonaktif)tombolNonaktif.onclick=async()=>{
      const mapelDiproses=subjectId;
      const nama=subjects.find(item=>item.id===mapelDiproses)?.name||'';
      if(!await confirmDialog({title:'Nonaktifkan Semua Butir CP',
        message:`Nonaktifkan seluruh Butir CP pada mata pelajaran ${nama}? Butir CP mata pelajaran lain tidak tersentuh. Tidak ada CP, nilai, Intrakurikuler, maupun deskripsi rapor yang dihapus — Butir CP hanya berhenti ditawarkan sampai Anda mengaktifkannya lagi satu per satu.`,
        confirmText:'Nonaktifkan Semua'}))return;
      try{
        const hasil=deactivateAllCpButir(session,mapelDiproses);
        draw();
        toast(`${hasil.dinonaktifkan} Butir CP ${nama} dinonaktifkan.`);
      }catch(error){toast(error.message,'error');}
    };
  }

  root.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};
  draw();
  return root;
}
