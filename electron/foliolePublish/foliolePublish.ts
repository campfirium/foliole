import fs from 'node:fs';
import path from 'node:path';

import { shell } from 'electron';

import { normalizeCloudflareProjectName } from '../../lib/core/foliolePublish/cloudflarePagesProjectName.js';
import { writeFolioleWebBinding } from '../../lib/core/foliolePublish/folioleWebPublishFrontmatter.js';
import type { NativeFoliolePublishConnectInput, NativeFoliolePublishTopicArgs } from '../../lib/platform/nativeFoliolePublishContract.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { deleteCloudflarePagesProject, deployCloudflarePages, normalizeSiteAddress, resolveCloudflarePagesProject } from './cloudflarePagesClient.js';
import { commitPublishedTopic } from './foliolePublishCommit.js';
import {
  readFoliolePublishSiteTitle as readSiteTitle,
  readPublishIndex,
  saveFoliolePublishSiteTitle as writeSiteTitle,
  upsertPublishedTopic
} from './foliolePublishModel.js';
import { clearFoliolePublishSettings, forgetFoliolePublishField, loadFoliolePublishSettings, loadFoliolePublishToken, loadStoredFoliolePublishSettings, recordFoliolePublishFields, resetFoliolePublishFieldHistory, saveFoliolePublishConnection, saveFoliolePublishDraft, saveFoliolePublishSiteAddress } from './foliolePublishSettings.js';
import { activateFoliolePublishSite, discardStagedFoliolePublishSite, generateFoliolePublishSite, stageFoliolePublishSite } from './foliolePublishSite.js';
import {
  loadFoliolePublishTheme as readFoliolePublishThemeStatus,
  prepareFoliolePublishCustomTheme,
  selectFoliolePublishCustomTheme,
  useFoliolePublishOfficialTheme
} from './foliolePublishTheme.js';

function root() { return path.join(loadLibraryPathSettingsSync().library_home, 'Publish'); }

function readTitledPublishIndex() {
  const index = readPublishIndex(root());
  if (!index.site.title.trim()) throw new Error('Enter a site title.');
  return index;
}

function assertPublishableContent(content: string) {
  if (/foliole-attachment:\/\//u.test(content) || /!\[[^\]]*\]\((?!https?:\/\/)[^)]+\)/u.test(content)) {
    throw new Error('This Topic contains a local image. Local attachments are not supported by Foliole Publish yet.');
  }
}

async function deployStagedSite(input: {
  accountId: string; projectName: string; siteAddress: string; token: string;
}) {
  const staged = stageFoliolePublishSite(root(), readTitledPublishIndex(), input.siteAddress);
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
  const token = input.api_token.trim() || loadFoliolePublishToken();
  if (!accountId || !token) throw new Error('Enter a Cloudflare Account ID and authorization result.');
  if (!input.confirm_subdomain_risk) throw new Error('Confirm the subdomain check before deployment.');
  const resolution = await resolveCloudflarePagesProject({
    accountId, projectName, token
  });
  if (resolution.status === 'exists') return { project_name: projectName, status: 'subdomain_unavailable' } as const;
  const project = resolution.project;
  const pagesUrl = project.subdomain ? `https://${project.subdomain}` : `https://${projectName}.pages.dev`;
  fs.mkdirSync(root(), { recursive: true });
  try {
    const staged = await deployStagedSite({ accountId, projectName, siteAddress: pagesUrl, token });
    const settings = commitStagedSite(staged, () => saveFoliolePublishConnection({
      ...input, account_id: accountId, api_token: token, project_name: projectName, site_address: ''
    }, pagesUrl));
    return { settings, status: 'connected' } as const;
  } catch (error) {
    if (resolution.created) {
      try { await deleteCloudflarePagesProject({ accountId, projectName, token }); }
      catch { throw new Error("Deployment failed, and Foliole couldn't remove the new Cloudflare project."); }
    }
    throw error;
  }
}

