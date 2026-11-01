export interface EditorTextReplaySave {
  readonly requestId: string;
  readonly completion: Promise<boolean>;
  readonly status: 'unbound' | 'saving' | 'failed' | 'saved' | 'rejected';
  confirm: (saved: boolean) => void;
  retry: () => void;
  submit: (persist: () => Promise<boolean>) => void;
  reject: () => void;
}

/** The completion belongs to this replay, including retries of its unchanged save. */
export function createEditorTextReplaySave(onFailure: (retry: () => void) => void): EditorTextReplaySave {
  let status: EditorTextReplaySave['status'] = 'unbound';
  let resolve!: (saved: boolean) => void;
  const completion = new Promise<boolean>(done => { resolve = done; });
  let persist: (() => Promise<boolean>) | null = null;
  const confirmSave = (saved: boolean) => {
    if (status === 'saved' || status === 'rejected') return;
    if (saved) { status = 'saved'; resolve(true); }
    else if (status !== 'failed') { status = 'failed'; onFailure(() => { void attempt(); }); }
  };
  const attempt = async () => {
    if (!persist || status === 'saving' || status === 'saved' || status === 'rejected') return;
    status = 'saving';
    try { confirmSave(await persist()); } catch { confirmSave(false); }
  };
  return {
    requestId: crypto.randomUUID(),
    completion,
    confirm: confirmSave,
    retry: () => { void attempt(); },
    get status() { return status; },
    submit(save) {
      if (persist || status !== 'unbound') throw new Error('text_replay_save_already_bound');
      persist = save;
      void attempt();
    },
    reject() {
      if (status !== 'unbound') return;
      status = 'rejected';
      resolve(false);
    }
  };
}
