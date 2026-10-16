import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';

/** Existing recovery scenarios drain bounded slices until completion or the first reported fault. */
export async function drainAttachmentSlices(...args: Parameters<typeof exchangeRequestSyncAttachments>) {
  let transferred = 0;
  for (let attempts = 0; attempts < 100; attempts++) {
    let failed = false;
    const result = await exchangeRequestSyncAttachments(args[0], args[1], (key, error) => {
      failed = true;
      args[2](key, error);
    });
    transferred += result.transferred;
    if (result.pending === 0 || (!result.blocks && !result.yielded) || failed) return { pending: result.pending, transferred };
  }
  throw new Error('attachment_test_did_not_converge');
}
