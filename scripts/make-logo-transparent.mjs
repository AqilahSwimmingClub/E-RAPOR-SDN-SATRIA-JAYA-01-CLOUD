/* Membuang latar gelap pekat dari berkas logo dan menyimpannya kembali sebagai PNG RGBA.
   Dipakai saat logo sekolah diganti dengan berkas yang masih membawa kotak hitam.

     node scripts/make-logo-transparent.mjs assets/logo-sekolah.png assets/logo-sekolah.png

   Latar dikenali lewat perambatan dari tepi bingkai, jadi warna gelap di dalam lambang
   (garis biru tua, mata pena) tidak ikut ditembuskan. */

import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const SRC = process.argv[2];
const OUT = process.argv[3];
const LO = Number(process.argv[4] ?? 40);   // <= LO dan tersambung tepi = latar
const buf = readFileSync(SRC);

/* ---------- baca PNG ---------- */
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('bukan PNG');
let off = 8, ihdr = null, idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
  if (type === 'IDAT') idat.push(data);
  if (type === 'IEND') break;
  off += len + 12;
}
if (!ihdr) throw new Error('IHDR hilang');
if (ihdr.depth !== 8 || ihdr.interlace !== 0 || (ihdr.color !== 2 && ihdr.color !== 6)) {
  throw new Error(`format tidak didukung: depth=${ihdr.depth} color=${ihdr.color} interlace=${ihdr.interlace}`);
}
const { w, h } = ihdr;
const bpp = ihdr.color === 2 ? 3 : 4;
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = w * bpp;
const px = Buffer.alloc(w * h * 4);
let prev = Buffer.alloc(stride);
for (let y = 0; y < h; y++) {
  const ft = raw[y * (stride + 1)];
  const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
    let v = line[i];
    if (ft === 1) v += a;
    else if (ft === 2) v += b;
    else if (ft === 3) v += (a + b) >> 1;
    else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
    line[i] = v & 255;
  }
  prev = line;
  for (let x = 0; x < w; x++) {
    const s = x * bpp, d = (y * w + x) * 4;
    px[d] = line[s]; px[d + 1] = line[s + 1]; px[d + 2] = line[s + 2];
    px[d + 3] = bpp === 4 ? line[s + 3] : 255;
  }
}

/* ---------- flood fill latar gelap dari tepi ---------- */
const bg = new Uint8Array(w * h);
const maxch = new Uint8Array(w * h);
for (let i = 0; i < w * h; i++) maxch[i] = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
const stack = [];
const push = i => { if (!bg[i] && maxch[i] <= LO) { bg[i] = 1; stack.push(i); } };
for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
while (stack.length) {
  const i = stack.pop(), x = i % w, y = (i - x) / w;
  if (x > 0) push(i - 1);
  if (x < w - 1) push(i + 1);
  if (y > 0) push(i - w);
  if (y < h - 1) push(i + w);
}

/* ---------- alpha + feather 1px pada sisi logo (tanpa halo gelap) ---------- */
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x;
  if (bg[i]) { px[i * 4 + 3] = 0; continue; }
  let opaque = 0, total = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    total++; if (!bg[ny * w + nx]) opaque++;
  }
  px[i * 4 + 3] = opaque === total ? 255 : Math.round(255 * opaque / total);
}

/* ---------- tulis PNG RGBA ---------- */
const outStride = w * 4;
const filtered = Buffer.alloc(h * (outStride + 1));
let prevRow = Buffer.alloc(outStride);
for (let y = 0; y < h; y++) {
  const row = px.subarray(y * outStride, (y + 1) * outStride);
  let best = null, bestScore = Infinity;
  for (let ft = 0; ft < 5; ft++) {
    const out = Buffer.alloc(outStride);
    let score = 0;
    for (let i = 0; i < outStride; i++) {
      const a = i >= 4 ? row[i - 4] : 0, b = prevRow[i], c = i >= 4 ? prevRow[i - 4] : 0;
      let v;
      if (ft === 0) v = row[i];
      else if (ft === 1) v = row[i] - a;
      else if (ft === 2) v = row[i] - b;
      else if (ft === 3) v = row[i] - ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = row[i] - ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)); }
      out[i] = v & 255;
      score += Math.min(out[i], 256 - out[i]);
    }
    if (score < bestScore) { bestScore = score; best = { ft, out }; }
  }
  filtered[y * (outStride + 1)] = best.ft;
  best.out.copy(filtered, y * (outStride + 1) + 1);
  prevRow = row;
}
const chunk = (type, data) => {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'ascii');
  data.copy(b, 8);
  b.writeUInt32BE(zlib.crc32 ? zlib.crc32(b.subarray(4, 8 + data.length)) >>> 0 : crc(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
};
let table = null;
function crc(b) {
  if (!table) { table = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
const ih = Buffer.alloc(13);
ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; ih[10] = 0; ih[11] = 0; ih[12] = 0;
writeFileSync(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ih),
  chunk('IDAT', zlib.deflateSync(filtered, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
const cleared = bg.reduce((n, v) => n + v, 0);
console.log(`${w}x${h} -> RGBA | piksel latar transparan: ${cleared} (${(cleared / (w * h) * 100).toFixed(1)}%)`);
