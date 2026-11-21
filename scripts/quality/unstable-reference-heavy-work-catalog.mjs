// Heavy-work catalog for the unstable-reference audit scanner.
// A rule matches the callee name (last identifier) or the full callee text of a call
// inside an effect, memo, or local helper reached from them. Matches are audit
// candidates, not defects; keep rules mechanism-shaped rather than one function name.

export const HEAVY_CALL_RULES = [
  {
    id: 'pdf-document',
    label: 'pdf.js document or page work',
    test: (name) =>
      /^(getDocument|getPage|getTextContent|getOperatorList|renderTextLayer)$/u.test(name)
  },
  {
    id: 'resource-load',
    label: 'attachment, resource, or document load',
    test: (name) =>
      /^(load|read|fetch|open|decode|import|hydrate|sync)\w*(Attachment|Resource|Asset|Blob|Image|Pdf|Epub|Media|File|Document|Article|Node|Source|Content|Body|Text|Progress)s?\w*$/u.test(
        name
      ) ||
      // resolve/ensure/prepare are usually pure lookups; only count them for binary resources.
      /^(resolve|ensure|prepare)\w*(Attachment|Resource|Asset|Blob|Pdf|Epub|Media|File)s?\w*$/u.test(
        name
      )
  },
  {
    id: 'snapshot-refresh',
    label: 'snapshot load or refresh',
    test: (name) => /^(load|read)\w*Snapshot\w*$/u.test(name) || /^refresh[A-Z]?\w*$/u.test(name)
  },
  {
    id: 'database',
    label: 'database query or command',
    test: (name, text) =>
      /(Database|FromDb|Sqlite|Sql)\w*$/u.test(name) ||
      /^(query|execute|executeSql|runQuery|select\w*From\w*)$/u.test(name) ||
      /\b(db|database|sqlite)\.\w+$/iu.test(text)
  },
  {
    id: 'native-or-network',
    label: 'native bridge or network request',
    test: (name, text) =>
      /^(invoke\w*|fetch|request|sendRequest|postMessage)$/u.test(name) ||
      /\b(Capacitor\.Plugins|ipcRenderer|nativeBridge|Native[A-Z]\w*)\.\w+/u.test(text)
  },
  {
    id: 'parse-or-digest',
    label: 'parse, render, or digest of a whole payload',
    test: (name) =>
      /^(parse|render|convert|extract|serialize|deserialize)(Epub|Pdf|Markdown|Html|Document|Math|Katex|Article|Book)\w*$/u.test(
        name
      ) || /^(createObjectURL|digest|sha256\w*|hash[A-Z]\w*|compress\w*|decompress\w*)$/u.test(name)
  }
];

// Whole-collection derivation. Reported in its own tier: cost grows with library size
// but is CPU-only, so judge it by the real collection behind the input.
export const COMPUTE_CALL_RULES = [
  {
    id: 'collection-compute',
    label: 'sort or whole-collection derivation',
    test: (name, text) =>
      /^(sort|toSorted|localeCompare|flatMap|reduce|filter)$/u.test(name) ||
      /^sort[A-Z]\w*$/u.test(name) ||
      /^(build|group|index|collect)\w*(ById|ByParent|Index|Tree|Rows)$/u.test(name) ||
      /^Object\.(values|entries)$/u.test(text)
  }
];

export const HEAVY_NEW_RULES = [
  { id: 'worker', label: 'new worker', test: (name) => /^(Worker|SharedWorker)$/u.test(name) },
  {
    id: 'pdf-text-layer',
    label: 'pdf.js text layer build',
    test: (name) => /^(TextLayer|PDFPageView)$/u.test(name)
  },
  { id: 'file-reader', label: 'file reader', test: (name) => name === 'FileReader' }
];

// Calls that look heavy by name but only read small values.
export const EXCLUDED_CALL_NAMES = new Set([
  'readNumber',
  'readString',
  'readBoolean',
  'readErrorMessage',
  'readEditorInputDiagnosticTime',
  'querySelector',
  'querySelectorAll',
  'requestAnimationFrame',
  'requestIdleCallback',
  'requestAppConfirmation'
]);

// Third-party components that put these props into their own effect or memo
// dependencies, so passing a new reference re-runs their internal heavy work.
// Verified against react-pdf 11.0.0 dist sources; re-check on upgrade. Document and Page
// deliberately omit onLoadSuccess/onLoadError from their effect deps, so those are not sinks.
export const THIRD_PARTY_HEAVY_PROPS = [
  {
    module: 'react-pdf',
    components: ['Document'],
    label: 'react-pdf Document reloads the PDF (loadSource/loadPdf deps)',
    props: /^(file|options)$/u
  },
  {
    module: 'react-pdf',
    components: ['Page', 'Thumbnail'],
    label: 'react-pdf text layer rebuild (TextLayer render effect deps)',
    props: /^(onRenderTextLayerSuccess|onRenderTextLayerError|customTextRenderer)$/u,
    // With renderTextLayer={false} react-pdf mounts no TextLayer; a custom child layer must be checked on its own.
    inactiveWhen: { renderTextLayer: 'false' }
  },
  {
    module: 'react-pdf',
    components: ['Page', 'Thumbnail'],
    label: 'react-pdf canvas/annotation layer redraw',
    props: /^(pageColors|canvasBackground|filterAnnotations)$/u
  }
];

// Calls verified to return the same reference while their inputs are unchanged.
// Each entry needs a reason; re-verify when the function changes.
export const REFERENCE_STABLE_CALLS = new Map([
  [
    'resolveCompanionBrowseSnapshot',
    'WeakMap cache keyed by nodesById returns the previous snapshot (2026-11-21)'
  ],
  [
    'normalizeWorkspaceContentSort',
    'returns the input sort object when its key is supported (2026-11-21)'
  ],
  [
    'resolveFolderManualChildOrder',
    'returns the stored manualChildOrder array of the folder node (2026-11-21)'
  ],
  ['get', 'Map/Set lookup returns the stored reference'],
  ['find', 'returns an existing element'],
  ['findLast', 'returns an existing element'],
  ['at', 'returns an existing element']
]);
