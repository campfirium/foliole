import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, confirmStep, gradesStep, loadSource, openPreview, parameters, structureStep } from './harness/superMemoImport';

const oneDate = card.replace('<ID>2</ID>', '<ID>3</ID>').replace('<Title>Card</Title>', '<Title>Source only</Title>')
  .replace(/<RepHist>.*<\/RepHist>/, '');
const xml = `<SuperMemoCollection><Count>2</Count>${card}${oneDate.replace('<Interval>300</Interval>', '<Interval>200</Interval>')}</SuperMemoCollection>`;
const dueChart = /^(First review due dates by calendar week|首次复习到期分布，按日历周汇总)/;
const monthlyTitle = /^(Upcoming reviews by month|未来各月的到期分布)$/;
const weeklyTitle = /^(Upcoming|未来到期)$/;
const plannedSeries = /Adjusted|调整后/;
const alreadyDue = /^(Already due|已到期)$/;
const previousImport = /Previous import|历史导入批次/;

test('compares real first review dates and restores the selected proportion', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('Schedule'), xml);
  await expect(dialog.getByRole('button', { name: structureStep })).toHaveAttribute('aria-current', 'step');
  await dialog.getByRole('button', { name: parameters }).click();

  const chart = dialog.getByRole('group', { name: dueChart });
  const readout = dialog.getByRole('region', { name: weeklyTitle }).getByRole('status').filter({ hasText: plannedSeries });
  const sourceWeek = '2027-09-06 – 2027-09-12';
  const backlog = dialog.getByRole('region', { name: alreadyDue });
  await expect(dialog.getByRole('button', { name: /^(By week|按周|28 days|未来 28 天|0%|50%|100%)$/ })).toHaveCount(0);
  await expect(dialog.getByText(/Choose how to set the first review date after import|选择导入后首次复习日期的计算方式/)).toBeVisible();
  await chart.press('End');
  await expect(readout).toContainText(sourceWeek);
  await expect(dialog.getByRole('heading', { name: monthlyTitle })).toHaveCount(0);
  await expect(readout).toContainText(/SuperMemo 1.*(?:Adjusted|调整后) 1/);

  const slider = dialog.getByRole('slider');
  await expect(backlog).toContainText(/SuperMemo\s*0\s*→\s*(?:Adjusted|调整后)\s*0$/);
  for (let step = 0; step < 5; step += 1) await slider.press('PageUp');
  await expect(slider).toHaveValue('50');
  await chart.press('End');
  await expect(readout).toContainText(/SuperMemo 1.*(?:Adjusted|调整后) 0/);
  await slider.press('End');
  await expect(backlog).toContainText(/SuperMemo\s*0\s*→\s*(?:Adjusted|调整后)\s*1（\+1）/);
  await chart.press('End');
  await expect(readout).toContainText(/SuperMemo 1.*(?:Adjusted|调整后) 0/);
  await expect(dialog.getByText(/Using the original date for|沿用原日期/)).toHaveCount(0);

  const artifact = path.resolve('.tmp/artifacts/T762-13');
  await mkdir(artifact, { recursive: true });
  await dialog.screenshot({ path: path.join(artifact, 'schedule-preview.png') });

  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(slider).toHaveValue('100');
  await expect(backlog).toContainText(/SuperMemo\s*0\s*→\s*(?:Adjusted|调整后)\s*1（\+1）/);
  await dialog.press('Escape');
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const restored = await openPreview(desktopWindow);
  await restored.getByRole('button', { name: structureStep }).click();
  await expect(restored.getByRole('button', { name: structureStep })).toHaveAttribute('aria-current', 'step');
  await restored.getByRole('button', { name: parameters }).click();
  await expect(slider).toHaveValue('100');
  await expect(backlog).toContainText(/SuperMemo\s*0\s*→\s*(?:Adjusted|调整后)\s*1（\+1）/);

  await restored.getByRole('button', { name: confirmStep }).click();
  await restored.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(restored.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  await restored.press('Escape');
  const existing = await openPreview(desktopWindow);
  await expect(existing.getByRole('combobox', { name: previousImport })).toBeVisible();
  await existing.getByRole('button', { name: structureStep }).click();
  await existing.getByRole('button', { name: parameters }).click();
  await expect(existing.getByText(/batch’s saved proportion|批次已保存的比例/)).toBeVisible();
  await expect(slider).toHaveCount(0);
  await existing.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
  await existing.getByRole('combobox', { name: previousImport }).selectOption({ index: 1 });
  await expect(slider).toHaveValue('100');
  await slider.press('Home');
  await existing.getByRole('button', { name: /^(Apply first review dates|应用首次复习日期)$/ }).click();
  await expect(existing.getByText(/^(Updated 1|已更新 1 张)/)).toBeVisible();
});

