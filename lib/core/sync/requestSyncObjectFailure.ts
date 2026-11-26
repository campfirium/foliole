import { readFramedSyncMissingDependency } from './framedSyncInventoryRoundDelivery.js';

// Failures of the session, the peer or this device's storage. Every other failure that is bound to one
// verified object only holds that object back; a system failure missing here still reports it as unsynced.
const SESSION_FAILURE = new RegExp([
  '^request_sync_(peer|batch|http|snapshot|operation|mode|response|directory)_',
  '^request_sync_(library_changed|local_epoch_missing|foreground_ended|files_closed|direction_invalid)',
  '^request_sync_object_(savepoint_failed|identity_|source_mismatch|header_required|incomplete|trailing_data)',
  '^request_(cancelled|aborted)',
  '^sync_group_',
  '^framed_sync_(preamble|frame|http|protocol|session|peer|stream|aead|auth|crypto|restore)',
  'AbortError|operation was aborted',
  'SQLITE_(FULL|IOERR|CORRUPT|NOMEM|BUSY|LOCKED|CANTOPEN|READONLY|NOTADB)',
  'database or disk is full|disk I/O error|database disk image is malformed|database( table)? is locked',
  'readonly database|out of memory|unable to open database|file is not a database|ENOSPC|EIO\\b'
].join('|'), 'u');

export function isRequestSyncObjectFailure(error: string) {
  const detail = error.replace(/^framed_sync_http_400:/u, '');
  return detail !== 'framed_sync_source_changed' && detail !== 'framed_sync_difference_request_source_changed' &&
    !readFramedSyncMissingDependency(detail) && !SESSION_FAILURE.test(detail);
}
