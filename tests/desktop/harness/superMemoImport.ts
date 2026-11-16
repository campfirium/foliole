import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import type { SuperMemoXmlDraftElement } from '../../../lib/core/import/superMemoXmlDraft.js';
import type { NativeSuperMemoPreviewRow } from '../../../lib/platform/nativeSuperMemoImportContract.js';

import { openSettingsDialog } from './settings';

const title = /^(SuperMemo import preview|SuperMemo 导入预览)$/;
const open = /^(Start migration|开始迁移)$/;

export const card = `<SuperMemoElement><ID>2</ID><Type>Item</Type><Title>Card</Title>
  <Content><Question>Question</Question><Answer>Answer</Answer></Content>
  <LearningData><LastRepetition>10.11.2026</LastRepetition><Interval>300</Interval>
  <RepHist>ElNo=2 Rep=2 Laps=0 Date=10.11.2026 Hour=3.5 Int=1 Grade=4</RepHist></LearningData>
</SuperMemoElement>`;

export async function openPreview(page: Page) {
  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: /^(General|通用)$/ }).click();
  await settings.getByRole('button', { name: open }).click();
  return page.getByRole('dialog', { name: title });
}

export const parameters = /^(Next: Conversion settings|下一步 · 转换参数)$/;

export async function loadSource(app: ElectronApplication, dialog: Locator, directory: string, xml?: string) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, path.basename(directory) + '.xml');
  if (xml !== undefined) await writeFile(file, xml);
  await app.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  }, file);
  await dialog.getByRole('button', { name: /^(Load XML|Load another XML|载入 XML|重新载入)$/ }).click();
}

export async function continueXml(page: Page) {
  const notice = page.getByRole('dialog', { name: /^(Collection files not found|未找到配套资料)$/ });
  await notice.getByRole('button', { name: /^(Continue with XML|继续使用 XML)$/ }).click();
}

export async function writeCollection(directory: string, includeTopic: boolean) {
  const info = path.join(directory, 'info');
  await mkdir(info, { recursive: true });
  const tree = Buffer.alloc(2 * 37);
  tree[0] = includeTopic ? 0 : 1;
  const elements = Buffer.alloc(2 * 118);
  elements[1] = 1;
  elements[118 + 1] = 1;
  if (includeTopic) elements.writeUInt32LE(1, 118 + 93);
  elements.writeUInt16LE(300, 118 + 16);
  elements.writeInt16LE(30, 118 + 18);
  const repetitions = Buffer.alloc(8);
  repetitions.writeInt32LE(330, 4);
  const priorities = Buffer.from([2, 0, 0, 0]);
  const history = Buffer.alloc(39);
  history.writeInt32LE(2);
  history.writeUInt16LE(2, 4);
  history.writeDoubleLE((Date.UTC(2026, 10, 10) - Date.UTC(1899, 11, 30)) / 86_400_000, 10);
  history[24] = 4;
  await Promise.all(Object.entries({
    'contents.dat': tree, 'ElementInfo.dat': elements, 'repetitions.dat': repetitions,
    'priority.sub': priorities, 'RepetitionHistory.dat': history
  }).map(([name, bytes]) => writeFile(path.join(info, name), bytes)));
  return elements;
}

export function seedHistoricalSuperMemoBatch(app: ElectronApplication, elements: SuperMemoXmlDraftElement[],
  overrides: Record<number, Partial<Pick<NativeSuperMemoPreviewRow, 'parentId' | 'outcome' | 'issue' | 'sourceDue' | 'recalculatedDue'>>>,
  oldText?: Record<number, Partial<Pick<SuperMemoXmlDraftElement, 'bodyOrQuestionHtml' | 'answerHtml'>>>) {
  return app.evaluate(async ({ app }, input) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const { openDatabaseConnection, runWithDatabaseConnectionOwner } = require(`${app.getAppPath()}/database/connection.js`);
    const { handleSuperMemoImportCommand } = require(`${app.getAppPath()}/ipc/superMemoImportCommands.js`);
    const { runSuperMemoImport } = require(`${app.getAppPath()}/import/runSuperMemoImport.js`);
    const { loadReviewSchedulerSettings } = require(`${app.getAppPath()}/reviewSchedulerSettings.js`);
    const canonicalElements = input.elements.map(({ id, parentId, children, sourceType, title, ordinal, bodyOrQuestionHtml,
      answerHtml, skippedAudioComponents, learning }) => ({
      id, parentId, children, sourceType, title, ordinal, bodyOrQuestionHtml, answerHtml, skippedAudioComponents, learning
    }));
    const preview = await handleSuperMemoImportCommand('preview_supermemo_import', { elements: canonicalElements });
    for (const row of preview.rows) Object.assign(row, input.overrides[row.id]);
    return runWithDatabaseConnectionOwner(async () => {
      const historical = canonicalElements.map(element => ({ ...element, ...input.oldText?.[element.id] }));
      const result = await runSuperMemoImport({ elements: historical, preview, percent: 0,
        offset: '+00:00', gradeMap: [1, 1, 1, 2, 3, 4], scheduler: loadReviewSchedulerSettings(), expectedImages: new Map(),
        sourceFormat: { placement: 'topic-info', template: '' } });
      if (input.oldText) {
        // Model older rendering rules for the same original export.
        const { superMemoBatchKey } = require(`${app.getAppPath()}/import/superMemoBatchKey.js`);
        openDatabaseConnection().sqlite.prepare('UPDATE workspace_meta SET key = ? WHERE key = ?')
          .run(superMemoBatchKey(canonicalElements).key, superMemoBatchKey(historical).key);
      }
      return result;
    });
  }, { elements, overrides, oldText });
}
