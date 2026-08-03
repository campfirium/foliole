// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  hasLinuxExperimentalNotice,
  LINUX_EXPERIMENTAL_NOTICE,
  requireLinuxExperimentalNotice
} from './linux-experimental-copy.mjs';

describe('Linux Experimental release copy', () => {
  it('states the supported baseline and manual AppImage boundary together', () => {
    expect(LINUX_EXPERIMENTAL_NOTICE).toContain('Ubuntu 24.04 x64');
    expect(LINUX_EXPERIMENTAL_NOTICE).toContain('chmod +x');
    expect(LINUX_EXPERIMENTAL_NOTICE).toContain('Automatic updates');
    expect(LINUX_EXPERIMENTAL_NOTICE).toContain('desktop integration');
    expect(hasLinuxExperimentalNotice(LINUX_EXPERIMENTAL_NOTICE)).toBe(true);
    expect(() => requireLinuxExperimentalNotice('Linux Experimental')).toThrow('reviewed Experimental');
  });
});
