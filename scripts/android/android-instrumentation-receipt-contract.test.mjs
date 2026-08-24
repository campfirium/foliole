// @vitest-environment node

import { expect, it } from 'vitest';

import {
  consumeActionReceipt, INSTRUMENTATION_RECEIPT_OWNER
} from './android-instrumentation-receipt-contract.mjs';

function output(receipt, code = -1) {
  return `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify(receipt)}\nINSTRUMENTATION_CODE: ${code}\n`;
}

it('ends the channel only after one action-local receipt and successful process exit', () => {
  expect(consumeActionReceipt(output({ actionId: 'action-13', ok: true }), {
    acceptReceipt: (receipt) => receipt.actionId === 'action-13' && receipt.ok === true
  })).toMatchObject({ channel: 'folioleActionReceipt', owner: INSTRUMENTATION_RECEIPT_OWNER,
    terminal: 'consumed' });
});

it('routes missing, duplicate, malformed, rejected and failed-exit receipts to instrumentation', () => {
  const cases = [
    'INSTRUMENTATION_CODE: -1\n',
    `${output({ ok: true })}INSTRUMENTATION_STATUS: folioleActionReceipt={}\n`,
    'INSTRUMENTATION_STATUS: folioleActionReceipt={bad}\nINSTRUMENTATION_CODE: -1\n',
    output({ actionId: 'wrong', ok: true }),
    output({ actionId: 'action-13', ok: true }, 0),
    `${output({ actionId: 'action-13', ok: true })}INSTRUMENTATION_CODE: -1\n`
  ];
  for (const value of cases) {
    try {
      consumeActionReceipt(value, { acceptReceipt: (receipt) => receipt.actionId === 'action-13' });
    } catch (error) {
      expect(error).toMatchObject({ failureAxis: 'instrumentation-receipt',
        failureOwner: INSTRUMENTATION_RECEIPT_OWNER });
      continue;
    }
    throw new Error('expected receipt proof to fail');
  }
});
