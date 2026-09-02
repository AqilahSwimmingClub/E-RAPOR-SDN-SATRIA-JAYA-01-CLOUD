import { randomBytes } from 'node:crypto';
/* Membantu membuat nilai acak untuk LICENSE_HASH_PEPPER dan LICENSE_RECOVERY_KEY. */
console.log(`LICENSE_HASH_PEPPER=${randomBytes(32).toString('base64url')}`);
console.log(`LICENSE_RECOVERY_KEY=${randomBytes(32).toString('base64url')}`);
