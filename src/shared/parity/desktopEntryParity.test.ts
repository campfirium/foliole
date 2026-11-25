// @vitest-environment node

import { describe, expect, it } from 'vitest';

import inventory from './desktopEntryInventory.json';
import { checkDesktopEntryInventory, DECLARE_HINT, type DesktopEntryRecord } from './desktopEntryInventory.testSupport';
import { findDirectMenuPrimitiveImports, scanCommandIds, scanDesktopEntries, scanSettingsCatalog, scanUiSource } from './desktopEntryScan.testSupport';
import unreviewedBaseline from './desktopEntryUnreviewedBaseline.json';

describe('desktop entry parity inventory', () => {
  it('declares mobile handling for every desktop command, menu item and setting', () => {
    const scanned = scanDesktopEntries(process.cwd());
    for (const prefix of ['command:', 'menu:', 'setting:']) {
      expect(scanned.some((id) => id.startsWith(prefix)), `${prefix} entries must be discoverable`).toBe(true);
    }

    const result = checkDesktopEntryInventory(scanned, inventory as DesktopEntryRecord[], unreviewedBaseline);
    expect(result, [
      DECLARE_HINT,
      'stale：源码里已没有，删掉清单行。staleBaseline：已核对或已删除，从 desktopEntryUnreviewedBaseline.json 删掉。'
    ].join('\n')).toEqual({ undeclared: [], stale: [], duplicates: [], invalid: [], staleBaseline: [] });
    expect(findDirectMenuPrimitiveImports(process.cwd()), '菜单底层组件只能经 src/shared/ui 使用').toEqual([]);
  });

  it('extracts command, menu and setting identifiers from source', () => {
    expect(scanCommandIds("export const APP_COMMAND_IDS = { undo: 'app.undo', goBack: IDS.goBack } as const;"))
      .toEqual(['command:undo', 'command:goBack']);
    expect(scanUiSource('src/app/Menu.tsx', [
      "const a = <NodeContextMenuItem>{t('desktop.menu.move')}</NodeContextMenuItem>;",
      'const b = <AppDropdownMenuItem>{label}</AppDropdownMenuItem>;',
      'const c = <AppDropdownMenuItem {...props}>{children}</AppDropdownMenuItem>;',
      "const d = <SettingsRow title={t('settings.demo.title')} />;",
      'const e = <SettingsRow title={rowTitle} />;'
    ].join('\n'))).toEqual([
      'menu:desktop.menu.move',
      'menu:src/app/Menu.tsx#AppDropdownMenuItem',
      'setting:settings.demo.title',
      'setting:src/app/Menu.tsx#SettingsRow'
    ]);
    expect(scanSettingsCatalog("const ID = 'general-capture'; const rows = [row('general', ID, 'a'), row('about', 'about-logs', 'b')];"))
      .toEqual(['setting:general-capture', 'setting:about-logs']);
  });

  it('rejects undeclared entries, the unreviewed shortcut and incomplete declarations', () => {
    const result = checkDesktopEntryInventory(
      ['command:new', 'command:shortcut', 'command:empty', 'command:badTask', 'command:legacy'],
      [
        { id: 'command:shortcut', mobile: 'unreviewed' },
        { id: 'command:empty', mobile: 'desktopOnly', reason: ' ' },
        { id: 'command:badTask', mobile: 'later', task: '以后' },
        { id: 'command:legacy', mobile: 'unreviewed' },
        { id: 'command:gone', mobile: 'entry', mobileEntry: '更多菜单' }
      ],
      ['command:legacy', 'command:reviewed']
    );
    expect(result.undeclared).toEqual(['command:new']);
    expect(result.stale).toEqual(['command:gone']);
    expect(result.invalid.map((message) => message.split(': ')[0]))
      .toEqual(['command:shortcut', 'command:empty', 'command:badTask']);
    expect(result.staleBaseline).toEqual(['command:reviewed']);
  });
});
