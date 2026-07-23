import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readFolioleWebBinding, readFolioleWebMarkdown, type FolioleWebField } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';

import type { FoliolePublishIndex, FoliolePublishTopic } from './foliolePublishModel.js';
import { writeFoliolePublishSite } from './foliolePublishSiteWriter.js';
import { readFoliolePublishTheme } from './foliolePublishTheme.js';

function readTopic(root: string, topic: FoliolePublishTopic) {
  const markdown = fs.readFileSync(path.join(root, topic.file), 'utf8');
  return { fields: readFolioleWebBinding(markdown)?.fields ?? [], markdown };
}

type PublishOverrides = Map<string, { content: string; fields: FolioleWebField[] }>;

function selectTopic(root: string, topic: FoliolePublishTopic, overrides: PublishOverrides) {
  const selected = overrides.get(topic.source_key);
  if (selected) return selected;
  const stored = readTopic(root, topic);
  return { content: stored.markdown, fields: stored.fields };
}

function writeStagedSite(root: string, temporary: string, index: FoliolePublishIndex, siteAddress: string, overrides: PublishOverrides) {
  const theme = readFoliolePublishTheme(root);
  const publicAddress = siteAddress || 'https://example.pages.dev';
  const selectedTopics = index.topics.map((topic) => ({ selected: selectTopic(root, topic, overrides), topic }));
  writeFoliolePublishSite({
    index,
    publicAddress,
    root: temporary,
    sources: selectedTopics.map(({ selected, topic }) => ({
      fields: selected.fields, markdown: readFolioleWebMarkdown(selected.content), topic
    })),
    theme
  });
}

export function stageFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string, overrides: PublishOverrides = new Map()) {
  const temporary = path.join(root, `.Site-${randomUUID()}`);
  fs.mkdirSync(path.join(temporary, 'topics'), { recursive: true });
  try {
    writeStagedSite(root, temporary, index, siteAddress, overrides);
  } catch (error) {
    fs.rmSync(temporary, { force: true, recursive: true });
    throw error;
  }
  return temporary;
}

export function activateFoliolePublishSite(root: string, staged: string, directory = 'Site') {
  const destination = path.join(root, directory);
  const backup = path.join(root, `.${directory}-backup-${randomUUID()}`);
  try {
    if (fs.existsSync(destination)) fs.renameSync(destination, backup);
    fs.renameSync(staged, destination);
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  }
  let settled = false;
  return {
    activePath: path.join(destination, 'index.html'),
    commit() { if (!settled) { settled = true; try { fs.rmSync(backup, { force: true, recursive: true }); } catch { return; } } },
    rollback() { if (!settled) { fs.rmSync(destination, { force: true, recursive: true }); if (fs.existsSync(backup)) fs.renameSync(backup, destination); settled = true; } }
  };
}

export function discardStagedFoliolePublishSite(staged: string) { fs.rmSync(staged, { force: true, recursive: true }); }

export function generateFoliolePublishSite(root: string, index: FoliolePublishIndex, siteAddress: string) {
  const staged = stageFoliolePublishSite(root, index, siteAddress);
  try { const activation = activateFoliolePublishSite(root, staged); activation.commit(); return activation.activePath; }
  finally { discardStagedFoliolePublishSite(staged); }
}
