import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { resolveAppPaths } from './paths.js';

const WINDOW_STATE_FILE = 'window-state.json';
const WINDOW_STATE_NAMESPACE = 'settings';

export interface PersistedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeWindowStatePayload(payload: unknown): PersistedWindowState | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const data = payload as Record<string, unknown>;
  const width = toFiniteNumber(data.width);
  const height = toFiniteNumber(data.height);
  if (width === null || height === null || width < 320 || height < 320) {
    return null;
  }
  const x = toFiniteNumber(data.x);
  const y = toFiniteNumber(data.y);
  return {
    x: x ?? undefined,
    y: y ?? undefined,
    width,
    height,
    isMaximized: data.isMaximized === true
  };
}

async function resolveWindowStatePath(): Promise<string> {
  const storageDir = path.join(resolveAppPaths().app_data_dir, WINDOW_STATE_NAMESPACE);
  await fs.mkdir(storageDir, { recursive: true });
  return path.join(storageDir, WINDOW_STATE_FILE);
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

export async function loadWindowState(): Promise<PersistedWindowState | null> {
  const statePath = await resolveWindowStatePath();
  const payload = await readFileIfExists(statePath);
  if (!payload) {
    return null;
  }
  try {
    return normalizeWindowStatePayload(JSON.parse(payload) as unknown);
  } catch {
    return null;
  }
}

function toWindowStateFromRuntime(window: BrowserWindow): PersistedWindowState {
  const bounds = window.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized()
  };
}

export async function saveWindowState(window: BrowserWindow): Promise<void> {
  const statePath = await resolveWindowStatePath();
  const payload = toWindowStateFromRuntime(window);
  await fs.writeFile(statePath, JSON.stringify(payload), 'utf8');
}

