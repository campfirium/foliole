const EDITOR_INPUT_DIAGNOSTIC_FLAG = '__FOLIOLE_EDITOR_INPUT_DIAG';
const EDITOR_INPUT_DIAGNOSTIC_CONSOLE_FLAG = '__FOLIOLE_EDITOR_INPUT_DIAG_CONSOLE';
const EDITOR_INPUT_DIAGNOSTIC_API = 'folioleEditorInputDiagnostics';
const EDITOR_INPUT_DIAGNOSTIC_MAX_RECORDS = 2000;
const EDITOR_INPUT_EVENT_LOOP_SAMPLE_MS = 50;
const EDITOR_INPUT_EVENT_LOOP_LAG_THRESHOLD_MS = 25;

type EditorInputDiagnosticGlobal = typeof globalThis & {
  __FOLIOLE_EDITOR_INPUT_DIAG?: boolean;
  __FOLIOLE_EDITOR_INPUT_DIAG_CONSOLE?: boolean;
  folioleEditorInputDiagnostics?: EditorInputDiagnosticApi;
};

export type EditorInputDiagnosticDetails = Record<string, boolean | number | string | null | undefined>;

type EditorInputDiagnosticRecord = {
  atMs: number;
  details: EditorInputDiagnosticDetails;
  event: string;
  line: string;
  sequence: number;
};

type EditorInputDiagnosticExport = {
  count: number;
  exportedAt: string;
  records: EditorInputDiagnosticRecord[];
};

type EditorInputDiagnosticApi = {
  clear: () => number;
  copy: () => Promise<string>;
  export: () => EditorInputDiagnosticExport;
  exportText: () => string;
  records: EditorInputDiagnosticRecord[];
  start: () => string;
  stop: () => string;
};

const editorInputDiagnosticRecords: EditorInputDiagnosticRecord[] = [];
let editorInputDiagnosticSequence = 0;
let eventLoopLagExpectedAtMs = 0;
let eventLoopLagTimer: ReturnType<typeof setTimeout> | null = null;
let editorInputLongTaskObserver: PerformanceObserver | null = null;

export function isEditorInputDiagnosticEnabled() {
  return (globalThis as EditorInputDiagnosticGlobal)[EDITOR_INPUT_DIAGNOSTIC_FLAG] === true;
}

export function readEditorInputDiagnosticTime() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function formatEditorInputDiagnosticDetails(details: EditorInputDiagnosticDetails) {
  return Object.entries(details)
    .map(([key, value]) => `${key}=${value ?? 'n/a'}`)
    .join(' ');
}

function setEditorInputDiagnosticEnabled(enabled: boolean) {
  (globalThis as EditorInputDiagnosticGlobal)[EDITOR_INPUT_DIAGNOSTIC_FLAG] = enabled;
}

function pushEditorInputDiagnosticRecord(event: string, line: string, details: EditorInputDiagnosticDetails) {
  editorInputDiagnosticSequence += 1;
  editorInputDiagnosticRecords.push({
    atMs: readEditorInputDiagnosticTime(),
    details,
    event,
    line,
    sequence: editorInputDiagnosticSequence
  });
  if (editorInputDiagnosticRecords.length > EDITOR_INPUT_DIAGNOSTIC_MAX_RECORDS) {
    editorInputDiagnosticRecords.splice(0, editorInputDiagnosticRecords.length - EDITOR_INPUT_DIAGNOSTIC_MAX_RECORDS);
  }
}

function stopEditorInputEventLoopMonitor() {
  if (eventLoopLagTimer !== null) {
    clearTimeout(eventLoopLagTimer);
    eventLoopLagTimer = null;
  }
}

function stopEditorInputLongTaskMonitor() {
  editorInputLongTaskObserver?.disconnect();
  editorInputLongTaskObserver = null;
}

function scheduleEditorInputEventLoopSample() {
  eventLoopLagExpectedAtMs = readEditorInputDiagnosticTime() + EDITOR_INPUT_EVENT_LOOP_SAMPLE_MS;
  eventLoopLagTimer = setTimeout(sampleEditorInputEventLoopLag, EDITOR_INPUT_EVENT_LOOP_SAMPLE_MS);
}

function sampleEditorInputEventLoopLag() {
  eventLoopLagTimer = null;
  if (!isEditorInputDiagnosticEnabled()) {
    return;
  }
  const now = readEditorInputDiagnosticTime();
  const lagMs = now - eventLoopLagExpectedAtMs;
  if (lagMs >= EDITOR_INPUT_EVENT_LOOP_LAG_THRESHOLD_MS) {
    logEditorInputDiagnostic('renderer-event-loop-lag', {
      lagMs,
      thresholdMs: EDITOR_INPUT_EVENT_LOOP_LAG_THRESHOLD_MS
    });
  }
  scheduleEditorInputEventLoopSample();
}

