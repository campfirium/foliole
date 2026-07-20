import { createAideSkillsRootsRequest } from './codexAppServerAidePolicy.js';
import type { JsonRpcMessage } from './codexAppServerProtocol.js';

export class CodexAppServerSkillsInitialization {
  readonly initializeId = 0;
  private requestId: number | null = null;

  constructor(private readonly skillRoots: readonly string[]) {}

  handle(args: {
    allocateRequestId: () => number;
    message: JsonRpcMessage;
    resolve: () => void;
    write: (message: JsonRpcMessage) => void;
  }) {
    if (args.message.id === this.initializeId && !args.message.method) {
      args.write({ method: 'initialized', params: {} });
      if (this.skillRoots.length === 0) args.resolve();
      else {
        this.requestId = args.allocateRequestId();
        args.write(createAideSkillsRootsRequest(this.requestId, this.skillRoots));
      }
      return true;
    }
    if (this.requestId === null || args.message.id !== this.requestId || args.message.method) return false;
    args.resolve();
    return true;
  }
}
