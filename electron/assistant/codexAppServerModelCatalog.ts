import readline from 'node:readline';

import type {
  NativeAssistantModelCatalog,
  NativeAssistantModelOption
} from '../../lib/platform/nativeAssistantModelContract.js';

import { categorizedError } from './codexAppServerAdapterSupport.js';
import {
  createInitializeMessage,
  mapJsonRpcError,
  parseMessage,
  type JsonRpcMessage,
  type JsonRpcRecord
} from './codexAppServerProtocol.js';
import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';

const MODEL_CATALOG_TIMEOUT_MS = 15_000;

export async function readCodexModelCatalog(args: {
  appVersion: string;
  spawn: () => SpawnedCodexProcess;
}): Promise<NativeAssistantModelCatalog> {
  const client = new ModelCatalogClient(args);
  try {
    await client.initialize();
    return await client.readAll();
  } finally {
    client.dispose();
  }
}

class ModelCatalogClient {
  private readonly child: SpawnedCodexProcess;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly reader: readline.Interface;

  constructor(private readonly args: { appVersion: string; spawn: () => SpawnedCodexProcess }) {
    this.child = args.spawn();
    this.reader = readline.createInterface({ input: this.child.stdout });
    this.reader.on('line', (line) => this.handleLine(line));
    this.child.on('error', () => this.failAll('launch_failed'));
    this.child.on('exit', () => this.failAll('interrupted'));
  }

  async initialize() {
    await this.request(createInitializeMessage(this.args.appVersion));
    this.write({ method: 'initialized', params: {} });
  }

  async readAll() {
    const models: NativeAssistantModelOption[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const result = await this.request({
        method: 'model/list',
        params: { cursor, includeHidden: false, limit: 100 }
      });
      models.push(...readCatalogPage(result));
      cursor = readNullableString(result.nextCursor);
      if (cursor && seenCursors.has(cursor)) throw categorizedError('protocol_error');
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    validateCatalog(models);
    return { models };
  }

  dispose() {
    this.failAll('interrupted');
    this.reader.close();
    this.child.removeAllListeners?.();
    this.child.stdin.end?.();
    this.child.kill();
  }

  private request(message: JsonRpcMessage) {
    const id = typeof message.id === 'number' ? message.id : this.nextId++;
    return new Promise<JsonRpcRecord>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(categorizedError('timeout'));
      }, MODEL_CATALOG_TIMEOUT_MS);
      this.pending.set(id, { reject, resolve, timeout });
      this.write({ ...message, id });
    });
  }

  private handleLine(line: string) {
    const parsed = parseMessage(line);
    if (!parsed.ok || typeof parsed.message.id !== 'number') return;
    const pending = this.pending.get(parsed.message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(parsed.message.id);
    if (parsed.message.error) pending.reject(categorizedError(mapJsonRpcError(parsed.message.error)));
    else pending.resolve(parsed.message.result ?? {});
  }

  private failAll(category: 'interrupted' | 'launch_failed') {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(categorizedError(category));
    }
    this.pending.clear();
  }

  private write(message: JsonRpcMessage) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

function readCatalogPage(result: JsonRpcRecord) {
  if (!Array.isArray(result.data)) throw categorizedError('protocol_error');
  return result.data.filter(isVisibleModel).map(readModel);
}

function isVisibleModel(value: unknown) {
  return Boolean(value && typeof value === 'object' && (value as JsonRpcRecord).hidden !== true);
}

function readModel(value: unknown): NativeAssistantModelOption {
  const model = value as JsonRpcRecord;
  const supportedReasoningEfforts = readArray(model.supportedReasoningEfforts).map((option) => {
    const item = option as JsonRpcRecord;
    return { description: readString(item.description), effort: readString(item.reasoningEffort) };
  });
  const serviceTiers = readArray(model.serviceTiers).map((tier) => {
    const item = tier as JsonRpcRecord;
    return {
      description: readString(item.description),
      id: readString(item.id),
      name: readString(item.name)
    };
  });
  return {
    defaultReasoningEffort: readString(model.defaultReasoningEffort),
    defaultServiceTier: readNullableString(model.defaultServiceTier),
    description: readString(model.description),
    displayName: readString(model.displayName),
    isDefault: model.isDefault === true,
    model: readString(model.model),
    serviceTiers,
    supportedReasoningEfforts
  };
}

function validateCatalog(models: NativeAssistantModelOption[]) {
  if (!models.length || models.filter((model) => model.isDefault).length !== 1)
    throw categorizedError('protocol_error');
  const ids = new Set<string>();
  for (const model of models) {
    if (ids.has(model.model)) throw categorizedError('protocol_error');
    ids.add(model.model);
    if (!model.supportedReasoningEfforts.some((item) => item.effort === model.defaultReasoningEffort))
      throw categorizedError('protocol_error');
    if (model.defaultServiceTier !== null
      && !model.serviceTiers.some((tier) => tier.id === model.defaultServiceTier))
      throw categorizedError('protocol_error');
  }
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw categorizedError('protocol_error');
  return value;
}

function readString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw categorizedError('protocol_error');
  return value;
}

function readNullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  return readString(value);
}

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (result: JsonRpcRecord) => void;
  timeout: NodeJS.Timeout;
}
