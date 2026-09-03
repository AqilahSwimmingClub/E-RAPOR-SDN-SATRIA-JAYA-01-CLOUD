/* NASKAH CAPAIAN PEMBELAJARAN RESMI — berkas data, bukan logika.

   Data di bawah hanya berasal dari dokumen resmi yang diberikan pengguna. Naskah nasional
   menggunakan Keputusan Kepala BSKAP Nomor 046/H/KR/2025, khusus jenjang SD dan fase yang
   berlaku. Bahasa Sunda menggunakan Keputusan Kepala Dinas Pendidikan Provinsi Jawa Barat
   Nomor 32817/Pk.05.02/Sekre/2022 melalui Buku Saku Kurikulum Merdeka Bahasa Sunda.

   Koding dan Kecerdasan Artifisial belum diisi di sini karena dokumen panduan resminya belum
   tersedia sebagai berkas lokal pada pekerjaan ini. Kombinasi fase yang memang tidak berlaku
   juga tetap kosong. */

import { DATA as AGAMA_PANCASILA } from './cp-naskah-046-agama-pancasila.js';
import { DATA as BAHASA_MATEMATIKA } from './cp-naskah-046-bahasa-matematika.js';
import { DATA as LAINNYA } from './cp-naskah-046-lainnya.js';
import { DATA as SUNDA } from './cp-naskah-sunda.js';

export const CP_NASKAH=Object.freeze({
  ...AGAMA_PANCASILA,
  ...BAHASA_MATEMATIKA,
  ...LAINNYA,
  ...SUNDA,
});

/* Naskah CP satu mata pelajaran pada satu fase, atau null bila belum dimuat. */
export function naskahCp(subjectId,phase){
  return CP_NASKAH[`${subjectId}|${phase}`]?.ringkas??null;
}

/* Capaian satu elemen CP, atau null bila belum dimuat terpisah. */
export function naskahElemen(subjectId,phase,elementName){
  return CP_NASKAH[`${subjectId}|${phase}`]?.elemen?.[elementName]??null;
}
