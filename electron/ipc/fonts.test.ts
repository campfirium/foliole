// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { listSystemFontsForPlatform } from './fonts.js';

it('lists Windows fonts from PowerShell output with Unicode names', () => {
  const exec = vi.fn((file: string, args: string[]) => {
    const command = `${file} ${args.join(' ')}`;
    if (command.startsWith('powershell ')) {
      return ['微软雅黑', '微软雅黑 Bold', 'Cascadia Mono', 'Wingdings 2 (TrueType)', '微软雅黑 Semibold', 'UD Digi Kyokasho N & UD Digi Kyokasho NP (TrueType)'].join('\n');
    }
    throw new Error('unexpected command');
  });

  const catalog = listSystemFontsForPlatform('win32', exec as never);

  expect([...catalog.fonts].sort()).toEqual([
    'Cascadia Mono',
    'UD Digi Kyokasho N',
    'UD Digi Kyokasho NP',
    'Wingdings 2',
    '微软雅黑',
    '微软雅黑 Bold',
    '微软雅黑 Semibold'
  ].sort());
  expect(catalog.monospace_fonts).toEqual(['Cascadia Mono']);
});

it('lists Windows fonts from registry query output instead of returning empty catalog', () => {
  const exec = vi.fn((file: string, args: string[]) => {
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

  const catalog = listSystemFontsForPlatform('win32', exec as never);

  expect(catalog.fonts).toEqual(['Arial', 'Cascadia Mono', 'SimSun']);
  expect(catalog.monospace_fonts).toEqual(['Cascadia Mono']);
});
