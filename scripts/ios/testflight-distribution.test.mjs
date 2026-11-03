// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('executes the production distribution state machine across processing, compliance and retries', () => {
  const output = execFileSync('ruby', ['scripts/ios/testflight-distribution-test.rb'], { encoding: 'utf8' });
  expect(output).toContain('0 failures, 0 errors');
});
