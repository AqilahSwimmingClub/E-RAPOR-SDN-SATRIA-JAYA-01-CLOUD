import { defaultIntracurricularActivities, generateIntracurricularDescription } from '../data/intracurricular-defaults.js';
import { ACTIVITY_PREDICATES, DEFAULT_ACTIVITY_PREDICATE, getStudentIntracurricular, saveIntracurricularBulk, saveStudentIntracurricular } from '../services/completeness.js';
import { composeIntracurricularDescriptionFromCp, DEFAULT_JENIS_INTRAKURIKULER,
  getIntracurricularCp, getStudentIntracurricularSelection,
  INTRACURRICULAR_PREDICATES, JENIS_INTRAKURIKULER, jenisIntrakurikulerValid,
  listAssignedIntracurricularActivities, listIntracurricularButir, listIntracurricularSubjects,
  previewAllIntracurricular, saveAllIntracurricular } from '../services/intracurricular.js';
import { listStudents } from '../services/students.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* ALUR INTRAKURIKULER:

     Siswa -> Mata Pelajaran -> Butir CP aktif (satu atau beberapa) -> TEORI atau PRAKTIK ->
     PREDIKAT -> Deskripsi.

   Guru TIDAK diminta memilih Tujuan Pembelajaran, TIDAK diminta memilih semester, dan TIDAK
   pernah mengisi angka. Intrakurikuler menghasilkan PREDIKAT dan DESKRIPSI; Nilai Akhir mata
   pelajaran tetap milik menu Rapor.

   BEBERAPA BUTIR, SATU PREDIKAT. Guru yang mencentang tiga Butir CP tidak diminta tiga predikat:
   ketiganya kompetensi yang ditunjukkan pada penilaian yang sama, dan deskripsinya meringkas
   ketiganya menjadi satu kalimat.

   Bila rombel belum punya mapel ber-CP, halaman kembali ke alur kegiatan lama sehingga sekolah
   yang sudah memakainya tidak kehilangan apa pun. */

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

  /* ------------------- Alur CP: mapel -> Butir CP -> Teori/Praktik -> Predikat -> Deskripsi

     Empat pilihan, itu saja. Tidak ada input angka: Intrakurikuler menghasilkan PREDIKAT dan
     DESKRIPSI. Nilai Akhir mata pelajaran tetap milik lima komponen penilaian di menu Rapor.

     DUA TOMBOL SAJA, dan keduanya berlaku untuk SELURUH siswa rombel:

       [Isi Otomatis Semua Siswa]  menyusun hasil untuk semua murid dan MENAMPILKANNYA saja.
       [Simpan Semua]              menyimpan apa yang sedang ditampilkan itu.

     Tidak ada tombol "Simpan Siswa Ini". Selama Simpan Semua belum ditekan, hasilnya masih
     draf: memuat ulang aplikasi mengembalikan keadaan sebelumnya, karena yang belum disimpan
     memang belum menjadi data.

     MATA PELAJARAN ADALAH STATE HALAMAN, bukan turunan catatan siswa yang sedang dibuka.
     Dulu `subjectId` dihitung ulang dari catatan murid pertama setiap kali halaman digambar
     ulang, sehingga sehabis "Isi Otomatis Semua Siswa" mapelnya melompat kembali ke mapel
     pertama - IPAS berubah menjadi Pendidikan Pancasila. Sekarang pilihan guru bertahan sampai
     ia sendiri yang menggantinya.

     DRAF DISIMPAN PER MATA PELAJARAN. Berpindah dari IPAS ke Pendidikan Pancasila tidak
     membawa serta hasil IPAS, dan kembali ke IPAS menemukan draf IPAS masih utuh. */
  let subjectId='';
  let jenis=DEFAULT_JENIS_INTRAKURIKULER;
  let predicate=DEFAULT_ACTIVITY_PREDICATE;
  let butirTerpilih=new Set();
  let mapelTerakhirButir='';
  const drafPerMapel=new Map();
  const drafMapel=()=>{
    if(!drafPerMapel.has(subjectId))drafPerMapel.set(subjectId,new Map());
    return drafPerMapel.get(subjectId);
  };

  function drawSubjectFlow(students,student,subjects){
    if(!subjects.some(item=>item.id===subjectId))subjectId=subjects[0].id;
    const current=getStudentIntracurricularSelection(session,selectedStudentId,subjectId);
    /* Pilihan butir mengikuti catatan murid ketika mapelnya berganti; selama guru berada pada
       mapel yang sama, centangnya tidak pernah direset oleh penggambaran ulang. */
    if(mapelTerakhirButir!==subjectId){
      mapelTerakhirButir=subjectId;
      butirTerpilih=new Set(current?.butirIds||[]);
      if(jenisIntrakurikulerValid(current?.jenis))jenis=current.jenis;
      if(INTRACURRICULAR_PREDICATES.includes(current?.predicate))predicate=current.predicate;
    }

    function render(){
      const draf=drafMapel();
      const tersimpan=getStudentIntracurricularSelection(session,selectedStudentId,subjectId);
      const cp=getIntracurricularCp(session,subjectId);
      const butir=listIntracurricularButir(session,subjectId);
      /* Butir yang sudah tidak aktif dibuang dari centang supaya tidak pernah ikut ke deskripsi. */
      const idAktif=new Set(butir.map(item=>item.id));
      butirTerpilih=new Set([...butirTerpilih].filter(id=>idAktif.has(id)));
      const pilihanButir=butir.length
        ? `<div class="picker-toolbar"><label class="objective-reference-item picker-all"><input type="checkbox" data-butir-semua ${butir.length&&butirTerpilih.size===butir.length?'checked':''}/><span><strong>Pilih Semua</strong></span></label><span class="objective-picker-count" data-butir-count>${butirTerpilih.size} Butir CP dipilih</span></div>
           <div class="objective-reference-list" data-butir-list>${butir.map(item=>`<label class="objective-reference-item"><input type="checkbox" data-butir value="${escapeHtml(item.id)}" ${butirTerpilih.has(item.id)?'checked':''}/><span>${escapeHtml(item.name)}<small class="cp-tag">Elemen CP: ${escapeHtml(item.elementName)}</small></span></label>`).join('')}</div>`
        : `<p class="cp-empty">${escapeHtml(cp.reason||'Belum ada Butir CP aktif pada mata pelajaran ini. Aktifkan Butir CP melalui menu Capaian Pembelajaran.')}</p>`;

      /* Kotak deskripsi menampilkan draf murid yang sedang dibuka bila ada, dan catatan
         tersimpannya bila belum ada draf. */
      const drafSiswa=draf.get(selectedStudentId);
      const isiDeskripsi=drafSiswa?drafSiswa.description:(tersimpan?.description||'');

      /* Daftar seluruh siswa beserta keadaannya. Inilah "hasil yang ditampilkan": guru dapat
         melihat apa yang akan tersimpan sebelum menekan Simpan Semua. */
      const baris=students.map((item,index)=>{
        const draft=draf.get(item.id);
        const simpan=getStudentIntracurricularSelection(session,item.id,subjectId);
        const sumber=draft||simpan;
        const status=draft?'<span class="badge badge-inactive">Draf · belum disimpan</span>'
          :simpan?'<span class="badge badge-active">Tersimpan</span>'
          :'<span class="badge badge-inactive">Belum diisi</span>';
        return `<tr${item.id===selectedStudentId?' class="is-selected"':''}><td>${index+1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(sumber?.predicate||'-')}</td><td>${status}</td><td>${escapeHtml(sumber?.description||'')}</td></tr>`;
      }).join('');
      const jumlahDraf=draf.size;

      view.innerHTML=`<section class="card module-filter"><div class="field compact-field"><label>Siswa</label><select class="input" data-student>${studentOptions(students,selectedStudentId)}</select></div><div class="scope-note">Kelas ${escapeHtml(session.classId)}<span>${escapeHtml(session.semester)} · ${escapeHtml(session.academicYear)}</span></div></section>
        <section class="card"><div class="section-head"><div><h3>Intrakurikuler ${escapeHtml(student.name)}</h3><p>Pilih mata pelajaran, centang Butir CP yang dinilai, tentukan Teori atau Praktik, lalu pilih predikat. Tekan Isi Otomatis Semua Siswa untuk melihat hasilnya, dan Simpan Semua untuk menyimpannya.</p></div></div>
        <div class="form-grid"><div class="field"><label>Mata Pelajaran *</label><select class="input" data-subject>${subjects.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===subjectId?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Jenis Penilaian *</label><select class="input" data-jenis>${JENIS_INTRAKURIKULER.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===jenis?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Predikat *</label><select class="input" data-predicate>${predicateOptions(predicate)}</select></div>
        <div class="field form-span-2"><label>Butir CP yang Dinilai *</label>${pilihanButir}<div class="objective-reference-foot">Hanya Butir CP aktif yang dapat dipilih. Semester penilaian mengikuti ${escapeHtml(session.semester)} dan tidak perlu diatur.</div></div>
        <div class="field form-span-2"><label>Deskripsi *</label><textarea class="input" rows="4" data-description placeholder="Kosongkan untuk memakai deskripsi otomatis...">${escapeHtml(isiDeskripsi)}</textarea><div class="actions" style="margin-top:8px"><button class="btn btn-light" type="button" data-generate-description>${icon('activity',16)} Generate Deskripsi Otomatis</button></div></div></div>
        <div class="actions"><button class="btn btn-light" type="button" data-fill-all>${icon('activity',16)} Isi Otomatis Semua Siswa</button><button class="btn btn-primary" type="button" data-save-all ${jumlahDraf?'':'disabled'}>${icon('save',16)} Simpan Semua</button></div></section>
        <section class="card"><div class="section-head"><div><h3>Hasil Semua Siswa</h3><p>${jumlahDraf?`${jumlahDraf} siswa berstatus draf dan belum tersimpan. Tekan Simpan Semua untuk menyimpannya.`:'Belum ada hasil baru. Tekan Isi Otomatis Semua Siswa untuk menyusunnya.'}</p></div></div><div class="table-scroll"><table class="data-table" data-preview><thead><tr><th>No</th><th>Siswa</th><th>Predikat</th><th>Status</th><th>Deskripsi</th></tr></thead><tbody>${baris}</tbody></table></div></section>`;

      const idTerpilih=()=>[...butirTerpilih];
      const susun=()=>composeIntracurricularDescriptionFromCp(session,{
        subjectId,butirIds:idTerpilih(),jenis,predicate});
      const kotakDeskripsi=()=>view.querySelector('[data-description]');
      /* Menuliskan keadaan formulir murid yang sedang dibuka ke dalam draf. Draf inilah yang
         nanti disimpan oleh Simpan Semua - tidak ada tulisan ke penyimpanan sebelum itu. */
      const catatDraf=teks=>{
        draf.set(selectedStudentId,{studentId:selectedStudentId,name:student.name,subjectId,
          butirIds:idTerpilih(),jenis,predicate,description:String(teks||'').trim()});
      };
      /* Deskripsi otomatis menyesuaikan setiap kali pilihan berubah, kecuali guru sudah
         menuliskan kalimatnya sendiri. Tulisan guru tidak pernah ditimpa. */
      let terakhirOtomatis=isiDeskripsi;
      const segarkanDeskripsi=()=>{
        const kotak=kotakDeskripsi();
        const isi=kotak.value.trim();
        if(isi&&isi!==terakhirOtomatis.trim())return;
        terakhirOtomatis=susun()||'';
        kotak.value=terakhirOtomatis;
        if(draf.has(selectedStudentId))catatDraf(kotak.value);
      };
      const hitungButir=()=>{
        const hitungan=view.querySelector('[data-butir-count]');
        if(hitungan)hitungan.textContent=`${butirTerpilih.size} Butir CP dipilih`;
        const semua=view.querySelector('[data-butir-semua]');
        if(semua)semua.checked=butir.length>0&&butirTerpilih.size===butir.length;
      };
      view.querySelectorAll('[data-butir]').forEach(kotak=>{
        kotak.onchange=()=>{
          if(kotak.checked)butirTerpilih.add(kotak.value);
          else butirTerpilih.delete(kotak.value);
          hitungButir();segarkanDeskripsi();
        };
      });
      const semuaKotak=view.querySelector('[data-butir-semua]');
      if(semuaKotak)semuaKotak.onchange=()=>{
        butirTerpilih=semuaKotak.checked?new Set(butir.map(item=>item.id)):new Set();
        view.querySelectorAll('[data-butir]').forEach(kotak=>{kotak.checked=butirTerpilih.has(kotak.value);});
        hitungButir();segarkanDeskripsi();
      };
      view.querySelector('[data-subject]').onchange=event=>{subjectId=event.target.value;draw();};
      view.querySelector('[data-jenis]').onchange=event=>{jenis=event.target.value;segarkanDeskripsi();};
      view.querySelector('[data-predicate]').onchange=event=>{predicate=event.target.value;segarkanDeskripsi();};
      kotakDeskripsi().oninput=event=>{catatDraf(event.target.value);};
      view.querySelector('[data-generate-description]').onclick=()=>{
        const teks=susun();
        if(!teks){toast(cp.reason||'Pilih minimal satu Butir CP atau aktifkan Butir CP pada menu Capaian Pembelajaran.','warning');return;}
        terakhirOtomatis=teks;
        kotakDeskripsi().value=teks;
        catatDraf(teks);
        render();
        toast('Deskripsi intrakurikuler dibuat otomatis dan menunggu Simpan Semua.');
      };
      /* ISI OTOMATIS SEMUA SISWA: menyusun saja. Tidak ada satu pun tulisan ke penyimpanan. */
      view.querySelector('[data-fill-all]').onclick=()=>{
        try{
          const hasil=previewAllIntracurricular(session,{subjectId,butirIds:idTerpilih(),jenis,predicate});
          for(const row of hasil.rows)draf.set(row.studentId,{...row});
          render();
          const catatan=[`${hasil.rows.length} dari ${hasil.total} siswa tersusun`];
          if(hasil.dilewati.length)catatan.push(`${hasil.dilewati.length} dilewati karena deskripsi manual`);
          catatan.push('belum disimpan');
          toast(catatan.join(' · '),'success');
        }catch(error){toast(error.message,'error');}
      };
      /* SIMPAN SEMUA: menyimpan persis apa yang sedang ditampilkan sebagai draf. */
      view.querySelector('[data-save-all]').onclick=()=>{
        try{
          const hasil=saveAllIntracurricular(session,{subjectId,rows:[...draf.values()]});
          draf.clear();
          draw();
          const catatan=[`${hasil.tersimpan} dari ${hasil.total} siswa tersimpan`];
          if(hasil.gagal.length)catatan.push(`${hasil.gagal.length} gagal`);
          toast(catatan.join(' · '),hasil.gagal.length?'warning':'success');
        }catch(error){toast(error.message,'error');}
      };
      view.querySelector('[data-student]').onchange=event=>{
        selectedStudentId=event.target.value;
        /* Berganti siswa memuat ulang pilihan butir murid itu, tetapi TIDAK mengganti mapel
           dan TIDAK membuang draf yang sudah tersusun. */
        mapelTerakhirButir='';
        draw();
      };
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
