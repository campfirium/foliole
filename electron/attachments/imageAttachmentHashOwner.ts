const activeByHash = new Map<string, Promise<void>>();

export async function runWithImageAttachmentHashOwner<T>(hash: string, execute: () => Promise<T>): Promise<T> {
  while (activeByHash.has(hash)) await activeByHash.get(hash);
  let release!: () => void;
  const active = new Promise<void>((resolve) => { release = resolve; });
  activeByHash.set(hash, active);
  try {
    return await execute();
  } finally {
    activeByHash.delete(hash);
    release();
  }
}
