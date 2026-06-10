import fs from 'node:fs';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const WORKSPACE_CHANGE_TIMESTAMP_MODULE_ID = 'virtual:workspace-change-timestamp';
const RESOLVED_WORKSPACE_CHANGE_TIMESTAMP_MODULE_ID = `\0${WORKSPACE_CHANGE_TIMESTAMP_MODULE_ID}`;
const WORKSPACE_TIMESTAMP_ROOTS = ['src', 'electron'];
const WORKSPACE_TIMESTAMP_INCLUDE_EXTENSIONS = new Set(['.css', '.js', '.jsx', '.mjs', '.mts', '.scss', '.ts', '.tsx']);
export const DESKTOP_RENDERER_WARMUP_FILES = [
  './src/main.tsx',
  './src/app/styles.css',
  './src/startupBootstrap.ts',
  './src/startupViewMode.ts',
  './src/shared/platform/bridge.ts',
  './src/shared/platform/appSettingsSync.ts',
  './src/shared/platform/desktopDebugProbe.ts',
  './src/shared/platform/rendererErrorDiagnostics.ts',
  './src/app/App.tsx'
];

function resolveDevPort() {
  const raw = process.env.FOLIOLE_VITE_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return 24600;
}

function formatWorkspaceChangeTimestamp(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

function shouldTrackWorkspaceTimestampFile(filePath: string) {
  const normalizedPath = filePath.split(path.sep).join('/');
  const extension = path.extname(normalizedPath);

  if (!WORKSPACE_TIMESTAMP_INCLUDE_EXTENSIONS.has(extension)) {
    return false;
  }
  if (normalizedPath.endsWith('.d.ts')) {
    return false;
  }
  if (normalizedPath.includes('/test/')) {
    return false;
  }
  if (normalizedPath.includes('/dist/')) {
    return false;
  }
  return !normalizedPath.match(/\.(test|spec)\.[^/.]+$/);
}

function collectWorkspaceTimestampFiles(rootDir: string) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectWorkspaceTimestampFiles(fullPath));
      continue;
    }
    if (entry.isFile() && shouldTrackWorkspaceTimestampFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readWorkspaceChangeTimestamp(projectRoot: string) {
  const candidateFiles = WORKSPACE_TIMESTAMP_ROOTS
    .map((root) => path.resolve(projectRoot, root))
    .flatMap((root) => (fs.existsSync(root) ? collectWorkspaceTimestampFiles(root) : []));
  candidateFiles.push(path.resolve(projectRoot, 'vite.config.ts'));
  candidateFiles.push(path.resolve(projectRoot, 'vite.companion.config.ts'));

  let latestModifiedAt = 0;
  for (const filePath of candidateFiles) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const modifiedAt = fs.statSync(filePath).mtimeMs;
    if (modifiedAt > latestModifiedAt) {
      latestModifiedAt = modifiedAt;
    }
  }

  return formatWorkspaceChangeTimestamp(new Date(latestModifiedAt || Date.now()));
}

function workspaceChangeTimestampPlugin(projectRoot: string): Plugin {
  return {
    name: 'workspace-change-timestamp',
    resolveId(id) {
      if (id === WORKSPACE_CHANGE_TIMESTAMP_MODULE_ID) {
        return RESOLVED_WORKSPACE_CHANGE_TIMESTAMP_MODULE_ID;
      }
      return null;
    },
    load(id) {
      if (id !== RESOLVED_WORKSPACE_CHANGE_TIMESTAMP_MODULE_ID) {
        return null;
      }
      return `export const workspaceChangeTimestamp = '${readWorkspaceChangeTimestamp(projectRoot)}';`;
    },
    handleHotUpdate(context) {
      if (!shouldTrackWorkspaceTimestampFile(context.file)) {
        return;
      }
      const virtualModule = context.server.moduleGraph.getModuleById(RESOLVED_WORKSPACE_CHANGE_TIMESTAMP_MODULE_ID);
      if (!virtualModule) {
        return;
      }
      context.server.moduleGraph.invalidateModule(virtualModule, undefined, context.timestamp, true);
      return [virtualModule];
    }
  };
}

interface SharedViteConfigOptions {
  warmupClientFiles?: string[];
}

export function createSharedViteConfig(projectRoot: string, options: SharedViteConfigOptions = {}) {
  return defineConfig({
    base: './',
    plugins: [react(), tailwindcss(), workspaceChangeTimestampPlugin(projectRoot)],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, './src')
      }
    },
    server: {
      cors: true,
      hmr: false,
      host: '127.0.0.1',
      port: resolveDevPort(),
      strictPort: true,
      ...(options.warmupClientFiles ? { warmup: { clientFiles: options.warmupClientFiles } } : {})
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts', 'scripts/**/*.test.mjs'],
      exclude: ['tests/**', 'node_modules/**', 'dist/**'],
      setupFiles: './src/test/setup.ts',
      globals: true
    }
  });
}
