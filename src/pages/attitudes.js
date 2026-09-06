import { ATTITUDE_DEVELOPMENT_LEVELS, ATTITUDE_DIMENSIONS, attitudeEvidenceOptions, clearStudentAttitude,
  generateAttitudeDescription, listStudentAttitudes, saveClassAttitudeBulk, saveStudentAttitude } from '../services/attitudes.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Capaian bawaan memakai empat tingkat resmi. Catatan lama yang memakai istilah versi
   sebelumnya tetap muncul sebagai pilihan tambahan pada barisnya sendiri, ditandai apa adanya,
   supaya guru bisa membacanya dan menggantinya - bukan kehilangan nilainya diam-diam. */
function levelOptions(current){
  const nilai=String(current||'');
  const daftar=ATTITUDE_DEVELOPMENT_LEVELS.map(item=>({value:item.label,text:`${item.label} (${item.code})`}));
  if(nilai&&!daftar.some(item=>item.value===nilai))daftar.push({value:nilai,text:`${nilai} (versi lama)`});
  return `<option value="">Tidak diisi</option>${daftar.map(item=>`<option value="${escapeHtml(item.value)}" ${nilai===item.value?'selected':''}>${escapeHtml(item.text)}</option>`).join('')}`;
}

/* BUKTI SELALU DIAMBIL DARI BANK DIMENSI BARISNYA SENDIRI.
   Dropdown Gotong Royong hanya pernah memuat bukti Gotong Royong. Bukti tersimpan yang bukan
   milik dimensi ini tidak akan pernah terpilih, sehingga nilai lama dari dimensi lain tidak
   bisa mengambil alih saat halaman digambar ulang. */
function evidenceOptions(dimensionId,current){
  const bank=attitudeEvidenceOptions(dimensionId);
  const nilai=bank.includes(String(current||''))?String(current):'';
  return `<option value="">Tidak dipilih</option>${bank.map(item=>`<option value="${escapeHtml(item)}" ${nilai===item?'selected':''}>${escapeHtml(item)}</option>`).join('')}`;
}

