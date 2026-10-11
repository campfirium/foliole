/** Durable files owned by one library's existing sync writer. */
export interface FramedSyncFilePort {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
  list(directory: string): Promise<readonly string[]>;
  exclusive<T>(key: string, execute: () => Promise<T>): Promise<T>;
}

export function framedSyncFileKey(...parts: readonly string[]) {
  if (!parts.length || parts.some((part) => !/^[a-z0-9][a-z0-9_.-]*$/u.test(part) || part.includes('..'))) {
    throw new Error('framed_sync_file_key_invalid');
  }
  return parts.join('/');
}

export function encodeFramedSyncFileJson(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString();
    return item instanceof Uint8Array ? [...item] : item;
  }));
}

export function decodeFramedSyncFileJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