function startEditorInputEventLoopMonitor() {
  stopEditorInputEventLoopMonitor();
  scheduleEditorInputEventLoopSample();
}

function logEditorInputLongTask(entry: PerformanceEntry) {
  const attribution = (entry as PerformanceEntry & {
    attribution?: Array<{
      containerId?: string;
      containerName?: string;
      containerSrc?: string;
      containerType?: string;
      entryType?: string;
      name?: string;
    }>;
  }).attribution?.[0];
  logEditorInputDiagnostic('renderer-long-task', {
    attributionContainerId: attribution?.containerId,
    attributionContainerName: attribution?.containerName,
    attributionContainerSrc: attribution?.containerSrc,
    attributionContainerType: attribution?.containerType,
    attributionEntryType: attribution?.entryType,
    attributionName: attribution?.name,
    durationMs: entry.duration,
    name: entry.name,
    startTimeMs: entry.startTime
  });
}

function startEditorInputLongTaskMonitor() {
  stopEditorInputLongTaskMonitor();
  if (
    typeof PerformanceObserver === 'undefined' ||
    !PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    return;
  }
  editorInputLongTaskObserver = new PerformanceObserver((list) => {
    if (!isEditorInputDiagnosticEnabled()) {
      return;
    }
    for (const entry of list.getEntries()) {
      logEditorInputLongTask(entry);
    }
  });
  editorInputLongTaskObserver.observe({ entryTypes: ['longtask'] });
}

function createEditorInputDiagnosticExport(): EditorInputDiagnosticExport {
  return {
    count: editorInputDiagnosticRecords.length,
    exportedAt: new Date().toISOString(),
    records: [...editorInputDiagnosticRecords]
  };
}

function createEditorInputDiagnosticApi(): EditorInputDiagnosticApi {
  return {
    clear: () => {
      editorInputDiagnosticRecords.length = 0;
      return editorInputDiagnosticRecords.length;
    },
    copy: async () => {
      const text = JSON.stringify(createEditorInputDiagnosticExport(), null, 2);
      await navigator.clipboard.writeText(text);
      return text;
    },
    export: createEditorInputDiagnosticExport,
    exportText: () => JSON.stringify(createEditorInputDiagnosticExport(), null, 2),
    records: editorInputDiagnosticRecords,
    start: () => {
      editorInputDiagnosticRecords.length = 0;
      setEditorInputDiagnosticEnabled(true);
      startEditorInputEventLoopMonitor();
      startEditorInputLongTaskMonitor();
      return 'foliole editor input diagnostics started';
    },
    stop: () => {
      setEditorInputDiagnosticEnabled(false);
      stopEditorInputEventLoopMonitor();
      stopEditorInputLongTaskMonitor();
      return 'foliole editor input diagnostics stopped';
    }
  };
}

function ensureEditorInputDiagnosticApi() {
  const diagnosticGlobal = globalThis as EditorInputDiagnosticGlobal;
  if (!diagnosticGlobal[EDITOR_INPUT_DIAGNOSTIC_API]) {
    diagnosticGlobal[EDITOR_INPUT_DIAGNOSTIC_API] = createEditorInputDiagnosticApi();
  }
}

export function clearEditorInputDiagnostics() {
  return createEditorInputDiagnosticApi().clear();
}

export function copyEditorInputDiagnostics() {
  return createEditorInputDiagnosticApi().copy();
}

export function getEditorInputDiagnosticRecordCount() {
  return editorInputDiagnosticRecords.length;
}

export function startEditorInputDiagnostics() {
  return createEditorInputDiagnosticApi().start();
}

export function stopEditorInputDiagnostics() {
  return createEditorInputDiagnosticApi().stop();
}

export function logEditorInputDiagnostic(event: string, details: EditorInputDiagnosticDetails) {
  if (!isEditorInputDiagnosticEnabled()) {
    return;
  }
  const line = formatEditorInputDiagnosticDetails(details);
  pushEditorInputDiagnosticRecord(event, line, details);
  if ((globalThis as EditorInputDiagnosticGlobal)[EDITOR_INPUT_DIAGNOSTIC_CONSOLE_FLAG] === true) {
    console.info('[foliole-editor-input]', event, line, details);
  }
}

ensureEditorInputDiagnosticApi();
