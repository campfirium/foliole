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
    await closeSettings(session.page);
    await openAssistantPanel(session.page);
    await selectProvider(session.page, 'openai-compatible');
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
    await expect(session.page.getByLabel('Assistant provider')).toHaveValue('openai-compatible');
    await expect(session.page.getByText(/Your model/).first()).toBeVisible();
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
    const requestCount = harness.requests.length;
    await sendExpectingFailure(session.page, 'Unavailable while removed');
    expect(harness.requests).toHaveLength(requestCount);
    await expect(session.page.getByText('Loopback reply 3')).toBeVisible();

    await configureByok(session.page, harness.endpoint);
    await closeSettings(session.page);
    await sendAndExpect(session.page, 'Recovered after reconfigure', `Loopback reply ${requestCount + 1}`);
    await verifyCodexRegression(session.page, harness);
    await captureAide(session.page, testInfo);
  } finally {
    await session.electronApp.close();
  }
}

async function configureByok(page: Page, endpoint: string) {
  const settings = await openSettingsCategory(page, 'General');
  const section = settings.getByLabel(/^(Your model settings|你的模型设置)$/);
  await section.getByLabel(/^(Model API endpoint|模型 API 端点)$/).fill(endpoint);
  await section.getByLabel(/^(Model name|模型名称)$/).fill(MODEL);
  await section.getByLabel(/^(Model API key|模型 API key)$/).fill(API_KEY);
  await section.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(section).toContainText(/Ready to use|已可在 Foliole Aide 中使用/);
}

async function removeByok(page: Page) {
  const settings = await openSettingsCategory(page, 'General');
  const section = settings.getByLabel(/^(Your model settings|你的模型设置)$/);
  await section.getByRole('button', { name: /^(Remove|移除)$/ }).click();
  await expect(section.getByRole('button', { name: /^(Remove|移除)$/ })).toHaveCount(0);
}

async function closeSettings(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function selectProvider(page: Page, provider: 'codex-app-server' | 'openai-compatible') {
  await page.getByLabel('Assistant provider').selectOption(provider);
  await expect(page.getByLabel('Assistant provider')).toHaveValue(provider);
}

async function sendAndExpect(page: Page, prompt: string, answer: string) {
  await page.getByLabel('Foliole Aide message').fill(prompt);
  await page.getByRole('button', { name: 'Send' }).click();
  if (answer.startsWith('Loopback')) await expect(page.getByText('Loopback')).toBeVisible();
  await expect(page.getByText(answer)).toBeVisible();
}

async function sendExpectingFailure(page: Page, prompt: string) {
  await page.getByLabel('Foliole Aide message').fill(prompt);
  await page.getByRole('button', { name: 'Send' }).click();
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
  await page.getByRole('button', { name: /^(New|新建)$/ }).click();
  await selectProvider(page, 'codex-app-server');
  await expect(page.getByLabel(/^(Assistant model|助手模型)$/)).toBeVisible();
  await sendAndExpect(page, 'Codex regression', 'Codex regression reply');
  expect(await harness.codexTurnCount()).toBe(1);
}

async function captureAide(page: Page, testInfo: TestInfo) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.locator('[data-panel-scale-id="right-panel:assistant"]').screenshot({ path: SCREENSHOT });
  await testInfo.attach('t141-aide-byok-loopback', { contentType: 'image/png', path: SCREENSHOT });
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
