// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  WINDOWS_CI_PLAYWRIGHT_SPECS,
  WINDOWS_PHYSICAL_ONLY_SPECS,
  renderWindowsCiPlaywrightProfile,
  runWindowsCiPlaywright,
  validateWindowsCiPlaywrightProfile
} from './windows-ci-playwright-profile.mjs';

describe('Windows CI Playwright profile', () => {
  it('keeps a fixed CI suite separate from physical-only specs', () => {
    expect(WINDOWS_CI_PLAYWRIGHT_SPECS).toEqual([
      'tests/desktop/hidden-native-presentation.spec.ts',
      'tests/desktop/agent-control-visible-write.spec.ts'
    ]);
    expect(WINDOWS_PHYSICAL_ONLY_SPECS).toEqual([
      'tests/desktop/global-capture-panel.spec.ts',
      'tests/desktop/global-capture-toast-navigation.spec.ts',
      'tests/desktop/visible-native-presentation.spec.ts'
    ]);
    expect(validateWindowsCiPlaywrightProfile()).toEqual({ errors: [], ok: true });
  });

  it('fails closed for missing, invalid, duplicate, or physical-only CI specs', () => {
    const result = validateWindowsCiPlaywrightProfile({
      ciSpecs: [
        'tests/desktop/missing.spec.ts',
        'tests/desktop/visible-native-presentation.spec.ts',
        'tests/desktop/visible-native-presentation.spec.ts',
        '../outside.spec.ts'
      ],
      existsSync: (filePath) => !filePath.endsWith('missing.spec.ts'),
      physicalOnlySpecs: ['tests/desktop/visible-native-presentation.spec.ts']
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('ci-suite spec is missing');
    expect(result.errors.join('\n')).toContain('ci-suite has invalid desktop spec path');
    expect(result.errors.join('\n')).toContain('ci-suite contains a duplicate spec');
    expect(result.errors.join('\n')).toContain('physical-only spec cannot enter ci-suite');
  });

  it('lists classifications without treating unlisted specs as CI capable', () => {
    const output = renderWindowsCiPlaywrightProfile();
    expect(output).toContain('ci-suite=tests/desktop/hidden-native-presentation.spec.ts');
    expect(output).toContain('physical-only=tests/desktop/global-capture-toast-navigation.spec.ts');
    expect(output).toContain('physical-only-capability=installer-and-updater');
    expect(output).not.toContain('main-path-smoke.spec.ts');
  });

  it('runs the existing hidden gate with only the fixed allowlist on Windows', async () => {
    const runGate = vi.fn(async () => 0);
    await expect(runWindowsCiPlaywright({ platform: 'win32', runGate })).resolves.toBe(0);
    expect(runGate).toHaveBeenCalledWith({ argv: WINDOWS_CI_PLAYWRIGHT_SPECS });
    runGate.mockResolvedValueOnce(7);
    await expect(runWindowsCiPlaywright({ platform: 'win32', runGate })).resolves.toBe(7);
    await expect(runWindowsCiPlaywright({ platform: 'darwin', runGate }))
      .rejects.toThrow('requires win32');
  });
});
