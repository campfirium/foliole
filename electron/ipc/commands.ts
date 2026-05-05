import { BrowserWindow, app, shell, type WebContents } from 'electron';

import { replaceNodeOrder, upsertNodeSnapshot } from '../database/nodeMutations.js';
import {
  clearWorkspaceStateFromSqlite,
  loadWorkspaceStateFromSqlite,
  saveWorkspaceStateToSqlite
} from '../database/workspaceState.js';

import { bootReport } from './boot.js';
import type { InvokeRequest } from './contracts.js';
import { listSystemFonts } from './fonts.js';
import { syncAppMenuState } from './menu.js';
import { resolveAppPaths } from './paths.js';
import { reviewGrade, type ReviewGradeRequest } from './review.js';
import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return asString(value, field);
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

interface AnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
}

function asAnchorLink(value: unknown, field: string): AnchorLinkPayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as { id?: unknown; kind?: unknown };
  if (typeof payload.id !== 'string') {
    throw new Error(`invalid argument: ${field}.id`);
  }
  if (payload.kind !== 'highlight' && payload.kind !== 'cloze') {
    throw new Error(`invalid argument: ${field}.kind`);
  }
  return { id: payload.id, kind: payload.kind };
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

interface InvokeContext {
  sender?: WebContents;
}

function resolveTargetWindow(context?: InvokeContext) {
  if (context?.sender) {
    const window = BrowserWindow.fromWebContents(context.sender);
    if (window) {
      return window;
    }
  }
  return BrowserWindow.getFocusedWindow();
}

async function handleWindowCommand(command: string, context?: InvokeContext): Promise<unknown> {
  const window = resolveTargetWindow(context);
  if (command === 'window_minimize') {
    window?.minimize();
    return null;
  }
  if (command === 'window_toggle_maximize') {
    if (!window) {
      return null;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return null;
  }
  if (command === 'window_close') {
    window?.close();
    return null;
  }
  if (command === 'window_is_maximized') {
    return Boolean(window?.isMaximized());
  }
  return undefined;
}

async function handleStorageCommand(command: string, args: Record<string, unknown>): Promise<unknown> {
  if (command === 'load_app_settings_state') {
    return loadAppSettingsState();
  }
  if (command === 'save_app_settings_state') {
    const settings = args.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('invalid argument: settings');
    }
    await saveAppSettingsState(settings as Record<string, unknown>);
    return null;
  }
  if (command === 'load_workspace_state') {
    return loadWorkspaceStateFromSqlite(asString(args.storageKey, 'storageKey'));
  }
  if (command === 'save_workspace_state') {
    saveWorkspaceStateToSqlite(asString(args.storageKey, 'storageKey'), asString(args.payload, 'payload'));
    return null;
  }
  if (command === 'clear_workspace_state') {
    clearWorkspaceStateFromSqlite(asString(args.storageKey, 'storageKey'));
    return null;
  }
  if (command === 'update_node_content') {
    upsertNodeSnapshot({
      nodeId: asString(args.nodeId, 'nodeId'),
      parentNodeId: asNullableString(args.parentNodeId, 'parentNodeId'),
      title: asString(args.title, 'title'),
      isTitleManual: asBoolean(args.isTitleManual, 'isTitleManual'),
      content: asString(args.content, 'content'),
      reveal: asNullableString(args.reveal, 'reveal'),
      anchorLink: asAnchorLink(args.anchorLink, 'anchorLink'),
      position: asNullableNumber(args.position, 'position'),
      createdAt: asString(args.createdAt, 'createdAt'),
      updatedAt: asString(args.updatedAt, 'updatedAt')
    });
    return null;
  }
  if (command === 'update_node_reveal') {
    upsertNodeSnapshot({
      nodeId: asString(args.nodeId, 'nodeId'),
      parentNodeId: asNullableString(args.parentNodeId, 'parentNodeId'),
      title: asString(args.title, 'title'),
      isTitleManual: asBoolean(args.isTitleManual, 'isTitleManual'),
      content: asString(args.content, 'content'),
      reveal: asNullableString(args.reveal, 'reveal'),
      anchorLink: asAnchorLink(args.anchorLink, 'anchorLink'),
      position: asNullableNumber(args.position, 'position'),
      createdAt: asString(args.createdAt, 'createdAt'),
      updatedAt: asString(args.updatedAt, 'updatedAt')
    });
    return null;
  }
  if (command === 'replace_node_order') {
    replaceNodeOrder(asStringArray(args.nodeIds, 'nodeIds'));
    return null;
  }
  return undefined;
}

export async function handleInvokeRequest(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const command = request.command;
  const args = request.args ?? {};

  if (command === 'open_external_url') {
    const url = asString(args.url, 'url').trim();
    if (!url) {
      return null;
    }
    await shell.openExternal(url);
    return null;
  }

  if (command === 'resolve_app_paths') {
    return resolveAppPaths();
  }
  if (command === 'list_system_fonts') {
    return listSystemFonts();
  }
  if (command === 'sync_app_menu_state') {
    syncAppMenuState(asStringArray(args.enabledCommandIds, 'enabledCommandIds'));
    return null;
  }

  const storageResult = await handleStorageCommand(command, args);
  if (storageResult !== undefined) {
    return storageResult;
  }

  const windowResult = await handleWindowCommand(command, context);
  if (windowResult !== undefined) {
    return windowResult;
  }
  if (command === 'boot_report') {
    await bootReport(asString(args.stage, 'stage'), args.payload ?? null);
    return null;
  }
  if (command === 'review_grade') {
    return reviewGrade(args as unknown as ReviewGradeRequest);
  }
  if (command === 'app_get_version') {
    return app.getVersion();
  }
  throw new Error(`unsupported native command: ${command}`);
}
