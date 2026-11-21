import { fork } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

import { hydrateStagedEpubBook, type StagedEpubBook } from './epubBookStaging.js';
import type { RawEpubBook } from './epubImportBook.js';
import type { ImportSourceDescriptor } from './importSourcePipeline.js';

function workerModulePath() {
  // Source-loaded tests use the current compiled worker, never an in-process parser substitute.
  return fileURLToPath(new URL(import.meta.url.endsWith('.ts')
    ? '../../dist/electron/ipc/epubBookProcess.js' : './epubBookProcess.js', import.meta.url));
}

const STDERR_TAIL_BYTES = 2048;

export interface EpubParseProcessOutcome {
  available_memory_bytes: number;
  duration_ms: number;
  exit_code: number | null;
  file_size_bytes: number | null;
  heap_limit_mib: number;
  received_result: boolean;
  signal: string | null;
  stderr_tail: string;
}

// Separates a crash or memory exhaustion from a parser error; names no book and keeps only the stderr tail.
export function classifyEpubParseFailure(outcome: Pick<EpubParseProcessOutcome, 'exit_code' | 'received_result' | 'signal' | 'stderr_tail'>) {
  if (/heap out of memory|allocation failed|Reached heap limit/iu.test(outcome.stderr_tail)) return 'out_of_memory';
  if (outcome.signal) return 'killed_by_signal';
  if (outcome.exit_code !== 0) return outcome.received_result ? 'exited_after_result' : 'crashed';
  return 'exited_without_result';
}

async function recordEpubParseFailure(outcome: EpubParseProcessOutcome) {
  await appendDiagnosticLog({
    event: 'epub_parse_process_failed',
    level: 'warn',
    occurred_at: new Date().toISOString(),
    payload: { ...outcome, reason: classifyEpubParseFailure(outcome) },
    source: 'electron.import'
  }).catch(() => undefined);
}

async function fileSize(filePath: string) {
  try { return (await stat(filePath)).size; } catch { return null; }
}

function parseInChildProcess(filePath: string, sourceName: string, root: string) {
  return new Promise<StagedEpubBook>((resolve, reject) => {
    const startedAt = Date.now();
    const available = process.availableMemory() || os.freemem();
    const heapMiB = Math.floor(available / 2 / 1024 / 1024);
    if (heapMiB < 64) return reject(new Error('EPUB import failed: insufficient available memory'));
    const child = fork(workerModulePath(), [filePath, sourceName, root], {
      execArgv: [`--max-old-space-size=${heapMiB}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES);
    });
    let result: { book?: StagedEpubBook; error?: string } | undefined;
    child.once('message', (message) => { result = message as typeof result; });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code !== 0 || !result) {
        const failure = new Error('EPUB import failed: parsing process could not complete within available resources');
        void fileSize(filePath).then(size => recordEpubParseFailure({
          available_memory_bytes: available, duration_ms: Date.now() - startedAt, exit_code: code,
          file_size_bytes: size, heap_limit_mib: heapMiB, received_result: Boolean(result),
          signal: signal ?? null, stderr_tail: stderrTail.trim()
        })).finally(() => reject(failure));
        return;
      }
      if (result.error) return reject(new Error(result.error));
      if (!result.book) return reject(new Error('EPUB import failed: missing parsed book'));
      resolve(result.book);
    });
  });
}

async function readBook(input: { filePath?: string; bytes?: Uint8Array; sourceName: string }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-epub-'));
  try {
    const filePath = input.filePath ?? path.join(root, 'source.epub');
    if (input.bytes) await writeFile(filePath, input.bytes, { mode: 0o600 });
    const book = hydrateStagedEpubBook(await parseInChildProcess(filePath, input.sourceName, root));
    book.workingDirectory = root;
    book.dispose = () => rm(root, { recursive: true, force: true });
    return book;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export function readRawEpubBook(source: ImportSourceDescriptor): Promise<RawEpubBook> {
  return readBook({ filePath: source.filePath, sourceName: source.sourceName });
}

export function readRawEpubBookBytes(bytes: Uint8Array, sourceName: string): Promise<RawEpubBook> {
  return readBook({ bytes, sourceName });
}