export function renderAttitudes(session){
  const students=listStudents(session,{classId:session.classId});let studentId=students[0]?.id||'';
  const root=el(`<div><div class="page-head"><div><h1>Dimensi Nilai Sikap</h1><p>Profil Pelajar Pancasila · enam dimensi opsional, tersimpan per siswa dan scope aktif.</p></div><div class="actions"><button class="btn btn-light" data-apply-all>Isi Semua Siswa</button><button class="btn btn-primary" data-save>${icon('save',17)} Simpan Sikap</button></div></div><section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${students.map(student=>`<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} · ${escapeHtml(student.nis)}</option>`).join('')}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section><div data-view></div></div>`);const view=root.querySelector('[data-view]');

  function draw(){
    if(!studentId){view.innerHTML='<section class="card empty-state"><h3>Belum ada Data Siswa</h3></section>';root.querySelector('[data-save]').disabled=true;root.querySelector('[data-apply-all]').disabled=true;return;}
    const student=students.find(item=>item.id===studentId);
    const records=listStudentAttitudes(session,studentId);
    view.innerHTML=`<section class="card"><div class="section-head"><div><h3>Dimensi Sikap</h3><p>Pilih tingkat perkembangan dan bukti perilakunya. Deskripsi tersusun otomatis dan tetap boleh disunting. Dimensi boleh dibiarkan kosong.</p></div></div><div class="attitude-list">${records.map(record=>`<article data-dimension="${record.dimensionId}"><div><strong>${escapeHtml(record.dimensionLabel)}</strong><span class="badge ${record.status==='EMPTY'?'badge-inactive':'badge-active'}">${record.status==='AUTO'?'Otomatis':record.status==='EDITED'?'Diedit Guru':'Opsional'}</span></div><div class="form-grid"><div class="field"><label>Tingkat Perkembangan</label><select class="input" data-level>${levelOptions(record.level)}</select></div><div class="field"><label>Bukti Perilaku</label><select class="input" data-evidence>${evidenceOptions(record.dimensionId,record.behaviorEvidence)}</select></div><div class="field form-span-2"><label>Deskripsi</label><textarea class="input" rows="3" data-description>${escapeHtml(record.description)}</textarea></div></div><button class="btn btn-light btn-small" data-generate>Generate</button></article>`).join('')}</div></section>`;
    view.querySelectorAll('[data-dimension]').forEach(row=>{
      const level=row.querySelector('[data-level]');const evidence=row.querySelector('[data-evidence]');const description=row.querySelector('[data-description]');
      /* Deskripsi otomatis hanya menimpa dirinya sendiri. Kalimat yang sudah disunting guru
         dibiarkan utuh saat pilihan berubah, dan tombol Generate tetap menjadi jalan sadar
         untuk menyusun ulang. */
      let otomatis=description.value;
      const susun=()=>{if(!level.value)return '';try{return generateAttitudeDescription(student.name,row.dataset.dimension,level.value,evidence.value);}catch{return '';}};
      const segarkan=()=>{const baru=susun();if(!baru)return;if(!description.value.trim()||description.value.trim()===otomatis.trim()){description.value=baru;otomatis=baru;}};
      level.onchange=segarkan;evidence.onchange=segarkan;
      row.querySelector('[data-generate]').onclick=()=>{
        if(!level.value){toast('Pilih tingkat perkembangan terlebih dahulu.','warning');return;}
        const baru=susun();description.value=baru;otomatis=baru;
      };
    });
  }

  function openBulk(){const modal=el(`<div class="modal-backdrop"><form class="modal-card"><div class="modal-head"><div><h3>Isi Sikap Semua Siswa</h3><p>Deskripsi otomatis menyesuaikan nama setiap siswa dan masih bisa disunting per siswa sesudahnya.</p></div><button class="btn btn-light btn-icon" type="button" data-close>${icon('x',17)}</button></div><div class="field"><label>Dimensi yang diisi *</label><div class="objective-reference-list">${ATTITUDE_DIMENSIONS.map(item=>`<div class="objective-reference-item attitude-bulk-item" data-bulk="${escapeHtml(item.id)}"><label><input type="checkbox" name="dimension" value="${escapeHtml(item.id)}"/><span>${escapeHtml(item.label)}</span></label><select class="input" data-bulk-evidence aria-label="Bukti perilaku ${escapeHtml(item.label)}">${evidenceOptions(item.id,'')}</select></div>`).join('')}</div><div class="objective-reference-foot">Hanya dimensi yang dicentang yang diisi. Dimensi yang tidak dicentang dikosongkan untuk seluruh siswa dan tidak muncul di rapor. Bukti perilaku bersifat pilihan dan hanya memuat bukti dimensi itu sendiri.</div></div><div class="field"><label>Tingkat Perkembangan</label><select class="input" name="level">${ATTITUDE_DEVELOPMENT_LEVELS.map(item=>`<option value="${escapeHtml(item.label)}">${escapeHtml(item.label)} (${escapeHtml(item.code)})</option>`).join('')}</select></div><div class="modal-actions"><button class="btn btn-light" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="submit">Terapkan ke ${students.length} Siswa</button></div></form></div>`);document.body.append(modal);const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;modal.querySelector('form').onsubmit=event=>{event.preventDefault();try{const form=event.currentTarget;const dipilih=[...form.querySelectorAll('input[name="dimension"]:checked')].map(item=>item.value);if(!dipilih.length){toast('Centang minimal satu dimensi sikap.','warning');return;}const bukti={};dipilih.forEach(id=>{bukti[id]=form.querySelector(`[data-bulk="${id}"] [data-bulk-evidence]`)?.value||'';});const saved=saveClassAttitudeBulk(session,dipilih,form.elements.level.value,bukti);close();draw();toast(`${dipilih.length} dimensi diterapkan ke ${students.length} siswa (${saved.length} catatan).`);}catch(error){toast(error.message,'error');}};}

  root.querySelector('[data-student]').onchange=event=>{studentId=event.target.value;draw();};root.querySelector('[data-apply-all]').onclick=openBulk;/* SIMPAN MENYALIN LAYAR PERSIS SEPERTI ADANYA: dimensi yang berisi capaian disimpan, dan
     dimensi yang dikembalikan ke "Tidak diisi" DIKOSONGKAN - bukan dilewati begitu saja.
     Melewatinya berarti dimensi yang pernah terisi tidak akan pernah bisa dikosongkan lagi. */
  root.querySelector('[data-save]').onclick=()=>{let saved=0,dikosongkan=0;try{view.querySelectorAll('[data-dimension]').forEach(row=>{const level=row.querySelector('[data-level]').value;if(!level){if(clearStudentAttitude(session,studentId,row.dataset.dimension))dikosongkan+=1;return;}saveStudentAttitude(session,studentId,row.dataset.dimension,{level,behaviorEvidence:row.querySelector('[data-evidence]').value,description:row.querySelector('[data-description]').value});saved+=1;});draw();toast(dikosongkan?`${saved} dimensi sikap disimpan · ${dikosongkan} dikosongkan.`:`${saved} dimensi sikap berhasil disimpan.`);}catch(error){toast(error.message,'error');}};draw();return root;
}
