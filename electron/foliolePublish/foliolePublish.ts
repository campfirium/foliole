import fs from 'node:fs';
import path from 'node:path';

import { shell } from 'electron';

import type { NativeFoliolePublishConnectInput, NativeFoliolePublishTopicArgs } from '../../lib/platform/nativeFoliolePublishContract.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { deployCloudflarePages, normalizeCloudflareProjectName, normalizeSiteAddress, resolveCloudflarePagesProject } from './cloudflarePagesClient.js';
import { readPublishIndex, upsertPublishedCard, writeFileAtomic, writePublishIndex } from './foliolePublishModel.js';
import { disconnectFoliolePublishSettings, loadFoliolePublishSettings, loadFoliolePublishToken, loadStoredFoliolePublishSettings, saveFoliolePublishConnection, saveFoliolePublishSiteAddress } from './foliolePublishSettings.js';
import { activateFoliolePublishSite, discardStagedFoliolePublishSite, generateFoliolePublishSite, stageFoliolePublishSite } from './foliolePublishSite.js';

function root() { return path.join(loadLibraryPathSettingsSync().library_home, 'Publish'); }

function assertPublishableContent(content: string) {
  if (/foliole-attachment:\/\//u.test(content) || /!\[[^\]]*\]\((?!https?:\/\/)[^)]+\)/u.test(content)) {
    throw new Error('This Topic contains a local image. Local attachments are not supported by Foliole Publish yet.');
  }
}

async function deploySite(settings: { account_id: string; project_name: string }, token: string) {
  return deployCloudflarePages({ accountId: settings.account_id, projectName: settings.project_name, siteRoot: path.join(root(), 'Site'), token });
}

async function deployStagedSite(input: {
  accountId: string; projectName: string; siteAddress: string; token: string;
}) {
  const staged = stageFoliolePublishSite(root(), readPublishIndex(root()), input.siteAddress);
  try {
    await deployCloudflarePages({ accountId: input.accountId, projectName: input.projectName, siteRoot: staged, token: input.token });
    return staged;
  } catch (error) {
    discardStagedFoliolePublishSite(staged);
    throw error;
  }
}

function commitStagedSite<T>(staged: string, save: () => T) {
  const activation = activateFoliolePublishSite(root(), staged);
  try {
    const saved = save();
    activation.commit();
    return saved;
  } catch (error) {
    activation.rollback();
    throw error;
  } finally { discardStagedFoliolePublishSite(staged); }
}

export async function connectFoliolePublishSettings(input: NativeFoliolePublishConnectInput) {
  const projectName = normalizeCloudflareProjectName(input.project_name);
  const accountId = input.account_id.trim();
  const token = input.api_token.trim();
  if (!accountId || !token) throw new Error('Enter a Cloudflare Account ID and authorization result.');
  const resolution = await resolveCloudflarePagesProject({
    accountId, projectName, token, useExistingProject: input.use_existing_project
  });
  if (resolution.status === 'exists') return { project_name: projectName, status: 'project_exists' } as const;
  const project = resolution.project;
  const pagesUrl = project.subdomain ? `https://${project.subdomain}` : `https://${projectName}.pages.dev`;
  fs.mkdirSync(root(), { recursive: true });
  const staged = await deployStagedSite({ accountId, projectName, siteAddress: pagesUrl, token });
  const settings = commitStagedSite(staged, () => saveFoliolePublishConnection({
    ...input, account_id: accountId, api_token: token, project_name: projectName, site_address: ''
  }, pagesUrl));
  return { settings, status: 'connected' } as const;
}

export async function updateFoliolePublishSiteAddress(siteAddress: string) {
  const settings = loadStoredFoliolePublishSettings();
  const token = loadFoliolePublishToken();
  if (!settings || !token) throw new Error('Connect Foliole Publish before changing its public address.');
  const nextAddress = normalizeSiteAddress(siteAddress) || settings.pages_url;
  const staged = await deployStagedSite({
    accountId: settings.account_id, projectName: settings.project_name, siteAddress: nextAddress, token
  });
  return commitStagedSite(staged, () => saveFoliolePublishSiteAddress(nextAddress));
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
