/* global document, window, queueMicrotask, requestAnimationFrame, URL */

function initializeEvidence() {
  const events = [];
  const state = { events, cleanup: [], sequence: 0 };
  state.capture = (phase, detail = {}) => {
    if (events.length >= 4000) return;
    const element = document.querySelector('[data-companion-readable-document] .cm-content');
    const view = element?.cmTile?.root?.view;
    const selected = window.getSelection();
    const selection = view?.state.selection.main;
    events.push({ at: Date.now(), phase, ...detail,
      editable: element?.getAttribute('contenteditable') ?? null,
      cm: selection ? { from: selection.from, to: selection.to,
        text: view.state.sliceDoc(selection.from, selection.to), length: view.state.doc.length } : null,
      dom: selected ? { text: selected.toString(), anchorOffset: selected.anchorOffset,
        focusOffset: selected.focusOffset, collapsed: selected.isCollapsed,
        insideEditor: Boolean(element?.contains(selected.anchorNode)) } : null });
  };
  globalThis.__syncTimingEditorEvidence = state;
  state.capture('installed');
}

function attachEditorEvents() {
  const state = globalThis.__syncTimingEditorEvidence;
  const types = ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'beforeinput', 'input', 'selectionchange', 'compositionstart', 'compositionupdate', 'compositionend'];
  const listener = event => {
    const detail = { key: event.key, ctrlKey: event.ctrlKey, inputType: event.inputType, trusted: event.isTrusted,
      data: event.data, composing: event.isComposing,
      target: event.target?.getAttribute?.('data-testid') ?? event.target?.nodeName };
    state.capture(event.type, detail);
    if (event.type === 'click' || event.type === 'keydown' || event.type === 'input') {
      queueMicrotask(() => state.capture(`${event.type}:microtask`, detail));
      requestAnimationFrame(() => state.capture(`${event.type}:frame`, detail));
    }
  };
  for (const type of types) document.addEventListener(type, listener, true);
  state.cleanup.push(() => { for (const type of types) document.removeEventListener(type, listener, true); });
}

function attachNativeEvents() {
  const state = globalThis.__syncTimingEditorEvidence;
  const capacitor = globalThis.Capacitor;
  if (!capacitor?.nativePromise) return;
  const original = capacitor.nativePromise;
  capacitor.nativePromise = function(plugin, method, options, ...rest) {
    const http = plugin === 'FolioleCompanionSync' && method === 'postRequestSyncHttp';
    const write = plugin === 'CapacitorSQLite' && ['run', 'execute', 'executeSet', 'commitTransaction'].includes(method);
    if (!http && !write) return original.call(this, plugin, method, options, ...rest);
    const detail = { call: ++state.sequence, plugin, method,
      request: http ? new URL(options.url).searchParams.get('request') : undefined };
    state.capture('native:start', detail);
    return original.call(this, plugin, method, options, ...rest).then(result => {
      state.capture('native:end', detail); return result;
    }, error => { state.capture('native:error', detail); throw error; });
  };
  state.cleanup.push(() => { capacitor.nativePromise = original; });
}

export async function observeTimingEditor(page) {
  await page.evaluate(initializeEvidence);
  await page.evaluate(attachEditorEvents);
  await page.evaluate(attachNativeEvents);
  return { close: () => page.evaluate(() => {
    const state = globalThis.__syncTimingEditorEvidence;
    for (const cleanup of state.cleanup.reverse()) cleanup();
    delete globalThis.__syncTimingEditorEvidence;
    return state.events;
  }) };
}
