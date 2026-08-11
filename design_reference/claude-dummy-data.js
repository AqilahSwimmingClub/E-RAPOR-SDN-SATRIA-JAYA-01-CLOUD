// e-Rapor SDN Satria Jaya 01 — dummy data generator (deterministic, no backend)
export const SEKOLAH = "SDN Satria Jaya 01";
export const NPSN = "20218098";
export const TAHUN_AJARAN = "2026/2027";
export const SEMESTERS = ["Ganjil 2025/2026", "Genap 2025/2026"];

const TINGKAT = [1, 2, 3, 4, 5, 6];
const KELAS = ["A", "B", "C", "D"];

const TEACHER_NAMES = [
  "Siti Rohmah, S.Pd.", "Ahmad Fauzan, S.Pd.", "Dewi Kartika, S.Pd.SD", "Bambang Wijaya, S.Pd.",
  "Nur Halimah, S.Pd.", "Rudi Hartono, S.Pd.SD", "Yuni Astuti, S.Pd.", "Agus Salim, S.Pd.",
  "Rina Marlina, S.Pd.", "Hendra Gunawan, S.Pd.SD", "Fitriani, S.Pd.", "Dedi Kurniawan, S.Pd.",
  "Wulandari, S.Pd.", "Eko Prasetyo, S.Pd.SD", "Maya Sari, S.Pd.", "Iwan Setiawan, S.Pd.",
  "Lestari Ningsih, S.Pd.", "Sugeng Riyadi, S.Pd.SD", "Anisa Putri, S.Pd.", "Joko Susanto, S.Pd.",
  "Ratna Sari, S.Pd.", "Taufik Hidayat, S.Pd.SD", "Indah Permata, S.Pd.", "Slamet Riyanto, S.Pd."
];

const MALE_FIRST = ["Muhammad", "Ahmad", "Rizky", "Fajar", "Bagus", "Dimas", "Arif", "Yusuf", "Fikri", "Reza", "Aldi", "Gilang", "Rian", "Fahri", "Ilham", "Bayu"];
const FEMALE_FIRST = ["Siti", "Nur", "Putri", "Ayu", "Salsabila", "Dewi", "Aisyah", "Rara", "Kirana", "Salma", "Zahra", "Intan", "Rahma", "Cantika", "Fitri", "Bunga"];
const LAST = ["Pratama", "Saputra", "Wijaya", "Ramadhan", "Setiawan", "Anggraini", "Firmansyah", "Kusuma", "Maulana", "Hidayat", "Susanto", "Permata", "Utami", "Santoso", "Lestari", "Nugraha"];
const ORTU_FIRST = ["Bapak", "Ibu"];
const ALAMAT_JALAN = ["Jl. Merdeka", "Jl. Anggrek", "Jl. Mawar Indah", "Jl. Cempaka", "Jl. Kenanga", "Jl. Flamboyan", "Jl. Kartini", "Jl. Sudirman Gg."];

