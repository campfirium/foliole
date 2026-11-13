import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
const ruleId = 'localization/no-hardcoded-user-copy';

async function lintCopy(code, filePath = 'src/app/dialog-copy-example.ts') {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === ruleId);
}

describe('localization lint in the repository configuration', () => {
  it.each([
    [`requestAppConfirmation({ title: many ? 'Relearn selected topics?' : 'Relearn this topic?' })`, 2],
    [`requestAppConfirmation({ description: [t('warning'), 'This cannot be undone.'] })`, 1],
    [`requestAppTextInput({ inputLabel: label ?? 'Source website', confirmLabel: 'Save source' as const })`, 2],
    [`requestAppChoice({ choices: [{ value: 'backup', label: 'Backup' }] })`, 1],
    ['requestAppConfirmation({ title: `Remove ${name}?` })', 1]
  ])('rejects unlocalized copy in %s', async (code, count) => {
    const messages = await lintCopy(code);
    expect(messages).toHaveLength(count);
    expect(messages.every(({ severity }) => severity === 2)).toBe(true);
  });

  it('accepts translations, dynamic data, default labels and example URLs', async () => {
    expect(await lintCopy(`
      requestAppConfirmation({ title: many ? t('titles.many') : t('titles.one'), cancelLabel: null })
      requestAppTextInput({ inputLabel: t('source.label'), placeholder: 'https://example.com', title: fileName })
      requestAppChoice({ choices: [{ value: 'backup', label: t('backup.label') }] })
    `)).toEqual([]);
  });

  it('rejects new notice text and limits existing notice exceptions to their original file and count', async () => {
    const existing = "showAppRuntimeNotice('The item could not be restored.')";
    expect(await lintCopy(existing)).toHaveLength(1);
    expect(await lintCopy(
      [existing, existing, existing, "showAppRuntimeNotice('Another failure')"].join('\n'),
      'src/store/workspaceApplicationRestore.ts'
    )).toHaveLength(2);
    expect(await lintCopy("showAppRuntimeNotice(t('restore.failure'))")).toEqual([]);
  });

  it('allows literal fixture copy in test files', async () => {
    expect(await lintCopy(`requestAppConfirmation({ title: 'Test prompt' })`, 'src/app/example.test.ts')).toEqual([]);
  });
});
