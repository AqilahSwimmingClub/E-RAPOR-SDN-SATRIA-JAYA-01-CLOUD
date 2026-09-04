import { decryptRecovery, encryptRecovery, generateLicenseKey, licenseHash, licenseHint,
  newId, normalizeLicenseKey, signActivationToken } from './crypto.js';
import { isUniqueViolation } from './store.js';

/* Seluruh keputusan lisensi berada di sini, di sisi server, dan ditulis satu kali untuk kedua
   database. Client tidak pernah menentukan apakah sebuah aktivasi sah; ia hanya menerima
   hasilnya beserta token bertanda tangan.

   Tidak ada satu pun jalur di berkas ini yang memberi pengecualian berdasarkan nama sekolah,
   NPSN, atau identitas siapa pun. Setiap perangkat tunduk pada aturan yang sama. */

export const LICENSE_STATUS=Object.freeze(['UNUSED','ACTIVE','SUSPENDED','REVOKED']);
const TOKEN_SCHEMA=1;
/* Client memeriksa ulang ke server setiap 14 hari, dengan masa tenggang 14 hari lagi. */
export const CHECK_INTERVAL_DAYS=14;
export const GRACE_PERIOD_DAYS=14;

export class LicenseError extends Error{
  constructor(code,message,httpStatus=400){super(message);this.code=code;this.httpStatus=httpStatus;}
}

const iso=value=>value instanceof Date?value.toISOString():value;
const nowIso=()=>new Date().toISOString();

