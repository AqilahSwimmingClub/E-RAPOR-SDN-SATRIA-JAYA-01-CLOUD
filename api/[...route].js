import { createVercelHandler } from './handler.js';

/* Titik masuk Vercel Functions. Seluruh permintaan /api/v1/... diteruskan ke core API yang
   sama dengan yang dipakai server lokal, sehingga kontrak HTTP publik dan pemilik identik di
   kedua tempat. */
export default createVercelHandler();
