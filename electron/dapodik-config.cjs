'use strict';

/* Penyimpanan konfigurasi Dapodik untuk peluncur Windows.
   Token bearer HANYA hidup di sini, terenkripsi lewat safeStorage Electron, dan tidak pernah
   dikembalikan ke browser. Seluruh dependensi disuntikkan supaya dapat diuji tanpa Electron
   dan tanpa menyentuh disk. */

const CONFIG_FILE='dapodik-config.json';
const TOKEN_FILE='dapodik-token.bin';

function clean(value,max=200){return String(value==null?'':value).trim().replace(/\s+/g,' ').slice(0,max);}
function digits(value,max=10){return String(value==null?'':value).replace(/\D/g,'').slice(0,max);}

/* Pesan asli dari filesystem atau kripto bisa memuat jalur berkas milik operator dan, pada
   kasus terburuk, potongan nilai rahasia. Pesan itu tidak pernah diteruskan apa adanya. */
function redact(action){
  return new Error(`Konfigurasi Dapodik gagal ${action}. Periksa izin folder aplikasi lalu coba lagi.`);
}

function normalizePublicConfig(input){
  const baseUrl=clean(input&&input.baseUrl,300);
  if(!baseUrl)throw new Error('Alamat Web Service Dapodik wajib diisi.');
  const npsn=digits(input&&input.npsn);
  if(!npsn)throw new Error('NPSN Dapodik wajib diisi.');
  const semesterId=clean(input&&input.semesterId,20);
  if(!semesterId)throw new Error('Semester Dapodik wajib diisi.');
  return {baseUrl,npsn,semesterId};
}

const EMPTY_PUBLIC={baseUrl:'',npsn:'',semesterId:'',tokenConfigured:false,updatedAt:''};

function createDapodikConfigStore({safeStorage,fs,path,userDataPath}){
  if(!safeStorage||!fs||!path||!userDataPath)throw new Error('Dependensi penyimpanan konfigurasi Dapodik tidak lengkap.');
  const configPath=path.join(userDataPath,CONFIG_FILE);
  const tokenPath=path.join(userDataPath,TOKEN_FILE);

  function readConfigFile(){
    try{
      if(!fs.existsSync(configPath))return null;
      const parsed=JSON.parse(String(fs.readFileSync(configPath)));
      return parsed&&typeof parsed==='object'?parsed:null;
    }catch{return null;}
  }

  function tokenConfigured(){
    try{return fs.existsSync(tokenPath)&&fs.readFileSync(tokenPath).length>0;}
    catch{return false;}
  }

  function loadPublic(){
    const saved=readConfigFile();
    if(!saved)return {...EMPTY_PUBLIC};
    /* Bentuk publik disusun ulang dari kolom yang dikenal saja, sehingga kolom tak terduga
       pada berkas (termasuk sisa token dari versi lama) tidak pernah ikut keluar. */
    return {
      baseUrl:clean(saved.baseUrl,300),
      npsn:digits(saved.npsn),
      semesterId:clean(saved.semesterId,20),
      updatedAt:clean(saved.updatedAt,40),
      tokenConfigured:tokenConfigured()
    };
  }

  function loadWithToken(){
    const publicConfig=loadPublic();
    if(!publicConfig.baseUrl||!publicConfig.tokenConfigured)throw new Error('Dapodik belum dikonfigurasi pada aplikasi Windows ini.');
    let token='';
    try{token=String(safeStorage.decryptString(fs.readFileSync(tokenPath)));}
    catch{throw redact('dibaca');}
    if(!token)throw new Error('Dapodik belum dikonfigurasi pada aplikasi Windows ini.');
    return {...publicConfig,token};
  }

  function save(input){
    if(!safeStorage.isEncryptionAvailable())throw new Error('Penyimpanan aman Windows tidak tersedia. Jalankan aplikasi pada akun Windows yang sama seperti saat dipasang.');
    const publicConfig=normalizePublicConfig(input);
    const token=clean(input&&input.token,500);
    if(!token)throw new Error('Token Dapodik wajib diisi.');
    let encrypted;
    try{encrypted=safeStorage.encryptString(token);}
    catch{throw redact('dienkripsi');}
    const record={...publicConfig,updatedAt:new Date().toISOString()};
    try{
      fs.mkdirSync(userDataPath,{recursive:true});
      fs.writeFileSync(configPath,JSON.stringify(record),{mode:0o600});
      fs.writeFileSync(tokenPath,encrypted,{mode:0o600});
    }catch{throw redact('disimpan');}
    return {...record,tokenConfigured:encrypted.length>0};
  }

  function clear(){
    try{
      if(fs.existsSync(configPath))fs.rmSync(configPath);
      if(fs.existsSync(tokenPath))fs.rmSync(tokenPath);
    }catch{throw redact('dihapus');}
  }

  return {save,loadPublic,loadWithToken,clear,configPath,tokenPath};
}

module.exports={createDapodikConfigStore};
