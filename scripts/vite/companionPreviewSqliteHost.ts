import { createCompanionPreviewSqliteWorker } from './companionPreviewSqliteWorkerClient';

// Documents share the library file, never connection handles or a blocking SQLite thread.
export function createCompanionPreviewSqliteHost(mainFile: string) {
  const documents = new Map<string, ReturnType<typeof createCompanionPreviewSqliteWorker>>();
  return {
    async call(method: string, options: unknown, session: string) {
      if (method === 'closeAllConnections') {
        const document = documents.get(session);
        documents.delete(session);
        await document?.close();
        return {};
      }
      let document = documents.get(session);
      if (!document) {
        document = createCompanionPreviewSqliteWorker(mainFile);
        documents.set(session, document);
      }
      return document.call(method, options);
    },
    async close() {
      const active = [...documents.values()];
      documents.clear();
      await Promise.all(active.map((document) => document.close()));
    }
  };
}
