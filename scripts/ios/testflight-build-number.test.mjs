// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('allocates monotonically across release and QA without relying on workflow run counters', () => {
  const output = execFileSync('ruby', ['scripts/ios/testflight-build-number-test.rb'], { encoding: 'utf8' });
  expect(output).toContain('0 failures, 0 errors');
});
