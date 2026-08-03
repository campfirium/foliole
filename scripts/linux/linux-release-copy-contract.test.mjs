// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertLinuxExperimentalReleaseCopy,
  LINUX_EXPERIMENTAL_RELEASE_COPY
} from './linux-release-copy-contract.mjs';

const identity = { intent: { selectedPlatforms: ['macos', 'windows', 'linux'] } };

it('requires the complete user-facing Linux Experimental boundary before publication', () => {
  const body = LINUX_EXPERIMENTAL_RELEASE_COPY.join('\n');
  expect(assertLinuxExperimentalReleaseCopy(body, identity)).toBe(body);
  expect(() => assertLinuxExperimentalReleaseCopy(body.replace('Updates are manual:', 'Updates:'), identity))
    .toThrow('Updates are manual');
  expect(() => assertLinuxExperimentalReleaseCopy(`${body}\nThe primary selection is unreadable.`, identity))
    .toThrow('must not claim');
});

it('does not impose Linux copy on a non-Linux release scope', () => {
  expect(assertLinuxExperimentalReleaseCopy('macOS update.', { intent: { selectedPlatforms: ['macos'] } }))
    .toBe('macOS update.');
});
