const ENDPOINT = '/__foliole_preview/sqlite';

/** Stops admitting calls before draining accepted work and closing this document's worker. */
export function createCompanionPreviewDocument(session = crypto.randomUUID()) {
  const pending = new Set<Promise<unknown>>();
  let closing: Promise<void> | null = null;
  let accepting = true;
  async function request(method: string, options: unknown) {
    const response = await fetch(ENDPOINT, {
      body: JSON.stringify({ method, options, session }), headers: { 'Content-Type': 'application/json' }, method: 'POST'
    });
    if (!response.ok) throw new Error(`Companion preview database is unavailable (${response.status}).`);
    const reply = await response.json() as { code?: string; message?: string; ok: boolean; result?: unknown };
    if (reply.ok) return reply.result;
    throw Object.assign(new Error(reply.message ?? 'Companion preview database failed.'), reply.code ? { code: reply.code } : {});
  }
  return {
    session,
    call(method: string, options: unknown) {
      if (!accepting) return Promise.reject(new Error('Preview document is closing.'));
      const operation = request(method, options);
      pending.add(operation);
      void operation.then(() => pending.delete(operation), () => pending.delete(operation));
      return operation;
    },
    close() {
      accepting = false;
      closing ??= Promise.allSettled([...pending]).then(async (outcomes) => {
        const failed = outcomes.find(outcome => outcome.status === 'rejected');
        if (failed) throw failed.reason;
        await request('closeAllConnections', {});
      }).catch((error: unknown) => {
        closing = null;
        throw error;
      });
      return closing;
    }
  };
}
