/* global document, innerHeight, setTimeout */

import { runA5SecondarySearchAcceptance } from './windows-a5-secondary-search-acceptance.mjs';

export function runA5SecondaryAcceptance(config, acceptSearch) {
  const receipts = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
  };
  const firstVisible = (selector, root = document) => (
    Array.from(root.querySelectorAll(selector)).find(visible) || null
  );
  const closestButton = (selector, root = document) => {
    const icon = firstVisible(selector, root);
    return icon ? icon.closest('button') : null;
  };
  const waitFor = async (read, label, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = read();
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const click = async (element, label) => {
    if (!visible(element)) throw new Error(`Missing visible ${label}`);
    element.scrollIntoView({ block: 'center' });
    element.click();
    await sleep(150);
  };
  const record = (step, value = {}) => receipts.push({ step, ...value });
  const readingRoot = () => firstVisible('[data-reading-font-size]');
  const articleExit = () => closestButton('.fixed.top-0 svg.lucide-chevron-left');
  const directoryRows = () => Array.from(
    document.querySelectorAll('[data-testid^="companion-directory-node-"]')
  ).filter(visible);
  const rowId = (row) => row.getAttribute('data-testid');
  const rowTitle = (row) => {
    const title = row.querySelector('span.block.truncate');
    return title && title.textContent
      ? title.textContent.trim()
      : row.textContent ? row.textContent.trim() : '';
  };
  const directorySignature = () => directoryRows().map(rowId).join('|');
  const topBack = () => firstVisible('[data-testid="companion-top-bar-back"]');

  async function reachRootDirectory() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (firstVisible('[data-testid="companion-tab-browse"]')) break;
      const exit = articleExit()
        || closestButton('svg.lucide-x')
        || firstVisible('[data-testid="companion-top-bar-left-action"]')
        || topBack();
      if (!exit) throw new Error('Cannot return to the companion tab shell');
      await click(exit, 'surface exit');
    }
    await click(await waitFor(
      () => firstVisible('[data-testid="companion-tab-browse"]'), 'Browse tab'
    ), 'Browse tab');
    while (topBack()) await click(topBack(), 'directory parent');
    await waitFor(() => directoryRows().length > 0, 'root directory rows');
  }

  async function exitArticle() {
    await click(await waitFor(articleExit, 'article exit'), 'article exit');
    await waitFor(() => directoryRows().length > 0, 'directory after article exit');
  }

  async function findReadableLeaf(depth = 0, path = []) {
    const candidates = directoryRows().map((row) => ({ id: rowId(row), title: rowTitle(row) }));
    for (const candidate of candidates) {
      const row = firstVisible(`[data-testid="${candidate.id}"]`);
      const before = directorySignature();
      await click(row, `directory row ${candidate.id}`);
      await waitFor(
        () => articleExit() || directorySignature() !== before,
        `directory transition for ${candidate.id}`
      );
      if (articleExit()) {
        if (depth > 0 && readingRoot()) {
          return { leafId: candidate.id, leafTitle: candidate.title, path: [...path, candidate.title] };
        }
        await exitArticle();
        continue;
      }
      if (depth < 3) {
        const found = await findReadableLeaf(depth + 1, [...path, candidate.title]);
        if (found) return found;
      }
      const back = topBack();
      if (!back) throw new Error('Nested directory has no semantic parent action');
      await click(back, 'nested directory parent');
      await waitFor(() => directorySignature() === before, 'parent directory restoration');
    }
    return null;
  }

  const typography = () => {
    const root = readingRoot();
    if (!root) return null;
    return {
      contrast: root.getAttribute('data-reading-contrast'),
      fontFamily: root.getAttribute('data-reading-font-family'),
      fontSize: root.getAttribute('data-reading-font-size'),
      lineHeight: root.getAttribute('data-reading-line-height')
    };
  };

  async function acceptTypography(leaf) {
    const before = typography();
    const more = closestButton('svg.lucide-ellipsis-vertical');
    await click(more, 'reading More action');
    const actions = await waitFor(() => firstVisible('[role="dialog"]'), 'reading actions sheet');
    await click(closestButton('svg.lucide-sliders-horizontal', actions), 'Font action');
    const fontSheet = await waitFor(() => {
      const dialog = firstVisible('[role="dialog"]');
      return dialog && dialog.querySelectorAll('fieldset').length === 4 ? dialog : null;
    }, 'Font sheet');
    const keys = ['fontSize', 'lineHeight', 'fontFamily', 'contrast'];
    const fieldsets = Array.from(fontSheet.querySelectorAll('fieldset'));
    for (let index = 0; index < fieldsets.length; index += 1) {
      const oldValue = typography()[keys[index]];
      const options = Array.from(fieldsets[index].querySelectorAll('button'))
        .filter((button) => button.getAttribute('aria-pressed') === 'false');
      const option = options[options.length - 1];
      await click(option, `typography ${keys[index]}`);
      await waitFor(() => typography()[keys[index]] !== oldValue, `${keys[index]} update`);
    }
    const changed = typography();
    await click(firstVisible('[role="dialog"] button'), 'Font sheet close');
    await exitArticle();
    await click(await waitFor(
      () => firstVisible(`[data-testid="${leaf.leafId}"]`), 'accepted leaf row'
    ), 'accepted leaf row');
    await waitFor(readingRoot, 'reopened readable article');
    const hydrated = typography();
    if (JSON.stringify(changed) !== JSON.stringify(hydrated)) {
      throw new Error('Reading typography did not hydrate after reopening the Topic');
    }
    record('typography', { before, changed, hydrated, leafTitle: leaf.leafTitle });
  }

  async function returnToDirectoryRoot(leaf, rootIds) {
    await exitArticle();
    const parentHasLeaf = Boolean(firstVisible(`[data-testid="${leaf.leafId}"]`));
    let backCount = 0;
    while (topBack()) {
      await click(topBack(), 'breadcrumb parent');
      backCount += 1;
    }
    const observedRootIds = directoryRows().map(rowId);
    const rootIsLocal = !observedRootIds.includes(leaf.leafId)
      && rootIds.every((id) => observedRootIds.includes(id));
    if (!parentHasLeaf || backCount < 1 || !rootIsLocal) {
      throw new Error('Directory hierarchy did not restore through the semantic breadcrumb path');
    }
    record('hierarchy', { backCount, leafTitle: leaf.leafTitle, path: leaf.path, rootIsLocal });
  }

  async function acceptSettingsAndShortcut() {
    await click(firstVisible('[data-testid="companion-tab-settings"]'), 'Settings tab');
    const appearance = await waitFor(
      () => firstVisible('[data-testid="companion-settings-appearance"]'), 'Appearance setting'
    );
    await click(appearance, 'Appearance setting');
    const detail = await waitFor(
      () => firstVisible('[data-testid="companion-custom-css-settings"]'), 'Appearance detail'
    );
    const back = await waitFor(topBack, 'Settings detail back action');
    record('settings-detail', {
      backVisible: visible(back), detailVisible: visible(detail), scrollVisible: visible(
        firstVisible('[data-testid="companion-scroll-container"]')
      )
    });
    await click(back, 'Settings detail back action');
    await waitFor(() => firstVisible('[data-testid="companion-settings-appearance"]'), 'Settings list');
    const shortcut = firstVisible('[data-testid="companion-tab-shortcut"]');
    if (!shortcut) throw new Error('Shortcut tab is unavailable');
    await click(shortcut, 'shortcut tab');
    if (shortcut.getAttribute('aria-current') !== 'page') throw new Error('Shortcut tab is not active');
    record('shortcut-active', { active: true });
  }

  return (async () => {
    await waitFor(() => firstVisible('[data-testid="companion-scroll-container"]'), 'companion shell');
    await reachRootDirectory();
    const rootIds = directoryRows().map(rowId);
    const leaf = await findReadableLeaf();
    if (!leaf) throw new Error('A5 data has no nested readable Topic sample');
    await acceptTypography(leaf);
    await returnToDirectoryRoot(leaf, rootIds);
    await acceptSettingsAndShortcut();
    await acceptSearch(config, { click, firstVisible, record, waitFor, visible }, leaf.leafTitle);
    return { identity: config.identity, receipts, status: 'passed' };
  })();
}

export function buildA5SecondaryAcceptanceScript(config) {
  return `(${runA5SecondaryAcceptance.toString()})(${JSON.stringify(config)},${runA5SecondarySearchAcceptance.toString()})`;
}
