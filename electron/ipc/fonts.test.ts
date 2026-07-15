// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createSystemFontCatalogLoader, listSystemFontsForPlatform } from './fonts.js';

it('lists Windows fonts from PowerShell output with Unicode names', async () => {
  const exec = vi.fn(async (file: string, args: string[]) => {
    const command = `${file} ${args.join(' ')}`;
    if (command.startsWith('powershell ')) {
      return ['微软雅黑', '微软雅黑 Bold', 'Cascadia Mono', 'Wingdings 2 (TrueType)', '微软雅黑 Semibold', 'UD Digi Kyokasho N & UD Digi Kyokasho NP (TrueType)'].join('\n');
    }
    throw new Error('unexpected command');
  });

  const catalog = await listSystemFontsForPlatform('win32', exec);

  expect([...catalog.fonts].sort()).toEqual([
    'Cascadia Mono',
    'UD Digi Kyokasho N',
    'UD Digi Kyokasho NP',
    'Wingdings 2',
    '微软雅黑'
  ].sort());
  expect(catalog.monospace_fonts).toEqual(['Cascadia Mono']);
});

it('keeps a Windows style-named family when no unsuffixed base family exists', async () => {
  const exec = vi.fn(async () => ['Acme Display Bold', 'Solo Light'].join('\n'));
  const catalog = await listSystemFontsForPlatform('win32', exec);
  expect(catalog.fonts).toEqual(['Acme Display Bold', 'Solo Light']);
});

it('lists enabled macOS font families once and filters private families', async () => {
  const exec = vi.fn(async () => JSON.stringify({
    SPFontsDataType: [
      { enabled: 'yes', typefaces: [
        { enabled: 'yes', family: 'PingFang SC' },
        { enabled: 'yes', family: 'PingFang SC' },
        { enabled: 'no', family: 'Disabled Face' },
        { enabled: 'yes', family: '.AppleSystemUIFont' },
        { enabled: 'yes', family: 'LastResort' }
      ] },
      { enabled: 'no', typefaces: [{ enabled: 'yes', family: 'Disabled Family' }] }
    ]
  }));
  const catalog = await listSystemFontsForPlatform('darwin', exec);
  expect(catalog.fonts).toEqual(['PingFang SC']);
  expect(exec).toHaveBeenCalledWith('system_profiler', ['SPFontsDataType', '-json']);
});

it('returns an empty safe catalog for malformed macOS JSON', async () => {
  const catalog = await listSystemFontsForPlatform('darwin', vi.fn(async () => 'not-json'));
  expect(catalog).toEqual({ fonts: [], monospace_fonts: [] });
});

it('lists Windows fonts from registry query output instead of returning empty catalog', async () => {
  const exec = vi.fn(async (file: string, args: string[]) => {
    const key = `${file} ${args.join(' ')}`;
    if (key.startsWith('powershell ')) {
      throw new Error('powershell not available');
    }
    if (key.includes('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')) {
      return [
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
        '    Arial (TrueType)    REG_SZ    arial.ttf',
        '    Cascadia Mono (TrueType)    REG_SZ    C:\\Windows\\Fonts\\CascadiaMono.ttf',
        '    @SimSun (TrueType)    REG_SZ    simsun.ttc'
      ].join('\n');
    }
    if (key.includes('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')) {
      return 'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\n';
    }
    throw new Error('unexpected command');
  });

  const catalog = await listSystemFontsForPlatform('win32', exec);

  expect(catalog.fonts).toEqual(['Arial', 'Cascadia Mono', 'SimSun']);
  expect(catalog.monospace_fonts).toEqual(['Cascadia Mono']);
});

it('shares one in-flight font catalog request for the application session', async () => {
  const exec = vi.fn(async () => JSON.stringify({ SPFontsDataType: [{ typefaces: [{ family: 'Menlo' }] }] }));
  const loadCatalog = createSystemFontCatalogLoader('darwin', exec);

  const [first, second] = await Promise.all([loadCatalog(), loadCatalog()]);

  expect(first).toBe(second);
  expect(exec).toHaveBeenCalledTimes(1);
});
