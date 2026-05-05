import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import { clipboard } from 'electron';

const WINDOWS_FILE_NAME_FORMAT = 'FileNameW';
const URI_LIST_FORMAT = 'text/uri-list';
const execFileAsync = promisify(execFile);

interface ClipboardFilePathCollectorOptions {
  readWindowsFileDropList?: () => Promise<string[]>;
}

function normalizeFilePath(value: string) {
  const trimmed = value.trim().replace(/^["']|["']$/g, '').replace(/^file:\/\//i, '');
  return decodeURIComponent(trimmed).replace(/^\/([A-Za-z]:[\\/])/, '$1');
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
    .map(normalizeFilePath);
}

function parseTextFilePaths(value: string) {
  const paths = value
    .split(/\r?\n/)
    .map(normalizeFilePath)
    .filter(Boolean);
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
  const formats = clipboard.availableFormats();
  const fileNameFormat = formats.find((format) => format === WINDOWS_FILE_NAME_FORMAT || format.includes(WINDOWS_FILE_NAME_FORMAT));
  const legacyFileNameFormat = formats.find((format) => format === 'FileName' || format.includes('FileName'));
  const uriListFormat = formats.find((format) => format === URI_LIST_FORMAT || format.includes(URI_LIST_FORMAT));
  const filePaths = new Set<string>();
  if (fileNameFormat) {
    for (const filePath of parsePathList(clipboard.read(fileNameFormat))) {
      filePaths.add(filePath);
    }
    for (const filePath of parseWindowsFileNameBuffer(clipboard.readBuffer(fileNameFormat))) {
      filePaths.add(filePath);
    }
  }
  if (!fileNameFormat && legacyFileNameFormat) {
    for (const filePath of parsePathList(clipboard.read(legacyFileNameFormat))) {
      filePaths.add(filePath);
    }
  }
  if (uriListFormat) {
    for (const filePath of parseUriList(clipboard.read(uriListFormat))) {
      filePaths.add(filePath);
    }
  }
  for (const filePath of parseTextFilePaths(clipboard.readText())) {
    filePaths.add(filePath);
  }
  for (const filePath of await (options.readWindowsFileDropList ?? readWindowsFileDropList)()) {
    filePaths.add(filePath);
  }
  return Array.from(filePaths);
}
