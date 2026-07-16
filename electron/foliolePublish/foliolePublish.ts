import fs from 'node:fs';
import path from 'node:path';

import { shell } from 'electron';

import type { NativeFoliolePublishConnectInput, NativeFoliolePublishTopicArgs } from '../../lib/platform/nativeFoliolePublishContract.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { deployCloudflarePages, ensureCloudflarePagesProject, normalizeCloudflareProjectName } from './cloudflarePagesClient.js';
import { readPublishIndex, upsertPublishedCard, writeFileAtomic, writePublishIndex } from './foliolePublishModel.js';
import { disconnectFoliolePublishSettings, loadFoliolePublishSettings, loadFoliolePublishToken, loadStoredFoliolePublishSettings, saveFoliolePublishConnection } from './foliolePublishSettings.js';
import { generateFoliolePublishSite } from './foliolePublishSite.js';

function root() { return path.join(loadLibraryPathSettingsSync().library_home, 'Publish'); }

function assertPublishableContent(content: string) {
  if (/foliole-attachment:\/\//u.test(content) || /!\[[^\]]*\]\((?!https?:\/\/)[^)]+\)/u.test(content)) {
    throw new Error('This Topic contains a local image. Local attachments are not supported by Foliole Publish yet.');
  }
}

async function deploySite(settings: { account_id: string; project_name: string }, token: string) {
  return deployCloudflarePages({ accountId: settings.account_id, projectName: settings.project_name, siteRoot: path.join(root(), 'Site'), token });
}

export async function connectFoliolePublishSettings(input: NativeFoliolePublishConnectInput) {
  const projectName = normalizeCloudflareProjectName(input.project_name);
  const token = input.api_token.trim() || loadFoliolePublishToken();
  if (!token) throw new Error('Enter a Cloudflare API Token.');
  const project = await ensureCloudflarePagesProject({ accountId: input.account_id.trim(), projectName, token });
  const pagesUrl = project.subdomain ? `https://${project.subdomain}` : `https://${projectName}.pages.dev`;
  fs.mkdirSync(root(), { recursive: true });
  generateFoliolePublishSite(root(), readPublishIndex(root()), input.site_address || pagesUrl);
  await deployCloudflarePages({ accountId: input.account_id.trim(), projectName, siteRoot: path.join(root(), 'Site'), token });
  return saveFoliolePublishConnection({ ...input, api_token: token, project_name: projectName }, pagesUrl);
}

export async function previewFoliolePublish() {
  fs.mkdirSync(root(), { recursive: true });
  const settings = loadFoliolePublishSettings();
  const localPath = generateFoliolePublishSite(root(), readPublishIndex(root()), settings.site_address);
  const error = await shell.openPath(localPath);
  if (error) throw new Error(error);
  return { local_path: localPath, url: null };
}

export async function publishTopicToFoliole(args: NativeFoliolePublishTopicArgs) {
  assertPublishableContent(args.content);
  const settings = loadStoredFoliolePublishSettings();
  const token = loadFoliolePublishToken();
  if (!settings || !token) throw new Error('Deploy Foliole Publish from Settings first.');
  const current = readPublishIndex(root());
  const { card, index } = upsertPublishedCard(current, { nodeId: args.node_id, title: args.title });
  writeFileAtomic(path.join(root(), card.file), args.content);
  writePublishIndex(root(), index);
  const localPath = generateFoliolePublishSite(root(), index, settings.site_address);
  await deploySite(settings, token);
  const url = `${settings.site_address}/cards/${card.id}.html`;
  await shell.openExternal(url);
  return { local_path: localPath, url };
}

export { disconnectFoliolePublishSettings, loadFoliolePublishSettings };
