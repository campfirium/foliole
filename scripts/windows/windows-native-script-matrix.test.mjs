import { describe, expect, it } from 'vitest';

import {
  buildWindowsNativeScriptMatrix,
  classifyPackageScript,
  validateWindowsNativeScriptMatrix,
  WINDOWS_NATIVE_MAIN_SCRIPTS,
} from './windows-native-script-matrix.mjs';

import packageJson from '../../package.json' with { type: 'json' };

describe('windows native script matrix', () => {
  it('keeps the Windows native main scripts free of bash and WSL', () => {
    const validation = validateWindowsNativeScriptMatrix(packageJson.scripts);

    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('classifies legacy shell entries instead of treating them as native main scripts', () => {
    expect(classifyPackageScript('windows:preview', packageJson.scripts['windows:preview'])).toBe('wsl-mirror-legacy');
    expect(classifyPackageScript('quality:fast', packageJson.scripts['quality:fast'])).toBe('windows-native-main');
    expect(classifyPackageScript('quality:desktop', packageJson.scripts['quality:desktop'])).toBe('git-bash-portable');
    expect(classifyPackageScript('test:e2e:desktop:agent', packageJson.scripts['test:e2e:desktop:agent'])).toBe(
      'linux-headless-legacy',
    );
  });

  it('keeps native replacements visible for daily Windows development', () => {
    const matrix = buildWindowsNativeScriptMatrix(packageJson.scripts);
    const byName = new Map(matrix.map((row) => [row.name, row]));

    expect(byName.get('windows:preview')?.nativeAlternative).toBe('windows:preview:native');
    expect(byName.get('quality:fast')?.nativeAlternative).toBe('');
    expect(byName.get('desktop:test:windows')?.nativeAlternative).toContain('test:e2e:desktop:native:hidden');
  });

  it('rejects a Windows native main script that routes through bash', () => {
    const scripts = Object.fromEntries(WINDOWS_NATIVE_MAIN_SCRIPTS.map((name) => [name, 'node ok.mjs']));
    scripts['windows:preview:native'] = 'bash scripts/windows/windows-preview.sh';

    expect(validateWindowsNativeScriptMatrix(scripts).errors).toContain(
      'Windows native main script must not use bash/WSL: windows:preview:native',
    );
  });
});
