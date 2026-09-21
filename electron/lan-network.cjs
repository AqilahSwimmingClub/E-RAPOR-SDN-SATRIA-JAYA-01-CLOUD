'use strict';

/* PEMILIHAN ALAMAT JARINGAN UNTUK SERVER LAN.

   Sebuah PC sekolah jarang hanya punya satu adaptor. Yang lazim ada bersamaan: Ethernet,
   Wi-Fi, adaptor virtual Hyper-V/WSL, VirtualBox, VMware, dan adaptor VPN. Mengambil adaptor
   pertama yang ditemukan adalah cara paling cepat untuk salah: alamat Hyper-V tidak dapat
   dijangkau laptop guru, dan alamat VPN justru membuka aplikasi ke jaringan yang sama sekali
   bukan jaringan sekolah.

   Karena itu pemilihannya berdasarkan penilaian, bukan urutan:

   1. HANYA IPv4 PRIVAT. Alamat publik tidak pernah ditawarkan - server sekolah tidak boleh
      tidak sengaja terlihat dari internet. Rentang privat: 10.x, 172.16-31.x, 192.168.x.
   2. ALAMAT LINK-LOCAL (169.254.x) DIBUANG. Itu tanda DHCP gagal; alamatnya tidak berguna.
   3. ADAPTOR VIRTUAL DAN VPN DITURUNKAN PERINGKATNYA, dikenali dari namanya. Mereka tetap
      ditampilkan supaya Admin dapat memilihnya bila memang itu jaringan sekolahnya, tetapi
      tidak pernah menjadi pilihan bawaan.
   4. 192.168.x DAN 10.x DIUTAMAKAN karena itulah yang dipakai router sekolah pada umumnya.

   ALAMAT TIDAK PERNAH DIANGGAP TETAP. DHCP dapat memberi alamat berbeda setiap kali komputer
   dinyalakan, jadi daftar ini disusun ulang setiap kali server dijalankan dan setiap kali
   halaman Server LAN dibuka - bukan disimpan sekali lalu dipercaya selamanya. */

const os=require('node:os');

const POLA_VIRTUAL=/(vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|loopback|tunnel|tap-|tun\d|openvpn|wireguard|zerotier|tailscale|radmin|hamachi|bluetooth)/i;

function privat(alamat){
  const bagian=String(alamat).split('.').map(Number);
  if(bagian.length!==4||bagian.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  const [a,b]=bagian;
  if(a===10)return true;
  if(a===172&&b>=16&&b<=31)return true;
  if(a===192&&b===168)return true;
  return false;
}

function linkLocal(alamat){return /^169\.254\./.test(String(alamat));}

function nilaiAdaptor(nama,alamat){
  let nilai=0;
  if(/^192\.168\./.test(alamat))nilai+=40;
  else if(/^10\./.test(alamat))nilai+=30;
  else nilai+=20;                                   /* 172.16-31 */
  if(POLA_VIRTUAL.test(nama))nilai-=50;             /* virtual/VPN tidak pernah jadi bawaan */
  if(/^(wi-?fi|wlan|wireless|nirkabel)/i.test(nama))nilai+=6;
  if(/^(ethernet|eth\d|en\w+|lan)/i.test(nama))nilai+=5;
  return nilai;
}

/* Daftar alamat LAN yang layak, terurut dari yang paling mungkin benar. */
function daftarAlamatLan(antarmuka=os.networkInterfaces()){
  const hasil=[];
  for(const [nama,daftar] of Object.entries(antarmuka||{})){
    for(const item of daftar||[]){
      if(!item||item.internal)continue;
      const keluarga=typeof item.family==='number'?(item.family===4?'IPv4':'IPv6'):item.family;
      if(keluarga!=='IPv4')continue;
      if(linkLocal(item.address)||!privat(item.address))continue;
      hasil.push({nama,alamat:item.address,virtual:POLA_VIRTUAL.test(nama),nilai:nilaiAdaptor(nama,item.address)});
    }
  }
  hasil.sort((a,b)=>b.nilai-a.nilai||a.alamat.localeCompare(b.alamat));
  return hasil.map(({nama,alamat,virtual})=>({nama,alamat,virtual}));
}

/* Alamat yang dipilih Admin tetap dihormati SELAMA ia masih benar-benar ada pada komputer ini.
   Kalau DHCP sudah menggantinya, pilihan lama tidak dipaksakan - server akan gagal mengikat
   alamat yang tidak ada lagi - melainkan jatuh ke alamat terbaik yang tersedia sekarang. */
function pilihAlamat(disukai,antarmuka=os.networkInterfaces()){
  const daftar=daftarAlamatLan(antarmuka);
  if(!daftar.length)return null;
  const cocok=daftar.find(item=>item.alamat===disukai);
  return (cocok||daftar[0]).alamat;
}

module.exports={daftarAlamatLan,pilihAlamat,privat,linkLocal,POLA_VIRTUAL};
