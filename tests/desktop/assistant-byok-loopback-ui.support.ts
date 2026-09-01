import type { Locator, Page } from '@playwright/test';

import { expect } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

export async function configureByok(
  page: Page,
  input: { apiKey: string; endpoint: string; model: string }
) {
  const section = await openModelSettings(page);
  await expect(section).toContainText(/Connected|已连接/);
  await fillModelDraft(section, input);
  await section.getByRole('button', { name: /^(Test|测试)$/ }).last().click();
  await expect(section).toContainText(/Connection ready|连接正常/);
  await modelRadio(section, input.model).click();
  await expect(modelRadio(section, input.model)).toBeChecked();
}

export async function restoreAndConfigureByok(
  page: Page,
  input: { endpoint: string; model: string }
) {
  const section = await openModelSettings(page);
  await expect(section.getByLabel(/^(Model|模型)$/).first()).toHaveValue(input.model);
  await expect(section.getByLabel(/^(API endpoint|API 地址)$/).first()).toHaveValue(input.endpoint);
  await expect(section.getByPlaceholder('••••••••')).toHaveValue('');
  await expect(modelRadio(section, input.model)).toBeDisabled();
  await section.getByRole('button', { name: /^(Test|测试)$/ }).first().click();
  await expect(section).toContainText(/Connection ready|连接正常/);
  await modelRadio(section, input.model).click();
  await expect(modelRadio(section, input.model)).toBeChecked();
}

export async function removeByok(page: Page, model: string) {
  const section = await openModelSettings(page);
  await section.getByRole('radio', { name: /^(Use ChatGPT plan|使用 ChatGPT 套餐)$/ }).click();
  await section.getByRole('button', { name: /^(Remove model|删除模型)$/ }).click();
  await expect(section.getByLabel(/^(Model|模型)$/).first()).not.toHaveValue(model);
  await expect(section.getByLabel(/^(Model|模型)$/)).toHaveCount(1);
}

export async function openModelSettings(page: Page) {
  const settings = await openSettingsCategory(page, 'Models');
  return settings.getByRole('region', { name: /^(Aide model settings|Aide 模型设置)$/ });
}

export async function fillModelDraft(
  section: Locator,
  input: { apiKey: string; endpoint: string; model: string }
) {
  await section.getByLabel(/^(API endpoint|API 地址)$/).last().fill(input.endpoint);
  await section.getByLabel(/^(Model|模型)$/).last().fill(input.model);
  await section.getByLabel(/^(API key|API 密钥)$/).last().fill(input.apiKey);
}

export function modelRadio(section: Locator, model: string) {
  return section.getByRole('radio', { name: new RegExp(`^(Use|使用) ${model}$`) });
}

export async function closeSettings(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}
