import { nowIso } from './db.js';
import { decryptRecovery, encryptRecovery, generateLicenseKey, licenseHash, licenseHint,
  newId, normalizeLicenseKey, signActivationToken } from './crypto.js';

/* Seluruh keputusan lisensi berada di sini, di sisi server. Client tidak pernah menentukan
   apakah sebuah aktivasi sah; ia hanya menerima hasilnya beserta token bertanda tangan.

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

function catat(db,{licenseId=null,type,actor,detail=null}){
  db.prepare('INSERT INTO license_events(id,license_id,type,actor,detail,created_at) VALUES(?,?,?,?,?,?)')
    .run(newId('evt'),licenseId,type,actor,detail?JSON.stringify(detail):null,nowIso());
}
export const logEvent=catat;

function bersih(value,max=180){return String(value??'').trim().slice(0,max);}

/* ------------------------------------------------------------------ Pembuatan lisensi */

export function createLicenses(db,{count=1,customerId=null,schoolName='',npsn='',notes='',actor,recoverySecret}){
  const jumlah=Number.parseInt(count,10);
  if(!Number.isInteger(jumlah)||jumlah<1||jumlah>500)throw new LicenseError('INVALID_COUNT','Jumlah lisensi harus 1 sampai 500.');
  const hasil=[];
  const insert=db.prepare(`INSERT INTO licenses(id,license_hash,license_hint,encrypted_recovery,status,customer_id,school_name,npsn,created_at,notes)
    VALUES(?,?,?,?,'UNUSED',?,?,?,?,?)`);
  for(let i=0;i<jumlah;i++){
    /* Tabrakan kunci praktis mustahil, tetapi UNIQUE pada license_hash tetap menjadi
       penjaga terakhir dan percobaan diulang bila benar-benar terjadi. */
    let simpan=null;
    for(let percobaan=0;percobaan<5&&!simpan;percobaan++){
      const key=generateLicenseKey();
      const id=newId('lic');
      try{
        insert.run(id,licenseHash(key,recoverySecret.pepper),licenseHint(key),
          encryptRecovery(key,recoverySecret.recoveryKey),customerId,bersih(schoolName),bersih(npsn,40),nowIso(),bersih(notes,500));
        simpan={id,key,hint:licenseHint(key)};
      }catch(error){if(!String(error.message).includes('UNIQUE'))throw error;}
    }
    if(!simpan)throw new LicenseError('GENERATE_FAILED','Gagal membuat License Key unik.',500);
    catat(db,{licenseId:simpan.id,type:'LICENSE_CREATED',actor,detail:{hint:simpan.hint,customerId,schoolName:bersih(schoolName)}});
    hasil.push(simpan);
  }
  return hasil;
}

/* ------------------------------------------------------------------------- Aktivasi */

