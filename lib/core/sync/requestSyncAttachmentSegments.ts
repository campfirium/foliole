export type AttachmentDemandSlice = { keys: string[]; pending: boolean; pdfTextKeys?: string[] };
type Result = { kind: 'ready'; slice: AttachmentDemandSlice } | { kind: 'failed'; error: unknown };

/** One metadata lookahead; exclusions live only for this pull stage, never in storage. */
export function createAttachmentSegments(initial: string[], next?: (excluded: readonly string[]) => Promise<AttachmentDemandSlice>) {
  let keys = initial, cursor = 0, more = Boolean(next);
  const seen = new Set(initial);
  let loading: Promise<Result> | undefined;
  const prefetch = () => {
    if (!more || loading || keys.length - cursor > 2) return;
    loading = next!([...seen]).then(slice => ({ kind: 'ready', slice }),
      (error: unknown) => ({ kind: 'failed', error }));
  };
  return {
    take() {
      const key = keys[cursor++];
      prefetch();
      return key;
    },
    hasKeys: () => cursor < keys.length,
    async advance() {
      prefetch();
      if (cursor < keys.length || !loading) return undefined;
      const result = await loading;
      loading = undefined;
      if (result.kind === 'failed') throw result.error;
      keys = result.slice.keys.filter(key => !seen.has(key));
      keys.forEach(key => seen.add(key));
      cursor = 0;
      more = result.slice.pending && keys.length > 0;
      return result.slice;
    },
    async close(retain: (key: string) => void) {
      keys.slice(cursor).forEach(retain);
      const result = await loading;
      if (result?.kind === 'ready') result.slice.keys.forEach(retain);
      if (result?.kind === 'failed') throw result.error;
    }
  };
}
