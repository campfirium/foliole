interface ParentChannel {
  disconnect?: () => void;
  send?: (message: unknown, callback: (error: Error | null) => void) => boolean;
}

// Disconnecting right after send drops any part of the message still queued on the pipe,
// so a book whose result exceeds the pipe buffer would reach the parent as no result at all.
export function replyThenDisconnect(message: unknown, channel: ParentChannel = process) {
  if (!channel.send) {
    channel.disconnect?.();
    return;
  }
  channel.send(message, () => channel.disconnect?.());
}
