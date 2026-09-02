import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import { electronClipboardAccess, readElectronClipboardTextType } from '../clipboardAccess.js';

const WINDOWS_FILE_NAME_FORMAT = 'FileNameW';
const URI_LIST_FORMAT = 'text/uri-list';
const execFileAsync = promisify(execFile);

interface ClipboardFilePathCollectorOptions {
  readWindowsFileDropList?: () => Promise<string[]>;
}

function normalizeFilePath(value: string) {
  return stripPathBoundary(value);
}

function stripPathBoundary(value: string) {
  return value.trim().replace(/^["']|["']$/g, '');
}

function isPlainPathCandidate(value: string) {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(stripPathBoundary(value));
}

function decodeFileUriPath(value: string) {
  const trimmed = stripPathBoundary(value);
  if (!/^file:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    return decodeURIComponent(trimmed.replace(/^file:\/\//i, '')).replace(/^\/([A-Za-z]:[\\/])/, '$1');
  } catch {
    return null;
  }
}

function normalizeTextPathCandidate(value: string) {
  const fileUriPath = decodeFileUriPath(value);
  if (fileUriPath) {
    return fileUriPath;
  }
  return isPlainPathCandidate(value) ? normalizeFilePath(value) : null;
}

function parsePathList(value: string) {
  const quotedPaths = Array.from(value.matchAll(/"([^"]+)"/g), (match) => match[1] ?? '').filter(Boolean);
  const candidates = quotedPaths.length > 0 ? quotedPaths : value.replaceAll('\u0000', '\n').split(/\r?\n/);
  return candidates.map(normalizeFilePath).filter(Boolean);
}

function parseWindowsFileNameBuffer(buffer: Buffer) {
  return parsePathList(buffer.toString('utf16le'));
}

function parseUriList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.startsWith('file:'))
    .map(decodeFileUriPath)
    .filter((filePath): filePath is string => Boolean(filePath));
}

function parseTextFilePaths(value: string) {
  const paths = value
    .split(/\r?\n/)
    .map(normalizeTextPathCandidate)
    .filter((filePath): filePath is string => Boolean(filePath));
  if (paths.length === 0 || paths.some((candidate) => !fs.existsSync(candidate))) {
    return [];
  }
  return paths;
}

export function parseWindowsFileDropListPayload(value: string) {
  if (!value.trim()) {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed === 'string') {
    return [parsed].map(normalizeFilePath).filter(Boolean);
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry): entry is string => typeof entry === 'string').map(normalizeFilePath).filter(Boolean);
}

async function readWindowsFileDropList() {
  if (process.platform !== 'win32') {
    return [];
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; Add-Type -AssemblyName System.Windows.Forms; $paths=@([System.Windows.Forms.Clipboard]::GetFileDropList()); ConvertTo-Json -InputObject $paths -Compress'
      ],
      { encoding: 'utf8', timeout: 1500, windowsHide: true }
    );
    return parseWindowsFileDropListPayload(stdout);
  } catch {
    return [];
  }
}

export async function collectClipboardFilePaths(options: ClipboardFilePathCollectorOptions = {}) {
  const formats = await electronClipboardAccess.availableFormats();
  const fileNameFormat = formats.find((format) => format === WINDOWS_FILE_NAME_FORMAT || format.includes(WINDOWS_FILE_NAME_FORMAT));
  const legacyFileNameFormat = formats.find((format) => format === 'FileName' || format.includes('FileName'));
  const uriListFormat = formats.find((format) => format === URI_LIST_FORMAT || format.includes(URI_LIST_FORMAT));
  const filePaths = new Set<string>();
  if (fileNameFormat) {
    for (const filePath of parseWindowsFileNameBuffer(await electronClipboardAccess.readBuffer(fileNameFormat))) {
      filePaths.add(filePath);
    }
  }
  if (!fileNameFormat && legacyFileNameFormat) {
    const bytes = await electronClipboardAccess.readBuffer(legacyFileNameFormat);
    for (const filePath of parsePathList(bytes.toString('utf8'))) {
      filePaths.add(filePath);
    }
  }
  if (uriListFormat) {
    for (const filePath of parseUriList(await readElectronClipboardTextType(URI_LIST_FORMAT))) {
      filePaths.add(filePath);
    }
  }
  for (const filePath of parseTextFilePaths(await electronClipboardAccess.readText())) {
    filePaths.add(filePath);
  }
  for (const filePath of await (options.readWindowsFileDropList ?? readWindowsFileDropList)()) {
    filePaths.add(filePath);
  }
  return Array.from(filePaths);
}
