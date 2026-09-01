import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import {
  createByokLoopbackHarness,
  prepareAide,
  type LoopbackRequest
} from './assistant-byok-loopback.support';
import { openAssistantPanel } from './assistant-panel-home-detail.support';
import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

const API_KEY = 'sk-foliole-t141-loopback-secret';
const MODEL = 'foliole-loopback-model';
const EVIDENCE_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const SCREENSHOT = path.join(EVIDENCE_DIR, 't141-aide-byok-loopback-hidden.png');
const MODELS_SCREENSHOT = path.join(EVIDENCE_DIR, 'aide-models-settings-hidden.png');
const RESULT = path.join(EVIDENCE_DIR, 't141-aide-byok-loopback-result.json');

test('uses a real loopback Chat Completions SSE provider without weakening Codex', async ({
  browserName
}, testInfo) => {
  void browserName;
  // SKIP: macOS safeStorage acceptance | 2026-08-31 | revive: run this acceptance on a macOS host
  test.skip(process.platform !== 'darwin', 'macOS-only BYOK journey');
  const harness = await createByokLoopbackHarness();
  try {
    await runInitialJourney(harness, testInfo);
    await runRelaunchJourney(harness, testInfo);
    await writeEvidence(harness.requests);
  } finally {
    await harness.close();
  }
});

type Harness = Awaited<ReturnType<typeof createByokLoopbackHarness>>;

async function runInitialJourney(harness: Harness, testInfo: TestInfo) {
  const session = await harness.launch();
  try {
    await prepareAide(session.page);
    await configureByok(session.page, harness.endpoint);
    await captureModels(session.page, testInfo);
    await closeSettings(session.page);
    await openAssistantPanel(session.page);
    await sendAndExpect(session.page, 'Loopback first', 'Loopback reply 1');
    await expect.poll(() => harness.requests.length).toBe(1);
    assertBaseRequest(harness.requests[0]);

    await attachImage(session.page);
    await sendAndExpect(session.page, 'Loopback image', 'Loopback reply 2');
    await expect.poll(() => harness.requests.length).toBe(2);
    assertImageAndHistoryRequest(harness.requests[1]);
    await captureAide(session.page, testInfo);
  } finally {
    await session.electronApp.close();
  }
}

async function runRelaunchJourney(harness: Harness, testInfo: TestInfo) {
  const session = await harness.launch();
  try {
    await prepareAide(session.page);
    await openAssistantPanel(session.page);
    await session.page.getByRole('button', { name: /Loopback first/ }).click();
    await expect(session.page.getByText('Loopback reply 2')).toBeVisible();
    await sendAndExpect(session.page, 'After restart', 'Loopback reply 3');
    assertRestartHistoryRequest(harness.requests[2]);

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

    await configureByok(session.page, harness.endpoint);
    await closeSettings(session.page);
    await session.page.getByRole('button', { name: /^(New|新建)$/ }).click();
    const requestCount = harness.requests.length;
    await sendAndExpect(session.page, 'Recovered after reconfigure', `Loopback reply ${requestCount + 1}`);
    await verifyCodexRegression(session.page, harness);
    await captureAide(session.page, testInfo);
  } finally {
    await session.electronApp.close();
  }
}

async function configureByok(page: Page, endpoint: string) {
  const settings = await openSettingsCategory(page, 'Models');
  const section = settings.getByRole('region', { name: /^(Aide model settings|Aide 模型设置)$/ });
  await section.getByRole('button', { name: /^(Add model|添加模型)$/ }).click();
  await section.getByLabel(/^(API endpoint|API 地址)$/).fill(endpoint);
  await section.getByLabel(/^(Model|模型)$/).fill(MODEL);
  await section.getByLabel(/^(API key|API 密钥)$/).fill(API_KEY);
  await section.getByRole('button', { name: /^(Test|测试)$/ }).last().click();
  await expect(section).toContainText(/Connection ready|连接正常/);
  await section.getByRole('switch', { name: new RegExp(`^(Use|使用) ${MODEL}$`) }).click();
  await expect(section.getByRole('switch', { name: new RegExp(`^(Use|使用) ${MODEL}$`) })).toBeChecked();
}

async function removeByok(page: Page) {
  const settings = await openSettingsCategory(page, 'Models');
  const section = settings.getByRole('region', { name: /^(Aide model settings|Aide 模型设置)$/ });
  await section.getByRole('switch', { name: /^(Use|使用) Codex$/ }).click();
  await section.getByRole('button', { name: /^(Remove model|删除模型)$/ }).click();
  await expect(section.getByLabel(/^(Model|模型)$/)).toHaveCount(0);
}

async function closeSettings(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
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
  const text = JSON.stringify(request?.body.messages);
  expect(text).not.toMatch(/Agent Control|available Foliole actions/iu);
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
  const settings = await openSettingsCategory(page, 'Models');
  const section = settings.getByRole('region', { name: /^(Aide model settings|Aide 模型设置)$/ });
  await section.getByRole('switch', { name: /^(Use|使用) Codex$/ }).click();
  await closeSettings(page);
  await page.getByRole('button', { name: /^(New|新建)$/ }).click();
  await expect(page.getByLabel(/^(Model and performance settings|模型与性能设置)$/)).toBeVisible();
  await sendAndExpect(page, 'Codex regression', 'Codex regression reply');
  expect(await harness.codexTurnCount()).toBe(2);
}

async function captureAide(page: Page, testInfo: TestInfo) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.locator('[data-panel-scale-id="right-panel:assistant"]').screenshot({ path: SCREENSHOT });
  await testInfo.attach('t141-aide-byok-loopback', { contentType: 'image/png', path: SCREENSHOT });
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
    stream: request.body.stream
  }));
  await writeFile(RESULT, `${JSON.stringify({ requests: summary, status: 'passed' }, null, 2)}\n`);
}
