import {
  dynamicToolFailure,
  readDynamicToolRequest,
  type DynamicToolCallResult,
  type FolioleDynamicToolRequest
} from './codexAppServerDynamicTools.js';
import type { JsonRpcMessage } from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';

export async function handleDynamicToolCall(args: {
  execute: (request: FolioleDynamicToolRequest) => Promise<DynamicToolCallResult>;
  isCurrent: () => boolean;
  message: JsonRpcMessage;
  onProtocolError: () => void;
  refreshTimeout: () => void;
  turn: TurnState;
  write: (message: JsonRpcMessage) => void;
}) {
  if (args.message.id === undefined) {
    args.onProtocolError();
    return;
  }
  const request = readDynamicToolRequest(args.message, args.turn);
  const result = request
    ? await args.execute(request)
    : dynamicToolFailure('stale_or_invalid_tool_call');
  if (!args.isCurrent()) return;
  args.refreshTimeout();
  args.write({
    id: args.message.id,
    result: { contentItems: result.contentItems, success: result.success }
  });
}
