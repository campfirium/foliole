import { BrowserWindow, app, shell, type WebContents } from 'electron';

import {
  deleteNodesPermanently,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { applyReviewGrade } from '../database/reviewMutations.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { bootReport } from './boot.js';
import type { InvokeRequest } from './contracts.js';
import { listSystemFonts } from './fonts.js';
import { syncAppMenuState } from './menu.js';
import {
  parseDeleteNodesPermanentlyArgs,
  parseRestoreNodesArgs,
  parseSoftDeleteNodesArgs
} from './nodeCommandArgs.js';
import { resolveAppPaths } from './paths.js';
import { reviewGrade, reviewPreview, type ReviewGradeRequest, type ReviewPreviewRequest } from './review.js';
import { parseApplyReviewGradeArgs } from './reviewCommandArgs.js';
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

function asTimestamp(value: unknown, field: string): string {
  const timestamp = asString(value, field);
  if (!timestamp.trim()) {
    throw new Error(`invalid argument: ${field}`);
  }
  return timestamp;
}

interface AnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
}

function parseNodeSnapshotArgs(args: Record<string, unknown>) {
  return {
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
  };
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

interface NodeViewStatePayload {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
}

function parseNodeViewStatePayload(value: unknown, field: string): NodeViewStatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as Record<string, unknown>;
  return {
    nodeId: asString(payload.nodeId, `${field}.nodeId`),
    scrollTop: asNullableNumber(payload.scrollTop, `${field}.scrollTop`) ?? 0,
    selectionFrom: asNullableNumber(payload.selectionFrom, `${field}.selectionFrom`),
    selectionTo: asNullableNumber(payload.selectionTo, `${field}.selectionTo`)
  };
}

function parseNodeViewStatePayloadArray(value: unknown, field: string): NodeViewStatePayload[] {
  if (!Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value.map((item, index) => parseNodeViewStatePayload(item, `${field}[${index}]`));
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
  if (command === 'load_workspace_snapshot') {
    return loadWorkspaceSnapshot();
  }
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
  if (command === 'load_reading_progress') {
    return loadReadingProgress();
  }
  if (command === 'save_reading_progress') {
    saveReadingProgress({
      activeNodeId: asNullableString(args.activeNodeId, 'activeNodeId'),
      nodeViewStates: parseNodeViewStatePayloadArray(args.nodeViewStates, 'nodeViewStates'),
      updatedAt: asTimestamp(args.updatedAt, 'updatedAt')
    });
    return null;
  }
  if (command === 'update_node_content') {
    upsertNodeSnapshot(parseNodeSnapshotArgs(args));
    return null;
  }
  if (command === 'update_node_reveal') {
    upsertNodeSnapshot(parseNodeSnapshotArgs(args));
    return null;
  }
  if (command === 'replace_node_order') {
    replaceNodeOrder(asStringArray(args.nodeIds, 'nodeIds'));
    return null;
  }
  if (command === 'soft_delete_nodes') {
    softDeleteNodes(parseSoftDeleteNodesArgs(args));
    return null;
  }
  if (command === 'restore_nodes') {
    restoreNodes(parseRestoreNodesArgs(args));
    return null;
  }
  if (command === 'delete_nodes_permanently') {
    deleteNodesPermanently(parseDeleteNodesPermanentlyArgs(args));
    return null;
  }
  if (command === 'apply_review_grade') {
    applyReviewGrade(parseApplyReviewGradeArgs(args));
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
  if (command === 'review_preview') {
    return reviewPreview(args as unknown as ReviewPreviewRequest);
  }
  if (command === 'app_get_version') {
    return app.getVersion();
  }
  throw new Error(`unsupported native command: ${command}`);
}
