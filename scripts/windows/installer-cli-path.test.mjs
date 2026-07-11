import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

let installer;

beforeAll(async () => {
  installer = await readFile(path.resolve('build', 'installer.nsh'), 'utf8');
});

describe('Windows installer public CLI registration', () => {
  it('adds one per-user bin segment and broadcasts the environment change', () => {
    expect(installer).toContain('Function AddFolioleCliToUserPath');
    expect(installer).toContain('Call AddFolioleCliToUserPath');
    expect(installer).toMatch(/Function AddFolioleCliToUserPath[\s\S]*Push \$0[\s\S]*Pop \$0[\s\S]*FunctionEnd/u);
    expect(installer).toContain('ReadRegStr $0 HKCU "Environment" "Path"');
    expect(installer).toContain('StrCpy $1 "$INSTDIR\\bin"');
    expect(installer).toContain('WriteRegExpandStr HKCU "Environment" "Path" $0');
    expect(installer).toContain('SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment"');
    expect(installer).not.toContain('HKLM "Environment"');
    expect(installer).not.toMatch(/StrContains/iu);
  });

  it('removes only complete matching segments during uninstall', () => {
    expect(installer).toContain('Function un.RemoveFolioleCliFromUserPath');
    expect(installer).toContain('Call un.RemoveFolioleCliFromUserPath');
    expect(installer).toMatch(/Function un\.RemoveFolioleCliFromUserPath[\s\S]*Push \$5[\s\S]*Pop \$5[\s\S]*FunctionEnd/u);
    expect(installer).toContain('WriteRegExpandStr HKCU "Environment" "Path" $5');
    expect(installer).toContain('StrCmp $5 "" removeCliPathAppendValue');
    expect(installer).toContain('StrCmp $5 "" removeCliPathAppendFinalValue');
    expect(installer).not.toContain('StrCmp $5 "" 0 +2');
    expect(installer).not.toMatch(/EnVar::|EnvVarUpdate/iu);
  });
});
