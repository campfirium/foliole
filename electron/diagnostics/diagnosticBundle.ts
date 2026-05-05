import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { App, Shell } from 'electron';

import type { NativeExportDiagnosticBundleResult } from '../../lib/platform/nativeUtilityContract.js';

import { writeStoredZip } from './zipStore.js';

interface DiagnosticSource {
  label: string;
  rootPath: string;
}

function formatTimestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function normalizeZipPath(value: string) {
  return value.split(path.sep).join('/');
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(source: DiagnosticSource, currentPath = source.rootPath): Promise<Array<{ content: Buffer; name: string }>> {
  if (!(await pathExists(currentPath))) {
    return [];
  }
  const stat = await fs.stat(currentPath);
  if (stat.isFile()) {
    const relativePath = path.relative(source.rootPath, currentPath) || path.basename(currentPath);
    return [{
      content: await fs.readFile(currentPath),
      name: normalizeZipPath(path.join(source.label, relativePath))
    }];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collectFiles(source, path.join(currentPath, entry.name))));
  return nested.flat();
}

export async function exportDiagnosticBundle(args: {
  app: Pick<App, 'getPath' | 'getVersion'>;
  shell: Pick<Shell, 'showItemInFolder'>;
}): Promise<NativeExportDiagnosticBundleResult> {
  const sources = [
    { label: 'logs', rootPath: args.app.getPath('logs') },
    { label: 'crashDumps', rootPath: args.app.getPath('crashDumps') }
  ];
  const collectedFiles = (await Promise.all(sources.map((source) => collectFiles(source)))).flat();
  const manifest = {
    appVersion: args.app.getVersion(),
    createdAt: new Date().toISOString(),
    includedFiles: collectedFiles.map((entry) => entry.name)
  };
  const outputPath = path.join(
    args.app.getPath('desktop'),
    `foliole-diagnostics-${formatTimestampForFile()}.zip`
  );
  await writeStoredZip(outputPath, [
    {
      content: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      name: 'manifest.json'
    },
    ...collectedFiles
  ]);
  args.shell.showItemInFolder(outputPath);
  return {
    file_path: outputPath,
    included_file_count: collectedFiles.length,
    status: 'exported'
  };
}
