interface Candidate {
  count: number;
  cleanup(): Promise<unknown>;
}

/** Transfer declarations produced by adoption until a fresh fixed-view comparison is empty. */
export async function completeSyncIdentityExchange<T extends Candidate>(args: {
  initial: T;
  probe(): Promise<T>;
  receive(candidate: T): Promise<number>;
  send(candidate: T): Promise<number>;
}) {
  let current = args.initial;
  let owned = false;
  try {
    while (current.count > 0) {
      const received = await args.receive(current);
      const outbound = received > 0 ? await args.probe() : current;
      let sent: number;
      try { sent = await args.send(outbound); }
      finally { if (outbound !== current) await outbound.cleanup(); }
      if (received + sent === 0) throw new Error('sync_identity_round_incomplete');
      if (owned) await current.cleanup();
      owned = false;
      current = await args.probe();
      owned = true;
    }
    return current;
  } catch (error) {
    if (owned) await current.cleanup();
    throw error;
  }
}
