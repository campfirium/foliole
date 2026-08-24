export const INSTRUMENTATION_RECEIPT_OWNER = 'O-android-instrumentation-receipt';

function failure(message) {
  throw Object.assign(new Error(`Instrumentation receipt: ${message}`), {
    failureAxis: 'instrumentation-receipt', failureOwner: INSTRUMENTATION_RECEIPT_OWNER
  });
}

export function consumeActionReceipt(output, { acceptReceipt }) {
  const value = String(output);
  const terminalCodes = [...value.matchAll(/^INSTRUMENTATION_CODE: (-?\d+)$/gmu)]
    .map((match) => Number(match[1]));
  if (terminalCodes.length !== 1 || terminalCodes[0] !== -1) {
    failure('instrumentation did not reach its successful process exit');
  }
  const prefix = 'INSTRUMENTATION_STATUS: folioleActionReceipt=';
  const lines = value.split(/\r?\n/u).filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) failure('channel must produce exactly one action receipt');
  let receipt;
  try { receipt = JSON.parse(lines[0].slice(prefix.length)); }
  catch { failure('channel payload is invalid JSON'); }
  if (typeof acceptReceipt !== 'function' || acceptReceipt(receipt) !== true) {
    failure('action-local consumer rejected the receipt');
  }
  return { channel: 'folioleActionReceipt', owner: INSTRUMENTATION_RECEIPT_OWNER,
    receipt, terminal: 'consumed' };
}
