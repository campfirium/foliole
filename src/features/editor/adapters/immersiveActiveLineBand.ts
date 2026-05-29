import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const ACTIVE_LINE_BAND_CLASS = 'cm-immersive-active-line-band';

function createBandElement() {
  const element = document.createElement('div');
  element.className = ACTIVE_LINE_BAND_CLASS;
  return element;
}

function updateBandGeometry(view: EditorView, element: HTMLElement) {
  const host = view.dom.closest('.markdown-editor-host');
  element.style.display = host?.getAttribute('data-immersive-editing') === 'true' ? 'block' : 'none';
  const line = view.lineBlockAt(view.state.selection.main.head);
  element.style.height = `${line.height}px`;
  element.style.top = `${line.top}px`;
}

const immersiveActiveLineBandPlugin = ViewPlugin.fromClass(
  class {
    private readonly element = createBandElement();
    private readonly hostObserver: MutationObserver | null;

    constructor(view: EditorView) {
      view.scrollDOM.insertBefore(this.element, view.contentDOM);
      this.hostObserver = createHostObserver(view, this.element);
      updateBandGeometry(view, this.element);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.geometryChanged || update.selectionSet || update.viewportChanged) {
        updateBandGeometry(update.view, this.element);
      }
    }

    destroy() {
      this.hostObserver?.disconnect();
      this.element.remove();
    }
  }
);

function createHostObserver(view: EditorView, element: HTMLElement) {
  const host = view.dom.closest('.markdown-editor-host');
  if (!host) {
    return null;
  }
  const observer = new MutationObserver(() => updateBandGeometry(view, element));
  observer.observe(host, { attributeFilter: ['data-immersive-editing'], attributes: true });
  return observer;
}

const immersiveActiveLineBandTheme = EditorView.theme({
  [`.${ACTIVE_LINE_BAND_CLASS}`]: {
    backgroundColor: 'rgb(var(--color-foreground) / 0.06)',
    bottom: 'auto',
    display: 'none',
    left: '0',
    pointerEvents: 'none',
    position: 'absolute',
    right: '0',
    zIndex: '0'
  },
  '.cm-content': {
    position: 'relative',
    zIndex: '1'
  },
  '.markdown-editor-host[data-immersive-editing="true"] & .cm-activeLine': {
    backgroundColor: 'transparent !important'
  }
});

export const immersiveActiveLineBand = [immersiveActiveLineBandTheme, immersiveActiveLineBandPlugin];
