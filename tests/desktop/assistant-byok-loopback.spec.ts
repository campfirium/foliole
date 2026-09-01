import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import {
  closeSettings,
  configureByok,
  fillModelDraft,
  modelRadio,
  openModelSettings,
  removeByok,
  restoreAndConfigureByok
} from './assistant-byok-loopback-ui.support';
import {
  createByokLoopbackHarness,
  prepareAide,
  type LoopbackRequest
} from './assistant-byok-loopback.support';
import { openAssistantPanel } from './assistant-panel-home-detail.support';
import { expect, test } from './harness/fixtures';

const API_KEY = 'sk-foliole-t141-loopback-secret';
const MODEL = 'foliole-loopback-model';
const EVIDENCE_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const SCREENSHOT = path.join(EVIDENCE_DIR, 't168-aide-byok-tool-loop-hidden.png');
const MODELS_SCREENSHOT = path.join(EVIDENCE_DIR, 'aide-models-settings-hidden.png');
const RESULT = path.join(EVIDENCE_DIR, 't168-aide-byok-tool-loop-result.json');
const CREATED_TOPIC = 'BYOK Agent Control Topic';
const LONG_CREATED_TOPIC = 'BYOK Long Tool Chain Topic';

test('uses a real loopback Chat Completions SSE provider without weakening Codex', async ({
  browserName
}, testInfo) => {
  void browserName;
  // SKIP: macOS safeStorage acceptance | 2026-08-31 | revive: run this acceptance on a macOS host
  test.skip(process.platform !== 'darwin', 'macOS-only BYOK journey');
  const harness = await createByokLoopbackHarness();
  try {
    harness.setMode('auth');
    await runFailedDraftJourney(harness);
    harness.setMode('success');
    await runInitialJourney(harness, testInfo);
    await runRelaunchJourney(harness, testInfo);
    await writeEvidence(harness.requests);
  } finally {
    await harness.close();
  }
});

type Harness = Awaited<ReturnType<typeof createByokLoopbackHarness>>;

async function runFailedDraftJourney(harness: Harness) {
  const session = await harness.launch();
  try {
    await prepareAide(session.page);
    const section = await openModelSettings(session.page);
    await fillModelDraft(section, modelInput(harness.endpoint));
    await expect(section.getByRole('button', { name: /^(Remove model|删除模型)$/ }).last()).toBeVisible();
    expect(harness.requests).toHaveLength(0);
    await closeSettings(session.page);

    const restored = await openModelSettings(session.page);
    await expect(restored.getByLabel(/^(Model|模型)$/).first()).toHaveValue(MODEL);
    await expect(restored.getByLabel(/^(Model|模型)$/)).toHaveCount(1);
    await expect(restored.getByLabel(/^(API endpoint|API 地址)$/).first()).toHaveValue(harness.endpoint);
    await expect(restored.getByPlaceholder('••••••••')).toHaveValue('');
    await expect(restored).not.toContainText(/Test again before using|请重新测试后再让/);
    await expect(modelRadio(restored, MODEL)).toBeDisabled();
    expect(harness.requests).toHaveLength(0);
  } finally {
    await session.electronApp.close();
  }
}

async function runInitialJourney(harness: Harness, testInfo: TestInfo) {
  const session = await harness.launch();
  try {
    await prepareAide(session.page);
    await restoreAndConfigureByok(session.page, { endpoint: harness.endpoint, model: MODEL });
    await captureModels(session.page, testInfo);
    await closeSettings(session.page);
    await openAssistantPanel(session.page);
    await sendAndExpect(session.page, 'Loopback first', 'Loopback reply 1');
    await expect(session.page.getByText(CREATED_TOPIC, { exact: true })).toBeVisible();
    const firstTurn = requestsForPrompt(harness.requests, 'Loopback first');
    expect(firstTurn).toHaveLength(2);
    assertBaseRequest(firstTurn[0]);
    assertToolResultReplay(firstTurn[1]);

    await sendAndExpect(session.page, 'Long loopback chain', 'Long loopback reply');
    await expect(session.page.getByText(LONG_CREATED_TOPIC, { exact: true })).toBeVisible();
    const longTurn = requestsForPrompt(harness.requests, 'Long loopback chain');
    expect(longTurn).toHaveLength(11);
    expect(longTurn.at(-1)?.body.messages?.filter((message) => message.role === 'tool')).toHaveLength(28);

    await attachImage(session.page);
    await sendAndExpect(session.page, 'Loopback image', 'Loopback reply 2');
    assertImageAndHistoryRequest(requestsForPrompt(harness.requests, 'Loopback image')[0]);
    await captureAide(session.page, testInfo);
  } finally {
    await session.electronApp.close();
  }
}

