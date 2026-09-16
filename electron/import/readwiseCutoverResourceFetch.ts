export function cutoverResourceFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!url.hostname.endsWith('.amazonaws.com')) return fetchImpl(input, init);
    for (let retry = 0; ; retry += 1) {
      init?.signal?.throwIfAborted();
      let response: Response;
      try { response = await fetchImpl(input, init); } catch (error) {
        init?.signal?.throwIfAborted();
        if (retry === 3) throw error;
        continue;
      }
      if (retry === 3 || (response.status !== 429 && response.status < 500)) return response;
      await response.body?.cancel();
      if (response.status === 429) await delay(Number(response.headers.get('retry-after')) || 1, init?.signal);
    }
  };
}

async function delay(seconds: number, signal?: AbortSignal | null) {
  await new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, Math.max(1, seconds) * 1000);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
  });
}
