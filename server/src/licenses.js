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

export async function createLicenses(store,{count=1,customerId=null,schoolName='',npsn='',notes='',actor,recoverySecret}){
  const jumlah=Number.parseInt(count,10);
  if(!Number.isInteger(jumlah)||jumlah<1||jumlah>500)throw new LicenseError('INVALID_COUNT','Jumlah lisensi harus 1 sampai 500.');
  const hasil=[];
  for(let i=0;i<jumlah;i++){
    /* Tabrakan kunci praktis mustahil, tetapi UNIQUE pada license_hash tetap menjadi
       penjaga terakhir dan percobaan diulang bila benar-benar terjadi. */
    let simpan=null;
    for(let percobaan=0;percobaan<5&&!simpan;percobaan++){
      const key=generateLicenseKey();
      const id=newId('lic');
      try{
        await store.run(`INSERT INTO licenses(id,license_hash,license_hint,encrypted_recovery,status,customer_id,school_name,npsn,created_at,notes)
          VALUES($1,$2,$3,$4,'UNUSED',$5,$6,$7,$8,$9)`,
          [id,licenseHash(key,recoverySecret.pepper),licenseHint(key),encryptRecovery(key,recoverySecret.recoveryKey),
           customerId||null,bersih(schoolName),bersih(npsn,40),nowIso(),bersih(notes,500)]);
        simpan={id,key,hint:licenseHint(key)};
      }catch(error){if(!isUniqueViolation(error))throw error;}
    }
    if(!simpan)throw new LicenseError('GENERATE_FAILED','Gagal membuat License Key unik.',500);
    await catat(store,{licenseId:simpan.id,type:'LICENSE_CREATED',actor,
      detail:{hint:simpan.hint,customerId,schoolName:bersih(schoolName)}});
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
  await store.run('UPDATE licenses SET status=$1 WHERE id=$2',[status,licenseId]);
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

export async function summary(store){
  const baris=(await store.query('SELECT status,COUNT(*) AS jumlah FROM licenses GROUP BY status')).rows;
  const total=(await store.one('SELECT COUNT(*) AS jumlah FROM licenses')).jumlah;
  const hitung=Object.fromEntries(LICENSE_STATUS.map(status=>[status,0]));
  baris.forEach(row=>{hitung[row.status]=Number(row.jumlah);});
  const devices=(await store.one('SELECT COUNT(*) AS jumlah FROM device_activations WHERE is_active=TRUE')).jumlah;
  return {total:Number(total),...hitung,devices:Number(devices)};
}

export async function listLicenses(store,{q='',status='',limit=100}={}){
  const cari=`%${bersih(q,80).toLowerCase()}%`;
  const hasil=await store.query(`SELECT l.*, c.name AS customer_name,
      (SELECT d.installation_id FROM device_activations d WHERE d.license_id=l.id AND d.is_active=TRUE LIMIT 1) AS active_installation,
      (SELECT d.platform FROM device_activations d WHERE d.license_id=l.id AND d.is_active=TRUE LIMIT 1) AS active_platform,
      (SELECT d.last_seen_at FROM device_activations d WHERE d.license_id=l.id AND d.is_active=TRUE LIMIT 1) AS active_last_seen
    FROM licenses l LEFT JOIN customers c ON c.id=l.customer_id
    WHERE ($1='' OR l.status=$1)
      AND ($2='%%' OR lower(COALESCE(l.school_name,'')) LIKE $2 OR lower(COALESCE(l.npsn,'')) LIKE $2
           OR lower(l.license_hint) LIKE $2 OR lower(COALESCE(c.name,'')) LIKE $2 OR lower(l.id) LIKE $2)
    ORDER BY l.created_at DESC LIMIT $3`,[status,cari,Math.min(Number(limit)||100,500)]);
  return hasil.rows.map(row=>({...row,created_at:iso(row.created_at),active_last_seen:iso(row.active_last_seen)}));
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

export async function upsertCustomer(store,{name,npsn='',contact='',notes='',actor}){
  const nama=bersih(name,150);
  if(!nama)throw new LicenseError('INVALID_CUSTOMER','Nama sekolah/pembeli wajib diisi.');
  const id=newId('cus');
  await store.run('INSERT INTO customers(id,name,npsn,contact,notes,created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [id,nama,bersih(npsn,40),bersih(contact,150),bersih(notes,500),nowIso()]);
  await catat(store,{type:'CUSTOMER_CREATED',actor,detail:{id,name:nama}});
  return store.one('SELECT * FROM customers WHERE id=$1',[id]);
}

export async function listCustomers(store){
  const hasil=await store.query(`SELECT c.*,(SELECT COUNT(*) FROM licenses l WHERE l.customer_id=c.id) AS license_count
    FROM customers c ORDER BY c.created_at DESC`);
  return hasil.rows.map(row=>({...row,license_count:Number(row.license_count),created_at:iso(row.created_at)}));
}