async function runRelaunchJourney(harness: Harness, testInfo: TestInfo) {
  const session = await harness.launch();
  try {
    await prepareAide(session.page);
    await expect(session.page.getByText(CREATED_TOPIC, { exact: true })).toBeVisible();
    await openAssistantPanel(session.page);
    await session.page.getByRole('button', { name: /Loopback first/ }).click();
    await expect(session.page.getByText('Loopback reply 2')).toBeVisible();
    await sendAndExpect(session.page, 'After restart', 'Loopback reply 3');
    assertRestartHistoryRequest(requestsForPrompt(harness.requests, 'After restart')[0]);

    harness.setMode('auth');
    const codexTurnsBeforeFailure = await harness.codexTurnCount();
    await sendExpectingFailure(session.page, 'Never fallback to Codex');
    expect(await harness.codexTurnCount()).toBe(codexTurnsBeforeFailure);
    expect(JSON.stringify(await session.page.locator('body').innerText())).not.toContain('sensitive-loopback-detail');

    harness.setMode('success');
    await removeByok(session.page);
    await closeSettings(session.page);
    await session.page.getByRole('button', { name: /^(New|新建)$/ }).click();
    await sendAndExpect(session.page, 'Codex after removal', 'Codex regression reply');
    expect(await harness.codexTurnCount()).toBe(1);

    await configureByok(session.page, modelInput(harness.endpoint));
    await closeSettings(session.page);
    await session.page.getByRole('button', { name: /^(New|新建)$/ }).click();
    await sendAndExpect(session.page, 'Recovered after reconfigure', 'Loopback reply 4');
    await verifyCodexRegression(session.page, harness);
    await captureAide(session.page, testInfo);
  } finally {
    await session.electronApp.close();
  }
}

function modelInput(endpoint: string) {
  return { apiKey: API_KEY, endpoint, model: MODEL };
}

async function sendAndExpect(page: Page, prompt: string, answer: string) {
  await page.getByLabel('Foliole Aide message').fill(prompt);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const response = page.locator('[data-message-role="assistant"]').last();
  if (answer.startsWith('Loopback')) await expect(response).toContainText('Loopback');
  await expect(response).toContainText(answer);
}

async function sendExpectingFailure(page: Page, prompt: string) {
  await page.getByLabel('Foliole Aide message').fill(prompt);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(/could not reply/i)).toBeVisible();
  await expect(page.getByLabel('Foliole Aide message')).toHaveValue(prompt);
}

async function attachImage(page: Page) {
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimeType: 'image/png', name: 'loopback.png'
  });
}

function assertBaseRequest(request: LoopbackRequest | undefined) {
  expect(request?.authorization).toBe(`Bearer ${API_KEY}`);
  expect(request?.body).toMatchObject({ model: MODEL, stream: true });
  expect(JSON.stringify(request?.body.tools)).toContain('create_material');
  expect(JSON.stringify(request?.body.tools)).toContain('list_folder');
}

function assertToolResultReplay(request: LoopbackRequest | undefined) {
  const text = JSON.stringify(request?.body.messages);
  expect(text).toContain('read-root');
  expect(text).toContain('create-topic');
  expect(text).toContain(CREATED_TOPIC);
}

function requestsForPrompt(requests: LoopbackRequest[], prompt: string) {
  return requests.filter((request) => JSON.stringify(request.body.messages).includes(prompt));
}

function assertImageAndHistoryRequest(request: LoopbackRequest | undefined) {
  const text = JSON.stringify(request?.body.messages);
  expect(text).toContain('Loopback first');
  expect(text).toContain('Loopback reply 1');
  expect(text).toContain('data:image/png;base64,');
}

function assertRestartHistoryRequest(request: LoopbackRequest | undefined) {
  const text = JSON.stringify(request?.body.messages);
  expect(text).toContain('Loopback image');
  expect(text).toContain('Loopback reply 2');
  expect(text).not.toContain('data:image/png;base64,');
}

async function verifyCodexRegression(page: Page, harness: Harness) {
  const section = await openModelSettings(page);
  await section.getByRole('radio', { name: /^(Use ChatGPT plan|使用 ChatGPT 套餐)$/ }).click();
  await closeSettings(page);
  await page.getByRole('button', { name: /^(New|新建)$/ }).click();
  await expect(page.getByLabel(/^(Model and performance settings|模型与性能设置)$/)).toBeVisible();
  await sendAndExpect(page, 'Codex regression', 'Codex regression reply');
  expect(await harness.codexTurnCount()).toBe(2);
}

async function captureAide(page: Page, testInfo: TestInfo) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.locator('[data-panel-scale-id="right-panel:assistant"]').screenshot({ path: SCREENSHOT });
  await testInfo.attach('t168-aide-byok-tool-loop', { contentType: 'image/png', path: SCREENSHOT });
}

async function captureModels(page: Page, testInfo: TestInfo) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const settings = page.getByRole('dialog').filter({
    has: page.getByLabel(/^(Settings categories|设置分类)$/)
  });
  await settings.screenshot({ path: MODELS_SCREENSHOT });
  await testInfo.attach('aide-models-settings', {
    contentType: 'image/png', path: MODELS_SCREENSHOT
  });
}

async function writeEvidence(requests: LoopbackRequest[]) {
  const summary = requests.map((request) => ({
    authenticated: request.authorization === `Bearer ${API_KEY}`,
    messageCount: request.body.messages?.length ?? 0,
    model: request.body.model,
    stream: request.body.stream,
    tools: request.body.tools?.length ?? 0
  }));
  await writeFile(RESULT, `${JSON.stringify({ requests: summary, status: 'passed' }, null, 2)}\n`);
}
