import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';

export const FRAMED_SYNC_FACT_FRAGMENT_BYTES = 512 * 1024;
// Transport packaging overhead is separate from the original canonical fact budget.
export const FRAMED_SYNC_MAX_ENCODED_FACT_BYTES = 2 * FRAMED_SYNC_LIMITS.maxCanonicalManifestBytes;
