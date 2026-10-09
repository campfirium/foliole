import { describeFriFailure } from './fri-xctest-diagnosis.mjs';

export function assertFriRunSucceeded(result, label = 'Fri XCTest') {
  if ((result.code ?? result.status) === 0) return;
  const failure = describeFriFailure(result, label);
  throw Object.assign(new Error(failure.message), failure, {
    code: result.code ?? result.status ?? 1,
    cause: result.error
  });
}