function licenseByKey(db,key,pepper){
  const normal=normalizeLicenseKey(key);
  if(!normal)throw new LicenseError('INVALID_KEY','License Key tidak valid.',400);
  const row=db.prepare('SELECT * FROM licenses WHERE license_hash=?').get(licenseHash(normal,pepper));
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
   sama, hanya satu yang lolos UNIQUE INDEX; yang lain menerima penolakan, bukan aktivasi kedua. */
export function activateLicense(db,input,secrets){
  const installationId=bersih(input?.installation_id,80);
  if(!/^inst_[0-9a-f]{32}$/.test(installationId))throw new LicenseError('INVALID_INSTALLATION','Installation ID tidak valid.');
  const license=licenseByKey(db,input?.license_key,secrets.pepper);
  pastikanDapatDipakai(license.status);

  const platform=bersih(input?.platform,40)||'web';
  const deviceLabel=bersih(input?.device_label,120);
  const schoolName=bersih(input?.school_name,150);
  const npsn=bersih(input?.npsn,40);
  const appVersion=bersih(input?.app_version,40);

  const aktif=db.prepare('SELECT * FROM device_activations WHERE license_id=? AND is_active=1').get(license.id);
  if(aktif&&aktif.installation_id!==installationId){
    catat(db,{licenseId:license.id,type:'ACTIVATION_REJECTED',actor:'system',
      detail:{reason:'ALREADY_BOUND',installation_id:installationId,bound_to:aktif.installation_id}});
    throw new LicenseError('ALREADY_ACTIVATED','License Key ini sudah terikat pada perangkat lain.',409);
  }

  db.exec('BEGIN IMMEDIATE');
  try{
    let activation=aktif;
    if(activation){
      db.prepare('UPDATE device_activations SET last_seen_at=?,platform=?,device_label=?,app_version=? WHERE id=?')
        .run(nowIso(),platform,deviceLabel,appVersion,activation.id);
    }else{
      const id=newId('act');
      db.prepare(`INSERT INTO device_activations(id,license_id,installation_id,platform,device_label,app_version,activated_at,last_seen_at,is_active)
        VALUES(?,?,?,?,?,?,?,?,1)`).run(id,license.id,installationId,platform,deviceLabel,appVersion,nowIso(),nowIso());
      activation={id,license_id:license.id,installation_id:installationId};
    }
    db.prepare(`UPDATE licenses SET status='ACTIVE',activated_at=COALESCE(activated_at,?),last_check_at=?,
      school_name=COALESCE(NULLIF(?,''),school_name),npsn=COALESCE(NULLIF(?,''),npsn) WHERE id=?`)
      .run(nowIso(),nowIso(),schoolName,npsn,license.id);
    catat(db,{licenseId:license.id,type:aktif?'ACTIVATION_REFRESHED':'ACTIVATION_CREATED',actor:'system',
      detail:{installation_id:installationId,platform,school_name:schoolName,npsn}});
    db.exec('COMMIT');
    const segar=db.prepare('SELECT * FROM licenses WHERE id=?').get(license.id);
    return {license:segar,activation,token:buildActivationToken(segar,activation,secrets)};
  }catch(error){
    db.exec('ROLLBACK');
    if(String(error.message).includes('UNIQUE constraint failed: device_activations.license_id')){
      catat(db,{licenseId:license.id,type:'ACTIVATION_REJECTED',actor:'system',
        detail:{reason:'RACE_LOST',installation_id:installationId}});
      throw new LicenseError('ALREADY_ACTIVATED','License Key ini sudah terikat pada perangkat lain.',409);
    }
    throw error;
  }
}

/* Pemeriksaan berkala. Tidak pernah menghapus apa pun; hanya melaporkan status terkini. */
export function checkLicense(db,input,secrets){
  const installationId=bersih(input?.installation_id,80);
  const licenseId=bersih(input?.license_id,80);
  const license=db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
  if(!license)throw new LicenseError('INVALID_KEY','Lisensi tidak ditemukan.',404);
  const activation=db.prepare('SELECT * FROM device_activations WHERE license_id=? AND installation_id=? AND is_active=1')
    .get(license.id,installationId);
  if(!activation)throw new LicenseError('NOT_BOUND','Perangkat ini tidak lagi terdaftar pada lisensi tersebut.',409);
  db.prepare('UPDATE device_activations SET last_seen_at=? WHERE id=?').run(nowIso(),activation.id);
  db.prepare('UPDATE licenses SET last_check_at=? WHERE id=?').run(nowIso(),license.id);
  pastikanDapatDipakai(license.status);
  return {license,activation,token:buildActivationToken(license,activation,secrets)};
}

/* --------------------------------------------------------------- Tindakan pemilik saja */

export function resetDevice(db,licenseId,{actor,reason=''}){
  const license=db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  const aktif=db.prepare('SELECT * FROM device_activations WHERE license_id=? AND is_active=1').get(licenseId);
  if(!aktif)throw new LicenseError('NO_ACTIVE_DEVICE','Lisensi ini belum terikat perangkat mana pun.',409);
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('UPDATE device_activations SET is_active=0,released_at=? WHERE id=?').run(nowIso(),aktif.id);
    db.prepare("UPDATE licenses SET status='UNUSED' WHERE id=? AND status='ACTIVE'").run(licenseId);
    catat(db,{licenseId,type:'DEVICE_RESET',actor,detail:{old_installation_id:aktif.installation_id,reason:bersih(reason,300)}});
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {released:aktif.installation_id};
}

export function setStatus(db,licenseId,status,{actor,reason=''}){
  if(!LICENSE_STATUS.includes(status))throw new LicenseError('INVALID_STATUS','Status lisensi tidak dikenal.');
  const license=db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  db.prepare('UPDATE licenses SET status=? WHERE id=?').run(status,licenseId);
  catat(db,{licenseId,type:`STATUS_${status}`,actor,detail:{from:license.status,to:status,reason:bersih(reason,300)}});
  return db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
}

/* Pemulihan kunci hilang. Tidak membuat lisensi baru, tidak menambah slot aktivasi, dan
   selalu tercatat di audit log. */
export function recoverLicenseKey(db,licenseId,{actor,reason=''},secrets){
  const license=db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  if(!license.encrypted_recovery)throw new LicenseError('NO_RECOVERY','Lisensi ini tidak menyimpan nilai pemulihan.',409);
  const key=decryptRecovery(license.encrypted_recovery,secrets.recoveryKey);
  catat(db,{licenseId,type:'KEY_RECOVERED',actor,detail:{hint:license.license_hint,reason:bersih(reason,300)}});
  return {license_key:key,hint:license.license_hint};
}

/* ------------------------------------------------------------------------ Pembacaan */

export function summary(db){
  const baris=db.prepare('SELECT status,COUNT(*) AS jumlah FROM licenses GROUP BY status').all();
  const total=db.prepare('SELECT COUNT(*) AS jumlah FROM licenses').get().jumlah;
  const hitung=Object.fromEntries(LICENSE_STATUS.map(status=>[status,0]));
  baris.forEach(row=>{hitung[row.status]=row.jumlah;});
  return {total,...hitung,
    devices:db.prepare('SELECT COUNT(*) AS jumlah FROM device_activations WHERE is_active=1').get().jumlah};
}

export function listLicenses(db,{q='',status='',limit=100}={}){
  const cari=`%${bersih(q,80).toLowerCase()}%`;
  const baris=db.prepare(`SELECT l.*, c.name AS customer_name,
      (SELECT installation_id FROM device_activations d WHERE d.license_id=l.id AND d.is_active=1) AS active_installation,
      (SELECT platform FROM device_activations d WHERE d.license_id=l.id AND d.is_active=1) AS active_platform,
      (SELECT last_seen_at FROM device_activations d WHERE d.license_id=l.id AND d.is_active=1) AS active_last_seen
    FROM licenses l LEFT JOIN customers c ON c.id=l.customer_id
    WHERE (?='' OR l.status=?)
      AND (?='%%' OR lower(COALESCE(l.school_name,'')) LIKE ? OR lower(COALESCE(l.npsn,'')) LIKE ?
           OR lower(l.license_hint) LIKE ? OR lower(COALESCE(c.name,'')) LIKE ? OR lower(l.id) LIKE ?)
    ORDER BY l.created_at DESC LIMIT ?`)
    .all(status,status,cari,cari,cari,cari,cari,cari,Math.min(Number(limit)||100,500));
  return baris;
}

export function licenseDetail(db,licenseId){
  const license=db.prepare('SELECT * FROM licenses WHERE id=?').get(licenseId);
  if(!license)throw new LicenseError('NOT_FOUND','Lisensi tidak ditemukan.',404);
  return {
    license,
    devices:db.prepare('SELECT * FROM device_activations WHERE license_id=? ORDER BY activated_at DESC').all(licenseId),
    events:db.prepare('SELECT * FROM license_events WHERE license_id=? ORDER BY created_at DESC LIMIT 100').all(licenseId),
  };
}

export function listEvents(db,{limit=200}={}){
  return db.prepare('SELECT * FROM license_events ORDER BY created_at DESC LIMIT ?').all(Math.min(Number(limit)||200,1000));
}

export function upsertCustomer(db,{name,npsn='',contact='',notes='',actor}){
  const nama=bersih(name,150);
  if(!nama)throw new LicenseError('INVALID_CUSTOMER','Nama sekolah/pembeli wajib diisi.');
  const id=newId('cus');
  db.prepare('INSERT INTO customers(id,name,npsn,contact,notes,created_at) VALUES(?,?,?,?,?,?)')
    .run(id,nama,bersih(npsn,40),bersih(contact,150),bersih(notes,500),nowIso());
  catat(db,{type:'CUSTOMER_CREATED',actor,detail:{id,name:nama}});
  return db.prepare('SELECT * FROM customers WHERE id=?').get(id);
}

export function listCustomers(db){
  return db.prepare(`SELECT c.*,(SELECT COUNT(*) FROM licenses l WHERE l.customer_id=c.id) AS license_count
    FROM customers c ORDER BY c.created_at DESC`).all();
}
