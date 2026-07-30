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

  it('classifies remaining host entries without a WSL mirror class', () => {
    expect(packageJson.scripts['windows:preview']).toBeUndefined();
    expect(classifyPackageScript('quality:fast', packageJson.scripts['quality:fast'])).toBe('windows-native-main');
    expect(classifyPackageScript('quality:desktop', packageJson.scripts['quality:desktop'])).toBe('git-bash-portable');
    expect(classifyPackageScript('test:e2e:desktop:agent', packageJson.scripts['test:e2e:desktop:agent'])).toBe(
      'linux-headless-legacy',
    );
  });

  it('keeps native entries visible for daily Windows development', () => {
    const matrix = buildWindowsNativeScriptMatrix(packageJson.scripts);
    const byName = new Map(matrix.map((row) => [row.name, row]));

    expect(byName.get('windows:preview:native')?.classification).toBe('windows-native-main');
    expect(byName.has('windows:android:dev-server')).toBe(false);
    expect(byName.get('quality:fast')?.nativeAlternative).toBe('');
    expect(byName.has('desktop:test:windows')).toBe(false);
  });

  it('rejects a Windows native main script that routes through bash', () => {
    const scripts = Object.fromEntries(WINDOWS_NATIVE_MAIN_SCRIPTS.map((name) => [name, 'node ok.mjs']));
    scripts['windows:preview:native'] = 'bash scripts/windows/legacy-preview.sh';

    expect(validateWindowsNativeScriptMatrix(scripts).errors).toContain(
      'Windows native main script must not use bash/WSL: windows:preview:native',
    );
  });
});