function lcg(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

export function rombelList() {
  const list = [];
  TINGKAT.forEach((t) => KELAS.forEach((k) => list.push({ id: `${t}${k}`, tingkat: t, kelas: k, nama: `Kelas ${t}${k}`, fase: t <= 2 ? "A" : t <= 4 ? "B" : "C" })));
  return list;
}
const ROMBEL = rombelList();

export function teacherForRombel(rombelId) {
  const idx = ROMBEL.findIndex((r) => r.id === rombelId);
  const nama = TEACHER_NAMES[idx % TEACHER_NAMES.length];
  const nip = `19850${(300 + idx).toString().padStart(3, "0")}200901${(idx % 9) + 1}0${(idx % 2) + 1}`;
  return { nama, nip, username: `guru${rombelId.toLowerCase()}`, password: `Kelas${rombelId}`, rombelId, jabatan: "Guru Kelas / Wali Kelas" };
}
export function allTeachers() { return ROMBEL.map((r) => teacherForRombel(r.id)); }

export function studentsForRombel(rombelId, count) {
  const rb = ROMBEL.find((r) => r.id === rombelId);
  const n = count || 26 + (rb.tingkat % 4);
  const rng = lcg(rombelId.charCodeAt(0) * 977 + rombelId.charCodeAt(1) * 131 + rb.tingkat * 7);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const isMale = rng() > 0.48;
    const nama = `${pick(rng, isMale ? MALE_FIRST : FEMALE_FIRST)} ${pick(rng, LAST)}`;
    const day = 1 + Math.floor(rng() * 27);
    const month = 1 + Math.floor(rng() * 12);
    const birthYear = 2019 - rb.tingkat - (rng() > 0.7 ? 1 : 0);
    const nisn = `00${(rb.tingkat).toString()}${rb.kelas.charCodeAt(0)}${(1000 + i).toString().padStart(4, "0")}${rombelId}`.slice(0, 10);
    out.push({
      no: i,
      nis: `${rb.tingkat}${rb.kelas.charCodeAt(0) - 64}${(1000 + i).toString().padStart(3, "0")}`,
      nisn: `00${birthYear.toString().slice(2)}${(1000 + i * 7 + rb.tingkat).toString().slice(-5)}`,
      nama,
      jk: isMale ? "L" : "P",
      ttl: `Bekasi, ${day.toString().padStart(2, "0")}-${month.toString().padStart(2, "0")}-${birthYear}`,
      ortu: `${pick(rng, ORTU_FIRST)} ${pick(rng, LAST)}`,
      noWa: `08${1 + Math.floor(rng() * 8)}${Math.floor(1000 + rng() * 8999)}${Math.floor(1000 + rng() * 8999)}`,
      alamat: `${pick(rng, ALAMAT_JALAN)} No. ${1 + Math.floor(rng() * 40)}, Tambun Utara`,
      rombelId,
    });
  }
  return out;
}

export const MAPEL_WAJIB = [
  "Pendidikan Agama dan Budi Pekerti",
  "Pendidikan Pancasila",
  "Bahasa Indonesia",
  "Matematika",
  "Ilmu Pengetahuan Alam dan Sosial (IPAS)",
  "Pendidikan Jasmani, Olahraga, dan Kesehatan",
  "Seni dan Budaya",
];
export const MAPEL_PILIHAN = [
  "Bahasa Inggris",
  "Muatan Lokal - Bahasa Sunda",
  "Koding dan Kecerdasan Artifisial",
];
export const MAPEL = [...MAPEL_WAJIB, ...MAPEL_PILIHAN];

export function tpForMapel(mapel, fase) {
  const seedBase = mapel.length + fase.charCodeAt(0);
  const rng = lcg(seedBase * 13);
  const count = 4 + Math.floor(rng() * 3);
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push({ id: `${mapel.slice(0, 3)}-${fase}-${i}`, kode: `TP${i}`, deskripsi: `Tujuan pembelajaran ${i} — capaian fase ${fase} pada ${mapel}`, dinilai: rng() > 0.35 });
  }
  return out;
}

export function nilaiSiswa(rombelId, mapel, studentIndex) {
  const seed = (rombelId.charCodeAt(0) * 911 + rombelId.charCodeAt(1) * 37 + mapel.length * 271 + studentIndex * 4127 + 1009) % 2147483000 + 100;
  const rng = lcg(seed);
  rng(); rng(); rng();
  return 65 + Math.floor(rng() * 33);
}

export function deskripsiCapaian(nilai) {
  if (nilai >= 90) return "Sangat baik dalam memahami dan menerapkan materi.";
  if (nilai >= 80) return "Baik dalam memahami materi, perlu sedikit penguatan.";
  if (nilai >= 70) return "Cukup memahami materi, perlu bimbingan lanjutan.";
  return "Perlu pendampingan lebih intensif untuk mencapai kompetensi.";
}

export const BOBOT_DEFAULT = { "Sumatif Harian": 40, "Sumatif Tengah Semester": 25, "Sumatif Akhir Semester": 35 };

export function absensiStatusFor(rombelId, studentIndex, dateSeed) {
  const rng = lcg((rombelId.length * 41 + studentIndex * 97 + dateSeed * 7) % 2147483000 + 50);
  const r = rng();
  if (r > 0.94) return "Alpa";
  if (r > 0.88) return "Izin";
  if (r > 0.82) return "Sakit";
  return "Hadir";
}

export { ROMBEL };
