import { SCHOOL_STATUSES, getSchoolMaster, saveSchoolIdentitySetup } from '../services/master.js';
import { APP_NAME, COPYRIGHT, DEVELOPER_CREDIT_LEAD, DEVELOPER_NAME, DEVELOPER_ROLE } from '../data/app-identity.js';
import { el, escapeHtml, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/* Setup Awal Sekolah. Muncul hanya pada instalasi yang identitas sekolahnya belum diisi, dan
   berhenti muncul selamanya setelah nama sekolah tersimpan. Halaman ini TIDAK membuat sistem
   autentikasi baru: setelah identitas tersimpan, alur berlanjut ke aktivasi dan login yang
   sudah ada. Identitas pembuat aplikasi di bawah bersifat permanen dan tidak dapat diedit. */

const FIELDS=Object.freeze([
  {name:'name',label:'Nama Sekolah',required:true,span:true,placeholder:'Contoh: SDN Contoh Nusantara 02'},
  {name:'npsn',label:'NPSN',placeholder:'8 digit'},
  {name:'registrationNumber',label:'NIS/NSS/NDS'},
  {name:'address',label:'Alamat Sekolah',span:true},
  {name:'village',label:'Desa/Kelurahan'},
  {name:'district',label:'Kecamatan'},
  {name:'city',label:'Kabupaten/Kota',placeholder:'Contoh: Kabupaten Bekasi'},
  {name:'province',label:'Provinsi'},
  {name:'postalCode',label:'Kode Pos',extra:'inputmode="numeric" maxlength="5"'},
  {name:'phone',label:'Nomor Telepon'},
  {name:'email',label:'E-mail'},
  {name:'website',label:'Website'},
  {name:'principalName',label:'Nama Kepala Sekolah'},
  {name:'principalNip',label:'NIP Kepala Sekolah'},
]);

export function renderSchoolSetup({onComplete}={}){
  const school=getSchoolMaster();
  let schoolLogo=String(school.schoolLogo||'');
  const field=item=>`<div class="field${item.span?' form-span-2':''}"><label>${escapeHtml(item.label)}${item.required?' *':''}</label><input class="input" name="${item.name}" value="${escapeHtml(school[item.name]||'')}" ${item.placeholder?`placeholder="${escapeHtml(item.placeholder)}"`:''} ${item.extra||''} ${item.required?'required':''}/></div>`;

  const root=el(`<main class="setup-stage">
    <form class="card setup-card" data-setup>
      <div class="section-head"><div><h1>Setup Awal ${escapeHtml(APP_NAME)}</h1><p>Isi identitas sekolah Anda sekali saja. Data ini dipakai pada login, dashboard, rapor, cover, leger, dan transkrip, serta dapat diubah kapan saja melalui menu Data Sekolah.</p></div></div>
      <div class="form-grid">
        ${FIELDS.map(field).join('')}
        <div class="field"><label>Status Sekolah</label><select class="input" name="status">${['',...SCHOOL_STATUSES].map(value=>`<option value="${escapeHtml(value)}" ${value===(school.status||'')?'selected':''}>${escapeHtml(value||'Belum dipilih')}</option>`).join('')}</select></div>
        <div class="field form-span-2"><label>Logo Sekolah</label><input class="input" type="file" accept="image/*" data-school-logo/><small class="setup-hint" data-logo-status>${schoolLogo?'Logo tersimpan.':'Opsional. Dapat diunggah kemudian melalui Logo dan Tanda Tangan.'}</small></div>
      </div>
      <div class="login-error hidden" data-error></div>
      <div class="actions"><button class="btn btn-primary" type="submit">${icon('save',16)} Simpan dan Lanjutkan</button></div>
    </form>
    <footer class="setup-credit">
      <span>${escapeHtml(DEVELOPER_CREDIT_LEAD)}</span>
      <strong>${escapeHtml(DEVELOPER_NAME)}</strong>
      <span>${escapeHtml(DEVELOPER_ROLE)}</span>
      <small>${escapeHtml(COPYRIGHT)}</small>
    </footer>
  </main>`);

  const status=root.querySelector('[data-logo-status]');
  root.querySelector('[data-school-logo]').onchange=event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{schoolLogo=String(reader.result||'');status.textContent=`${file.name} siap disimpan.`;};
    reader.onerror=()=>{status.textContent='Berkas logo tidak dapat dibaca.';};
    reader.readAsDataURL(file);
  };

  root.querySelector('[data-setup]').onsubmit=event=>{
    event.preventDefault();
    const box=root.querySelector('[data-error]');box.classList.add('hidden');
    const fields=event.currentTarget.elements;
    try{
      saveSchoolIdentitySetup({...Object.fromEntries([...FIELDS.map(item=>item.name),'status'].map(name=>[name,fields[name].value])),schoolLogo});
      toast('Identitas sekolah berhasil disimpan.');
      onComplete?.();
    }catch(error){box.textContent=error.message;box.classList.remove('hidden');}
  };
  return root;
}