export async function disconnectFoliolePublishSettings() {
  const settings = loadStoredFoliolePublishSettings();
  if (!settings) return clearFoliolePublishSettings();
  const token = loadFoliolePublishToken();
  if (!token) throw new Error('Reconnect Cloudflare before deleting the published site.');
  await deleteCloudflarePagesProject({
    accountId: settings.account_id, projectName: settings.project_name, token
  });
  return clearFoliolePublishSettings();
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

export async function previewFoliolePublish(args: NativeFoliolePublishTopicArgs) {
  assertPublishableContent(args.content);
  fs.mkdirSync(root(), { recursive: true });
  const settings = loadFoliolePublishSettings();
  const { index, topic } = upsertPublishedTopic(readTitledPublishIndex(), { nodeId: args.node_id, title: args.title });
  const staged = stageFoliolePublishSite(root(), index, settings.site_address, new Map([[topic.source_key, { content: args.content, fields: args.fields }]]));
  const activation = activateFoliolePublishSite(root(), staged, 'Preview');
  activation.commit();
  const localPath = activation.activePath;
  const error = await shell.openPath(localPath);
  if (error) throw new Error(error);
  return { local_path: localPath, status: 'previewed', updated_content: null, url: null } as const;
}

export async function viewFoliolePublishSite() {
  readTitledPublishIndex();
  const localPath = path.join(root(), 'Site', 'index.html');
  if (!fs.existsSync(localPath)) throw new Error('No local static pages have been generated yet.');
  const error = await shell.openPath(localPath);
  if (error) throw new Error(error);
  return { local_path: localPath, status: 'previewed', updated_content: null, url: null } as const;
}

export async function publishTopicToFoliole(args: NativeFoliolePublishTopicArgs) {
  assertPublishableContent(args.content);
  const settings = loadStoredFoliolePublishSettings();
  const token = loadFoliolePublishToken();
  if (!settings || !token) throw new Error('Deploy Foliole Publish from Settings first.');
  const current = readTitledPublishIndex();
  const { index, topic } = upsertPublishedTopic(current, { nodeId: args.node_id, title: args.title });
  const url = `${settings.site_address}/topics/${topic.number}/`;
  const updatedContent = writeFolioleWebBinding(args.content, {
    fields: args.fields, lastPublishedAt: topic.updated_at, pageId: String(topic.number), site: settings.site_address, url
  });
  const staged = stageFoliolePublishSite(root(), index, settings.site_address, new Map([[topic.source_key, { content: updatedContent, fields: args.fields }]]));
  try {
    await deployCloudflarePages({
      accountId: settings.account_id, projectName: settings.project_name, siteRoot: staged,
      token, waitForCompletion: false
    });
  } catch (error) {
    discardStagedFoliolePublishSite(staged);
    throw error;
  }
  let localPath: string;
  try { localPath = commitPublishedTopic({ content: updatedContent, index, root: root(), staged, topicFile: topic.file }); }
  catch (error) {
    await shell.openExternal(url);
    return {
      local_path: path.join(root(), 'Site', 'index.html'), status: 'deployed_local_publish_state_failed' as const,
      updated_content: updatedContent, url,
      warning: error instanceof Error ? error.message : 'Foliole could not save the local publish state.'
    };
  }
  let status: 'deployed_and_committed' | 'deployed_history_failed' = 'deployed_and_committed';
  try { recordFoliolePublishFields(args.fields); } catch { status = 'deployed_history_failed'; }
  fs.rmSync(path.join(root(), 'Preview'), { force: true, recursive: true });
  await shell.openExternal(url);
  return { local_path: localPath, status, updated_content: updatedContent, url };
}

export function loadFoliolePublishTheme() {
  return readFoliolePublishThemeStatus(root());
}

export async function openFoliolePublishCustomTheme() {
  const prepared = prepareFoliolePublishCustomTheme(root());
  const error = await shell.openPath(prepared.path);
  if (error) throw new Error(error);
  return { local_path: prepared.path, theme: selectFoliolePublishCustomTheme(root()) };
}

export function useFoliolePublishTheme() {
  return { theme: useFoliolePublishOfficialTheme(root()) };
}

export function updateFoliolePublishLocalPages() {
  fs.mkdirSync(root(), { recursive: true });
  const settings = loadFoliolePublishSettings();
  return { local_path: generateFoliolePublishSite(root(), readTitledPublishIndex(), settings.site_address) };
}

export async function publishFoliolePublishThemeChanges() {
  const settings = loadStoredFoliolePublishSettings();
  const token = loadFoliolePublishToken();
  if (!settings || !token) throw new Error('Connect Foliole Publish before publishing theme changes.');
  const staged = await deployStagedSite({
    accountId: settings.account_id, projectName: settings.project_name,
    siteAddress: settings.site_address, token
  });
  return commitStagedSite(staged, () => ({ local_path: path.join(root(), 'Site', 'index.html') }));
}

export function loadFoliolePublishSiteTitle() {
  return { site_title: readSiteTitle(root()) };
}

export function saveFoliolePublishSiteTitle(siteTitle: string) {
  return { site_title: writeSiteTitle(root(), siteTitle) };
}

export { forgetFoliolePublishField, loadFoliolePublishSettings, resetFoliolePublishFieldHistory, saveFoliolePublishDraft };
