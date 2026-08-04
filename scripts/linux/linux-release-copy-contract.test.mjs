// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertLinuxExperimentalReleaseCopy,
  LINUX_EXPERIMENTAL_LABEL
} from './linux-release-copy-contract.mjs';

const identity = { intent: { selectedPlatforms: ['macos', 'windows', 'linux'] } };

it('requires only the experimental Linux label before publication', () => {
  const body = `Foliole is now available on ${LINUX_EXPERIMENTAL_LABEL}.`;
  expect(assertLinuxExperimentalReleaseCopy(body, identity)).toBe(body);
  expect(() => assertLinuxExperimentalReleaseCopy('Foliole is now available on Linux.', identity))
    .toThrow('must identify the platform');
});

it('does not impose Linux copy on a non-Linux release scope', () => {
  expect(assertLinuxExperimentalReleaseCopy('macOS update.', { intent: { selectedPlatforms: ['macos'] } }))
    .toBe('macOS update.');
});