async function catat(store,{licenseId=null,type,actor,detail=null}){
  await store.run('INSERT INTO license_events(id,license_id,type,actor,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [newId('evt'),licenseId,type,actor,detail?JSON.stringify(detail):null,nowIso()]);
}
export const logEvent=catat;

function bersih(value,max=180){return String(value??'').trim().slice(0,max);}

/* ------------------------------------------------------------------ Pembuatan lisensi */

export const LICENSE_TYPES=Object.freeze(['CUSTOMER','DEVELOPER']);

/* Lisensi pembeli WAJIB membawa identitas pemiliknya: tanpa nama pembeli, nama sekolah, dan
   NPSN, kunci yang sudah terbit tidak dapat ditelusuri lagi milik siapa. Lisensi DEVELOPER
   adalah lisensi resmi milik pemilik aplikasi untuk QA dan demo, jadi ia tidak memerlukan
   identitas sekolah pembeli — tetapi tetap record nyata dengan kunci, aktivasi server, ikatan
   perangkat, dan audit yang sama persis. */
/* ------------------------------------------------- SEKOLAH/PEMBELI SEBAGAI SATU IDENTITAS

   Data sekolah sudah dimasukkan Owner ketika membuat lisensi. Meminta Owner mengetiknya lagi
   pada menu Sekolah/Pembeli hanya melahirkan dua basis data yang mudah berbeda. Karena itu
   pembuatan lisensi sekaligus MEMBUAT ATAU MENGHUBUNGKAN customer-nya.

   NPSN adalah identitas utamanya. Dua lisensi dengan NPSN sama selalu menunjuk SATU sekolah,
   berapa pun lisensi yang dimilikinya - yang digabung customer-nya, bukan lisensinya. Setiap
   lisensi tetap berdiri sendiri beserta aktivasi dan ikatan perangkatnya.

   Perbedaan kapitalisasi, spasi berlebih, dan variasi penulisan nama tidak boleh melahirkan
   sekolah baru; keduanya dinormalkan lebih dulu sebelum dibandingkan. */
function npsnKunci(value){return bersih(value,40).replace(/\D/g,'');}
function namaKunci(value){return bersih(value,150).toLowerCase().replace(/\s+/g,' ').trim();}

/* Mencari customer yang sudah ada berdasarkan NPSN, lalu nama sebagai cadangan. */
async function cariCustomer(store,{npsn='',name=''}){
  const kunci=npsnKunci(npsn);
  if(kunci){
    const lewatNpsn=await store.query("SELECT * FROM customers WHERE REPLACE(REPLACE(COALESCE(npsn,''),' ',''),'-','')=$1 LIMIT 1",[kunci]);
    if(lewatNpsn.rows.length)return lewatNpsn.rows[0];
  }
  const nama=namaKunci(name);
  if(!nama)return null;
  /* Tanpa NPSN, nama yang dinormalkan menjadi cadangan terakhir. Perbandingannya dilakukan di
     sisi aplikasi supaya aturan normalisasinya sama persis dengan di atas. */
  const semua=await store.query('SELECT * FROM customers');
  return semua.rows.find(row=>namaKunci(row.name)===nama&&!npsnKunci(row.npsn))||null;
}

/* Membuat customer bila belum ada, atau melengkapi yang sudah ada tanpa menimpa isi lama
   dengan kekosongan. Mengembalikan record customer-nya. */
export async function ensureCustomer(store,{name,npsn='',contact='',notes='',actor}){
  const nama=bersih(name,150);
  const npsnBersih=bersih(npsn,40);
  if(!nama&&!npsnBersih)return null;
  const ada=await cariCustomer(store,{npsn:npsnBersih,name:nama});
  if(ada){
    /* Sinkronisasi: isian baru melengkapi yang kosong dan memperbarui yang memang berubah,
       tetapi tidak pernah mengosongkan data yang sudah terisi. */
    await store.run(`UPDATE customers SET name=COALESCE(NULLIF($1,''),name),
      npsn=COALESCE(NULLIF($2,''),npsn),contact=COALESCE(NULLIF($3,''),contact) WHERE id=$4`,
      [nama,npsnBersih,bersih(contact,150),ada.id]);
    return store.one('SELECT * FROM customers WHERE id=$1',[ada.id]);
  }
  const id=newId('cus');
  await store.run('INSERT INTO customers(id,name,npsn,contact,notes,created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [id,nama||`Sekolah ${npsnBersih}`,npsnBersih,bersih(contact,150),bersih(notes,500),nowIso()]);
  await catat(store,{type:'CUSTOMER_CREATED',actor,detail:{id,name:nama,npsn:npsnBersih,source:'LICENSE'}});
  return store.one('SELECT * FROM customers WHERE id=$1',[id]);
}

export async function createLicenses(store,{count=1,customerId=null,buyerName='',schoolName='',npsn='',notes='',licenseType='CUSTOMER',actor,recoverySecret}){
  const jumlah=Number.parseInt(count,10);
  if(!Number.isInteger(jumlah)||jumlah<1||jumlah>500)throw new LicenseError('INVALID_COUNT','Jumlah lisensi harus 1 sampai 500.');
  const tipe=bersih(licenseType,20).toUpperCase()||'CUSTOMER';
  if(!LICENSE_TYPES.includes(tipe))throw new LicenseError('INVALID_TYPE','Tipe lisensi tidak dikenal.');
  const pembeli=bersih(buyerName,150);
  const sekolah=bersih(schoolName,150);
  const npsnBersih=bersih(npsn,40);
  if(tipe==='CUSTOMER'){
    const kurang=[];
    if(!pembeli)kurang.push('Nama Pembeli');
    if(!sekolah)kurang.push('Nama Sekolah');
    if(!npsnBersih)kurang.push('NPSN');
    if(kurang.length)
      throw new LicenseError('IDENTITAS_WAJIB',`Lengkapi identitas lisensi: ${kurang.join(', ')}.`,400);
    if(!/^\d{8}$/.test(npsnBersih))throw new LicenseError('INVALID_NPSN','NPSN wajib 8 digit angka.',400);
  }
  /* Identitas pembeli yang baru saja diisi Owner langsung menjadi/menyambung ke customer,
     sehingga menu Sekolah/Pembeli tidak perlu diisi untuk kedua kalinya. */
  let customerAktif=bersih(customerId,60)||null;
  if(!customerAktif&&tipe==='CUSTOMER'){
    const customer=await ensureCustomer(store,{name:sekolah||pembeli,npsn:npsnBersih,contact:'',actor});
    if(customer)customerAktif=customer.id;
  }
  const hasil=[];
  for(let i=0;i<jumlah;i++){
    /* Tabrakan kunci praktis mustahil, tetapi UNIQUE pada license_hash tetap menjadi
       penjaga terakhir dan percobaan diulang bila benar-benar terjadi. */
    let simpan=null;
    for(let percobaan=0;percobaan<5&&!simpan;percobaan++){
      const key=generateLicenseKey();
      const id=newId('lic');
      try{
        await store.run(`INSERT INTO licenses(id,license_hash,license_hint,encrypted_recovery,status,customer_id,buyer_name,school_name,npsn,license_type,created_at,notes)
          VALUES($1,$2,$3,$4,'UNUSED',$5,$6,$7,$8,$9,$10,$11)`,
          [id,licenseHash(key,recoverySecret.pepper),licenseHint(key),encryptRecovery(key,recoverySecret.recoveryKey),
           customerAktif||null,pembeli||null,sekolah||null,npsnBersih||null,tipe,nowIso(),bersih(notes,500)]);
        simpan={id,key,hint:licenseHint(key)};
      }catch(error){if(!isUniqueViolation(error))throw error;}
    }
    if(!simpan)throw new LicenseError('GENERATE_FAILED','Gagal membuat License Key unik.',500);
    await catat(store,{licenseId:simpan.id,type:'LICENSE_CREATED',actor,
      detail:{hint:simpan.hint,customerId:customerAktif,licenseType:tipe,buyerName:pembeli,schoolName:sekolah,npsn:npsnBersih}});
    hasil.push(simpan);
  }
  return hasil;
}

/* ------------------------------------------------------------------------- Aktivasi */

async function licenseByKey(store,key,pepper){
  const normal=normalizeLicenseKey(key);
  if(!normal)throw new LicenseError('INVALID_KEY','License Key tidak valid.',400);
  const row=await store.one('SELECT * FROM licenses WHERE license_hash=$1',[licenseHash(normal,pepper)]);
  if(!row)throw new LicenseError('INVALID_KEY','License Key tidak valid.',404);
  return row;
}

function pastikanDapatDipakai(status){
  if(status==='SUSPENDED')throw new LicenseError('SUSPENDED','Lisensi sedang ditangguhkan.',403);
  if(status==='REVOKED')throw new LicenseError('REVOKED','Lisensi telah dicabut.',403);
}

export function buildActivationToken(license,activation,secrets){
  const payload={
    schema:TOKEN_SCHEMA,
    license_id:license.id,
    license_hint:license.license_hint,
    installation_id:activation.installation_id,
    activation_id:activation.id,
    status:license.status,
    issued_at:nowIso(),
    next_check_at:new Date(Date.now()+CHECK_INTERVAL_DAYS*86400000).toISOString(),
    grace_days:GRACE_PERIOD_DAYS,
  };
  return signActivationToken(payload,secrets.signingPrivateKeyPem);
}

/* Aktivasi berjalan dalam satu transaksi. Bila dua perangkat menekan Aktifkan pada detik yang
   sama, hanya satu yang lolos UNIQUE INDEX parsial; yang lain menerima penolakan, bukan
   aktivasi kedua. */
export async function activateLicense(store,input,secrets){
  const installationId=bersih(input?.installation_id,80);
  if(!/^inst_[0-9a-f]{32}$/.test(installationId))throw new LicenseError('INVALID_INSTALLATION','Installation ID tidak valid.');
  const license=await licenseByKey(store,input?.license_key,secrets.pepper);
  pastikanDapatDipakai(license.status);

  const platform=bersih(input?.platform,40)||'web';
  const deviceLabel=bersih(input?.device_label,120);
  const schoolName=bersih(input?.school_name,150);
  const npsn=bersih(input?.npsn,40);
  const appVersion=bersih(input?.app_version,40);

  const aktif=await store.one('SELECT * FROM device_activations WHERE license_id=$1 AND is_active=TRUE',[license.id]);
  if(aktif&&aktif.installation_id!==installationId){
    await catat(store,{licenseId:license.id,type:'ACTIVATION_REJECTED',actor:'system',
      detail:{reason:'ALREADY_BOUND',installation_id:installationId,bound_to:aktif.installation_id}});
    throw new LicenseError('ALREADY_ACTIVATED','License Key ini sudah terikat pada perangkat lain.',409);
  }

  /* Pengikatan perangkat sengaja dikerjakan oleh SATU pernyataan INSERT yang dijaga partial
     unique index, bukan oleh isolasi transaksi. Satu pernyataan selalu atomik pada PostgreSQL
     maupun SQLite, sehingga aturan satu-perangkat tetap utuh walau permintaan datang bersamaan
     dari koneksi yang berbeda, dari fungsi serverless yang berbeda, atau bahkan berbagi satu
     koneksi. Pemenangnya ditentukan database; yang kalah menerima penolakan. */
  try{
    let activation=aktif;
    if(activation){
      await store.run('UPDATE device_activations SET last_seen_at=$1,platform=$2,device_label=$3,app_version=$4 WHERE id=$5',
        [nowIso(),platform,deviceLabel,appVersion,activation.id]);
    }else{
      const id=newId('act');
      await store.run(`INSERT INTO device_activations(id,license_id,installation_id,platform,device_label,app_version,activated_at,last_seen_at,is_active)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,[id,license.id,installationId,platform,deviceLabel,appVersion,nowIso(),nowIso()]);
      activation={id,license_id:license.id,installation_id:installationId};
    }
    await store.run(`UPDATE licenses SET status='ACTIVE',activated_at=COALESCE(activated_at,$1),last_check_at=$2,
      school_name=COALESCE(NULLIF($3,''),school_name),npsn=COALESCE(NULLIF($4,''),npsn) WHERE id=$5`,
      [nowIso(),nowIso(),schoolName,npsn,license.id]);
    await catat(store,{licenseId:license.id,type:aktif?'ACTIVATION_REFRESHED':'ACTIVATION_CREATED',actor:'system',
      detail:{installation_id:installationId,platform,school_name:schoolName,npsn}});
    const segar=await store.one('SELECT * FROM licenses WHERE id=$1',[license.id]);
    return {license:segar,activation,token:buildActivationToken(segar,activation,secrets)};
  }catch(error){
    if(isUniqueViolation(error,'ux_one_active_device')){
      await catat(store,{licenseId:license.id,type:'ACTIVATION_REJECTED',actor:'system',
        detail:{reason:'RACE_LOST',installation_id:installationId}});
      throw new LicenseError('ALREADY_ACTIVATED','License Key ini sudah terikat pada perangkat lain.',409);
    }
    throw error;
  }
}

/* Pemeriksaan berkala. Tidak pernah menghapus apa pun; hanya melaporkan status terkini. */
export async function checkLicense(store,input,secrets){
  const installationId=bersih(input?.installation_id,80);
  const licenseId=bersih(input?.license_id,80);
  const license=await store.one('SELECT * FROM licenses WHERE id=$1',[licenseId]);
  if(!license)throw new LicenseError('INVALID_KEY','Lisensi tidak ditemukan.',404);
  const activation=await store.one('SELECT * FROM device_activations WHERE license_id=$1 AND installation_id=$2 AND is_active=TRUE',
    [license.id,installationId]);
  if(!activation)throw new LicenseError('NOT_BOUND','Perangkat ini tidak lagi terdaftar pada lisensi tersebut.',409);
  await store.run('UPDATE device_activations SET last_seen_at=$1 WHERE id=$2',[nowIso(),activation.id]);
  await store.run('UPDATE licenses SET last_check_at=$1 WHERE id=$2',[nowIso(),license.id]);
  pastikanDapatDipakai(license.status);
  return {license,activation,token:buildActivationToken(license,activation,secrets)};
}

/* --------------------------------------------------------------- Tindakan pemilik saja */

export async function resetDevice(store,licenseId,{actor,reason=''}){
  const license=await store.one('SELECT * FROM licenses WHERE id=$1',[licenseId]);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  const aktif=await store.one('SELECT * FROM device_activations WHERE license_id=$1 AND is_active=TRUE',[licenseId]);
  if(!aktif)throw new LicenseError('NO_ACTIVE_DEVICE','Lisensi ini belum terikat perangkat mana pun.',409);
  await store.transaction(async tx=>{
    await tx.run('UPDATE device_activations SET is_active=FALSE,released_at=$1 WHERE id=$2',[nowIso(),aktif.id]);
    await tx.run("UPDATE licenses SET status='UNUSED' WHERE id=$1 AND status='ACTIVE'",[licenseId]);
  });
  await catat(store,{licenseId,type:'DEVICE_RESET',actor,
    detail:{old_installation_id:aktif.installation_id,reason:bersih(reason,300)}});
  return {released:aktif.installation_id};
}

export async function setStatus(store,licenseId,status,{actor,reason=''}){
  if(!LICENSE_STATUS.includes(status))throw new LicenseError('INVALID_STATUS','Status lisensi tidak dikenal.');
  const license=await store.one('SELECT * FROM licenses WHERE id=$1',[licenseId]);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  /* Pencabutan menyimpan waktu dan alasannya supaya lisensi yang dicabut tetap dapat
     ditelusuri. Record TIDAK pernah dihapus. Saat dipulihkan, jejak itu dibersihkan lagi. */
  if(status==='REVOKED')
    await store.run('UPDATE licenses SET status=$1,revoked_at=$2,revoke_reason=$3 WHERE id=$4',
      [status,nowIso(),bersih(reason,300)||null,licenseId]);
  else
    await store.run('UPDATE licenses SET status=$1,revoked_at=NULL,revoke_reason=NULL WHERE id=$2',[status,licenseId]);
  await catat(store,{licenseId,type:`STATUS_${status}`,actor,detail:{from:license.status,to:status,reason:bersih(reason,300)}});
  return store.one('SELECT * FROM licenses WHERE id=$1',[licenseId]);
}

/* Pemulihan kunci hilang. Tidak membuat lisensi baru, tidak menambah slot aktivasi, dan
   selalu tercatat di audit log. */
export async function recoverLicenseKey(store,licenseId,{actor,reason=''},secrets){
  const license=await store.one('SELECT * FROM licenses WHERE id=$1',[licenseId]);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  if(!license.encrypted_recovery)throw new LicenseError('NO_RECOVERY','Lisensi ini tidak menyimpan nilai pemulihan.',409);
  const key=decryptRecovery(license.encrypted_recovery,secrets.recoveryKey);
  await catat(store,{licenseId,type:'KEY_RECOVERED',actor,detail:{hint:license.license_hint,reason:bersih(reason,300)}});
  return {license_key:key,hint:license.license_hint};
}

/* ------------------------------------------------------------------------ Pembacaan */

/* Angka penjualan hanya menghitung lisensi PEMBELI. Lisensi Developer dilaporkan terpisah
   supaya tidak pernah tercampur ke statistik penjualan. */
export async function summary(store){
  const baris=(await store.query('SELECT COALESCE(license_type,$1) AS tipe,status,COUNT(*) AS jumlah FROM licenses GROUP BY 1,2',['CUSTOMER'])).rows;
  const hitung=Object.fromEntries(LICENSE_STATUS.map(status=>[status,0]));
  const developer=Object.fromEntries(LICENSE_STATUS.map(status=>[status,0]));
  let total=0;let totalDeveloper=0;
  for(const row of baris){
    const jumlah=Number(row.jumlah);
    if(String(row.tipe).toUpperCase()==='DEVELOPER'){developer[row.status]=jumlah;totalDeveloper+=jumlah;}
    else{hitung[row.status]=jumlah;total+=jumlah;}
  }
  const devices=(await store.one('SELECT COUNT(*) AS jumlah FROM device_activations WHERE is_active=TRUE')).jumlah;
  return {total,...hitung,devices:Number(devices),
    developer:{total:totalDeveloper,...developer}};
}

/* Hash lisensi dan paket pemulihan terenkripsi tidak pernah ikut dalam jawaban API, bahkan
   untuk Pemilik. Satu-satunya jalan melihat kembali License Key adalah aksi "recover" yang
   tercatat di audit; mengirim encrypted_recovery pada setiap daftar akan membuat pencatatan
   itu tidak ada artinya. */
const RAHASIA_LISENSI=['license_hash','encrypted_recovery'];
export function tanpaRahasiaLisensi(row){
  if(!row)return row;
  const salinan={...row};
  for(const kunci of RAHASIA_LISENSI)delete salinan[kunci];
  return salinan;
}

export async function listLicenses(store,{q='',status='',type='',limit=100}={}){
  const tipe=bersih(type,20).toUpperCase();
  const cari=`%${bersih(q,80).toLowerCase()}%`;
  const hasil=await store.query(`SELECT l.*, c.name AS customer_name,
      (SELECT d.installation_id FROM device_activations d WHERE d.license_id=l.id AND d.is_active=TRUE LIMIT 1) AS active_installation,
      (SELECT d.platform FROM device_activations d WHERE d.license_id=l.id AND d.is_active=TRUE LIMIT 1) AS active_platform,
      (SELECT d.last_seen_at FROM device_activations d WHERE d.license_id=l.id AND d.is_active=TRUE LIMIT 1) AS active_last_seen
    FROM licenses l LEFT JOIN customers c ON c.id=l.customer_id
    WHERE ($1='' OR l.status=$1)
      AND ($4='' OR COALESCE(l.license_type,'CUSTOMER')=$4)
      AND ($2='%%' OR lower(COALESCE(l.school_name,'')) LIKE $2 OR lower(COALESCE(l.npsn,'')) LIKE $2
           OR lower(COALESCE(l.buyer_name,'')) LIKE $2
           OR lower(l.license_hint) LIKE $2 OR lower(COALESCE(c.name,'')) LIKE $2 OR lower(l.id) LIKE $2)
    ORDER BY l.created_at DESC LIMIT $3`,[status,cari,Math.min(Number(limit)||100,500),tipe]);
  return hasil.rows.map(row=>({...tanpaRahasiaLisensi(row),
    license_type:String(row.license_type||'CUSTOMER').toUpperCase(),
    created_at:iso(row.created_at),activated_at:iso(row.activated_at),
    revoked_at:iso(row.revoked_at),active_last_seen:iso(row.active_last_seen)}));
}

export async function licenseDetail(store,licenseId){
  const license=await store.one('SELECT * FROM licenses WHERE id=$1',[licenseId]);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  return {
    license,
    devices:(await store.query('SELECT * FROM device_activations WHERE license_id=$1 ORDER BY activated_at DESC',[licenseId])).rows,
    events:(await store.query('SELECT * FROM license_events WHERE license_id=$1 ORDER BY created_at DESC LIMIT 100',[licenseId])).rows,
  };
}

export async function listEvents(store,{limit=200}={}){
  const hasil=await store.query('SELECT * FROM license_events ORDER BY created_at DESC LIMIT $1',[Math.min(Number(limit)||200,1000)]);
  return hasil.rows.map(row=>({...row,created_at:iso(row.created_at)}));
}

/* Form manual Tambah Sekolah/Pembeli tetap ada untuk kasus khusus, tetapi bukan jalur utama
   pembelian lisensi - dan ia memakai penjaga duplikasi yang sama. NPSN yang sudah terdaftar
   memperbarui sekolah yang ada, bukan melahirkan record kedua. */
export async function upsertCustomer(store,{name,npsn='',contact='',notes='',actor}){
  const nama=bersih(name,150);
  if(!nama)throw new LicenseError('INVALID_CUSTOMER','Nama sekolah/pembeli wajib diisi.');
  const npsnBersih=bersih(npsn,40);
  if(npsnBersih&&!/^\d{8}$/.test(npsnKunci(npsnBersih)))
    throw new LicenseError('INVALID_NPSN','NPSN wajib 8 digit angka.',400);
  return ensureCustomer(store,{name:nama,npsn:npsnBersih,contact,notes,actor});
}

/* Satu baris per sekolah - tidak pernah digandakan per lisensi. Jumlah dan status lisensinya
   dirangkum pada baris yang sama. */
export async function listCustomers(store){
  const hasil=await store.query(`SELECT c.*,(SELECT COUNT(*) FROM licenses l WHERE l.customer_id=c.id) AS license_count
    FROM customers c ORDER BY c.created_at DESC`);
  const lisensi=await store.query("SELECT customer_id,status,COUNT(*) AS jumlah FROM licenses WHERE customer_id IS NOT NULL GROUP BY customer_id,status");
  const ringkas=new Map();
  for(const row of lisensi.rows){
    const isi=ringkas.get(row.customer_id)||{};
    isi[row.status]=Number(row.jumlah);
    ringkas.set(row.customer_id,isi);
  }
  return hasil.rows.map(row=>({...row,license_count:Number(row.license_count),
    license_status:ringkas.get(row.id)||{},created_at:iso(row.created_at)}));
}

/* --------------------------------------------------------------- MIGRASI BACKWARD-COMPATIBLE

   Lisensi lama dibuat sebelum penyambungan otomatis ada, sehingga banyak yang menyimpan nama
   sekolah dan NPSN tetapi belum menunjuk customer mana pun. Normalisasi ini menyambungkannya.

   Yang disentuh HANYA kolom customer_id pada lisensi yang nilainya masih kosong. Tidak satu pun
   kunci, status, aktivasi, maupun ikatan perangkat yang diubah, dan tidak ada lisensi yang
   dibuat ulang atau dihapus. Aman dijalankan berulang. */
export async function normalizeCustomerLinks(store,{actor='system'}={}){
  const yatim=await store.query("SELECT id,school_name,buyer_name,npsn FROM licenses WHERE customer_id IS NULL AND (COALESCE(school_name,'')<>'' OR COALESCE(npsn,'')<>'')");
  let terhubung=0;const sekolahBaru=new Set();
  for(const lisensi of yatim.rows){
    const customer=await ensureCustomer(store,
      {name:lisensi.school_name||lisensi.buyer_name||'',npsn:lisensi.npsn||'',actor});
    if(!customer)continue;
    await store.run('UPDATE licenses SET customer_id=$1 WHERE id=$2 AND customer_id IS NULL',[customer.id,lisensi.id]);
    sekolahBaru.add(customer.id);terhubung+=1;
  }
  return {terhubung,sekolah:sekolahBaru.size};
}
