import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);const option=name=>args[args.indexOf(name)+1];const output=option('--output');const propertiesPath=option('--properties');const keytool=option('--keytool');
if(!output||!propertiesPath||!keytool)throw new Error('Gunakan --output, --properties, dan --keytool.');
const keystorePath=path.join(output,'erapor-release.jks');const credentialPath=path.join(output,'KEYSTORE-CREDENTIALS.txt');
for(const target of [keystorePath,credentialPath,propertiesPath]){try{await access(target,constants.F_OK);throw new Error(`Release signing sudah tersedia: ${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%';const secret=length=>[...randomBytes(length)].map(byte=>alphabet[byte%alphabet.length]).join('');const storePassword=secret(28),keyPassword=secret(28),keyAlias='erapor-release';
await mkdir(output,{recursive:true});await mkdir(path.dirname(propertiesPath),{recursive:true});
await new Promise((resolve,reject)=>{const child=spawn(keytool,['-genkeypair','-v','-keystore',keystorePath,'-storetype','JKS','-alias',keyAlias,'-keyalg','RSA','-keysize','4096','-validity','10000','-storepass',storePassword,'-keypass',keyPassword,'-dname','CN=e-Rapor SDN Satria Jaya 01, OU=Release, O=SDN Satria Jaya 01, L=Bekasi, ST=Jawa Barat, C=ID'],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`keytool gagal dengan exit code ${code}.`)));});
const gradlePath=keystorePath.replace(/\\/g,'/');await writeFile(propertiesPath,`storeFile=${gradlePath}\nstorePassword=${storePassword}\nkeyAlias=${keyAlias}\nkeyPassword=${keyPassword}\n`,'utf8');await writeFile(credentialPath,`RELEASE SIGNING e-Rapor SDN Satria Jaya 01\nAlias: ${keyAlias}\nStore password: ${storePassword}\nKey password: ${keyPassword}\n\nSimpan file ini terpisah dari keystore dan repository.\n`,'utf8');
