import { getDevanagariSelectionMode } from './androidDevanagariSelectionMode';

const capacity = 512;
const eventKinds = ['selection', 'clear', 'editor-update', 'blur', 'normalize', 'payload', 'collapse', 'extend',
  'removeAllRanges', 'setBaseAndExtent', 'action-create', 'action-destroy'] as const;
type EventKind = typeof eventKinds[number];
type TraceEvent = { kind: EventKind; at: number; until: number; count: number; fields: number[] };
type Capture = ReturnType<typeof createCapture>;

let capture: Capture | undefined;
let nodeIds = new WeakMap<Node, number>();
let nextNodeId = 0;
let restoreSelection: (() => void) | undefined;
const nativeEvent = 'foliole-android-selection-action';

function createCapture(mode: 'off' | 'annotation') {
  return {
    startedAt: Date.now(), mode, build: import.meta.env.VITE_FOLIOLE_SOURCE_REVISION ?? 'unidentified',
    webView: navigator.userAgent.match(/Chrome\/([\d.]+)/u)?.[1] ?? null,
    android: navigator.userAgent.match(/Android ([\d.]+)/u)?.[1] ?? null,
    dropped: 0, events: [] as TraceEvent[]
  };
}

export function isAndroidSelectionTraceActive() { return capture !== undefined; }

export function traceAndroidSelection(kind: EventKind, fields: number[] = [], occurredAt = Date.now()) {
  if (!capture || !eventKinds.includes(kind) || !validFields(fields) || !Number.isFinite(occurredAt)) return;
  const at = Math.round(occurredAt - capture.startedAt);
  if (at < 0 || at > 300_000) return;
  const events = capture.events;
  const last = events.at(-1);
  if (last?.kind === kind && at >= last.until && last.fields.length === fields.length && last.fields.every((field, index) => field === fields[index])) {
    last.until = at;
    last.count++;
    return;
  }
  if (events.length === capacity) {
    events.shift();
    capture.dropped++;
  }
  events.push({ kind, at, until: at, count: 1, fields });
}

function validFields(fields: unknown): fields is number[] {
  return Array.isArray(fields) && fields.length <= 20 && fields.every(Number.isSafeInteger);
}

function describeEndpoint(node: Node | null, offset: number, owns: (node: Node) => boolean) {
  if (!node) return [0, 0, 0, 0, offset];
  let id = nodeIds.get(node);
  if (!id) {
    id = ++nextNodeId;
    nodeIds.set(node, id);
  }
  return [id, node.nodeType, Number(node.isConnected), Number(owns(node)), offset];
}

export function traceAndroidSelectionSnapshot(owns: (node: Node) => boolean, from: number, to: number) {
  if (!capture) return;
  const selection = window.getSelection();
  if (!selection) return;
  let rects = 0;
  for (let index = 0; index < selection.rangeCount; index++) {
    rects += selection.getRangeAt(index).getClientRects?.().length ?? 0;
  }
  const text = selection.toString();
  traceAndroidSelection('selection', [
    ...describeEndpoint(selection.anchorNode, selection.anchorOffset, owns),
    ...describeEndpoint(selection.focusNode, selection.focusOffset, owns),
    from, to, selection.rangeCount, rects, Number(selection.isCollapsed), [...text].length, Number(/\p{Script=Devanagari}/u.test(text))
  ]);
}

function observeSelectionWrites(selection: Selection | null) {
  if (!selection) return undefined;
  const methods = ['collapse', 'extend', 'removeAllRanges', 'setBaseAndExtent'] as const;
  const descriptors = methods.map(method => Object.getOwnPropertyDescriptor(selection, method));
  const original = {
    collapse: selection.collapse, extend: selection.extend, removeAllRanges: selection.removeAllRanges,
    setBaseAndExtent: selection.setBaseAndExtent
  };
  selection.collapse = (...args) => { original.collapse.apply(selection, args); traceAndroidSelection('collapse'); };
  selection.extend = (...args) => { original.extend.apply(selection, args); traceAndroidSelection('extend'); };
  selection.removeAllRanges = () => { original.removeAllRanges.call(selection); traceAndroidSelection('removeAllRanges'); };
  selection.setBaseAndExtent = (...args) => {
    original.setBaseAndExtent.apply(selection, args);
    traceAndroidSelection('setBaseAndExtent');
  };
  return () => methods.forEach((method, index) => {
    const descriptor = descriptors[index];
    if (descriptor) Object.defineProperty(selection, method, descriptor);
    else Reflect.deleteProperty(selection, method);
  });
}

function acceptNativeAction(event: Event) {
  const { phase, created, occurredAt } = (event as CustomEvent<{ phase: string; created: boolean; occurredAt: number }>).detail ?? {};
  if (phase === 'destroy') traceAndroidSelection('action-destroy', [], occurredAt);
  if (phase === 'create' && typeof created === 'boolean') traceAndroidSelection('action-create', [Number(created)], occurredAt);
}

export function startAndroidSelectionTrace() {
  const mode = getDevanagariSelectionMode();
  if (!mode) return;
  capture = createCapture(mode);
  nodeIds = new WeakMap();
  nextNodeId = 0;
  restoreSelection = observeSelectionWrites(window.getSelection());
  document.addEventListener(nativeEvent, acceptNativeAction);
}

export function stopAndroidSelectionTrace() {
  const report = capture;
  capture = undefined;
  restoreSelection?.();
  restoreSelection = undefined;
  if (report) document.removeEventListener(nativeEvent, acceptNativeAction);
  return report;
}

export function validateAndroidSelectionTrace(report: unknown): report is Capture {
  if (!report || typeof report !== 'object') return false;
  const value = report as Capture;
  return Object.keys(value).length === 7 && ['off', 'annotation'].includes(value.mode)
    && Number.isSafeInteger(value.startedAt) && Number.isSafeInteger(value.dropped) && value.dropped >= 0
    && /^(?:[a-f0-9]{40}|unidentified)$/u.test(value.build)
    && [value.webView, value.android].every(version => version === null || typeof version === 'string' && /^[\d.]{1,32}$/u.test(version))
    && Array.isArray(value.events) && value.events.length <= capacity && value.events.every(event =>
      event && Object.keys(event).length === 5 && eventKinds.includes(event.kind) && validFields(event.fields)
      && [event.at, event.until].every(time => Number.isSafeInteger(time) && time >= 0 && time <= 300_000)
      && Number.isSafeInteger(event.count) && event.count > 0);
}