async function expectScheduleFits(timeline: import('@playwright/test').Locator) {
  const result = await timeline.evaluate(element => {
    let pane = element.parentElement;
    while (pane && getComputedStyle(pane).overflowY !== 'auto') pane = pane.parentElement;
    const height = pane ? `${pane.scrollHeight}/${pane.clientHeight}` : 'missing pane';
    return {
      height,
      pageFits: pane !== null && pane.scrollHeight <= pane.clientHeight + 1,
      pageScrollbar: pane && getComputedStyle(pane).scrollbarWidth,
      chartScrollbar: getComputedStyle(element).scrollbarWidth
    };
  });
  expect(result, `Pane scroll height/client height: ${result.height}`).toMatchObject({
    pageFits: true, pageScrollbar: 'none', chartScrollbar: 'none'
  });
}

async function expectPartialMonthHidden(timeline: import('@playwright/test').Locator) {
  const month = timeline.getByText('2月', { exact: true }).nth(1);
  await month.evaluate(label => {
    const viewport = label.closest('[role="region"]')!;
    const bounds = label.getBoundingClientRect();
    viewport.scrollLeft += bounds.left + bounds.width / 2 - viewport.getBoundingClientRect().right;
  });
  await expect(month).toBeHidden();
  await timeline.evaluate(element => { element.scrollLeft += 40; });
  await expect(month).toBeVisible();
  await timeline.evaluate(element => { element.scrollLeft = 0; });
}

test('keeps a large backlog separate and scrolls to the final week', async ({ desktopWindow, desktopApp }, testInfo) => {
  const makeSourceOnly = (id: number, interval: number) => oneDate
    .replace('<ID>3</ID>', `<ID>${id}</ID>`)
    .replace('<Interval>300</Interval>', `<Interval>${interval}</Interval>`);
  const backlog = Array.from({ length: 1870 }, (_, i) =>
    makeSourceOnly(3 + i, 1 + Math.floor(i / 10)).replace('10.11.2026', i % 2 ? '01.01.2025' : '01.01.2027')
  );
  const scheduled = [35, 54, 102, 200, 340, 450, 540, 930, 1240, 1600, 1964];
  const tail = scheduled.map((interval, i) => makeSourceOnly(1873 + i, interval));
  const sample = `<SuperMemoCollection><Count>${1 + backlog.length + tail.length}</Count>${card}${backlog.join('')}${tail.join('')}</SuperMemoCollection>`;
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'zh-Hans'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('Backlog-and-first-reviews'), sample);
  await dialog.getByRole('button', { name: parameters }).click();

  const chart = dialog.getByRole('group', { name: dueChart });
  await expect(dialog.getByRole('heading', { name: /^(First review schedule|首次复习安排)$/ })).toBeVisible();
  await expect(dialog.getByText(/原日期与 Foliole 根据复习历史、使用 FSRS 重算日期的加权结果/)).toBeVisible();
  const due = dialog.getByRole('region', { name: alreadyDue });
  const timeline = dialog.getByRole('region', { name: weeklyTitle })
    .getByRole('region', { name: /Scrollable due date timeline|可横向滚动的到期时间轴/ });
  const timelineState = () => timeline.evaluate(element => ({
    left: element.scrollLeft, canScroll: element.scrollWidth > element.clientWidth
  }));
  const readout = dialog.getByRole('region', { name: weeklyTitle }).getByRole('status').filter({ hasText: plannedSeries });
  await expect(dialog.getByText(/Topic：导入时继承可转换的阅读进度与调度状态，之后由 Foliole 接续管理/)).toBeVisible();
  await expect(timeline.getByText('2027年1月', { exact: true })).toBeVisible();
  await expect(timeline.getByText('2月', { exact: true }).first()).toBeVisible();
  await expectScheduleFits(timeline);
  await expectPartialMonthHidden(timeline);
  await expect(readout).toHaveCount(0);
  await chart.hover({ position: { x: 15, y: 20 } });
  await expect(readout).toContainText(/SuperMemo 0.*(?:Adjusted|调整后) 0/);
  await due.hover();
  await expect(readout).toHaveCount(0);
  await chart.press('Home');
  expect(await timelineState()).toEqual({ left: 0, canScroll: true });
  await expect(due).toContainText(/SuperMemo\s*935\s*→\s*(?:Adjusted|调整后)\s*935/);
  await chart.press('ArrowRight');
  await expect(readout).toContainText(/2026-12-14 – 2026-12-20.*SuperMemo 1.*(?:Adjusted|调整后) 1/);
  await dialog.getByRole('slider').press('End');
  await expect(due).toContainText(/SuperMemo\s*935\s*→\s*(?:Adjusted|调整后)\s*936（\+1）/);
  await chart.press('End');
  expect((await timelineState()).left).toBeGreaterThan(0);
  await expect(readout).toContainText(/SuperMemo 1.*(?:Adjusted|调整后) 1/);
  await chart.press('Home');
  expect((await timelineState()).left).toBe(0);
  await dialog.getByRole('slider').focus();

  const artifact = path.resolve('.tmp/artifacts/T762-13');
  await mkdir(artifact, { recursive: true });
  await dialog.screenshot({ path: path.join(artifact, 'backlog-and-upcoming-preview.png') });
});
