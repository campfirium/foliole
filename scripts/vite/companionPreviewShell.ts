import { capturePreviewRestoreTarget } from './companionPreviewReadiness';
import { captureCompanionPreview } from './companionPreviewSnapshot';
import { createCompanionPreviewStatusBar } from './companionPreviewStatusBar';
import { fitCompanionPreviewViewport } from './companionPreviewViewport';

export interface CompanionPreviewShell {
  beforeReload(source: Window): Promise<void>;
  failed(source: Window, message: string): void;
  ready(source: Window): void;
}

declare global {
  interface Window {
    __foliolePreviewShell?: CompanionPreviewShell;
    __foliolePreviewClose?: () => Promise<void>;
  }
}

function createShellElements(document: Document) {
  const frame = document.createElement('iframe');
  frame.title = 'Companion preview';
  const frozen = document.createElement('iframe');
  frozen.title = 'Previous preview';
  frozen.setAttribute('sandbox', 'allow-same-origin');
  frozen.inert = true;
  frozen.hidden = true;
  const overlay = document.createElement('div');
  overlay.className = 'preview-update';
  overlay.hidden = true;
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.hidden = true;
  overlay.append(status, retry);
  const viewport = document.createElement('div');
  viewport.className = 'preview-viewport';
  const content = document.createElement('div');
  content.className = 'preview-content';
  content.append(frame, frozen, overlay);
  document.body.append(viewport);
  viewport.append(createCompanionPreviewStatusBar(document), content);
  return { frame, frozen, overlay, status, retry, viewport };
}

type ShellElements = ReturnType<typeof createShellElements>;
class PreviewTransition implements CompanionPreviewShell {
  private phase: 'ready' | 'updating' | 'failed' = 'ready';
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private isRestored: (document: Document) => boolean = () => true;
  private previousDocument: Document | null = null;
  private capture: Promise<void> | null = null;
  constructor(private readonly elements: ShellElements, private readonly timeoutMs: number) {}

  private belongs(source: Window) { return source === this.elements.frame.contentWindow; }
  private hasFailed() { return this.phase === 'failed'; }

  failed(source: Window, message: string) {
    if (!this.belongs(source) || this.phase !== 'updating') return;
    this.phase = 'failed';
    this.dispose();
    this.elements.status.textContent = `Update failed. ${message}`;
    this.elements.retry.hidden = false;
    this.elements.overlay.classList.remove('is-updating');
  }

  private start() {
    this.phase = 'updating';
    const { frame, overlay, retry, status } = this.elements;
    frame.inert = true;
    overlay.hidden = false;
    retry.hidden = true;
    status.textContent = 'Updating…';
    overlay.classList.add('is-updating');
    this.dispose();
    this.deadline = setTimeout(() => {
      if (frame.contentWindow) this.failed(frame.contentWindow, 'The page did not become ready.');
    }, this.timeoutMs);
  }

  async beforeReload(source: Window) {
    if (!this.belongs(source)) throw new Error('Unknown preview document.');
    if (this.phase === 'failed') throw new Error('Preview update needs a manual retry.');
    if (this.phase === 'updating') {
      this.previousDocument = source.document;
      await this.capture;
      return;
    }
    this.start();
    const { frame, frozen } = this.elements;
    try {
      if (!frame.contentDocument || !frozen.contentDocument) throw new Error('Preview document is unavailable.');
      this.previousDocument = frame.contentDocument;
      this.isRestored = capturePreviewRestoreTarget(frame.contentDocument);
      this.capture = captureCompanionPreview(frame.contentDocument, frozen.contentDocument);
      await this.capture;
      if (this.hasFailed()) throw new Error('Preview update needs a manual retry.');
      frozen.hidden = false;
      frame.style.visibility = 'hidden';
    } catch (error) {
      this.failed(source, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  ready(source: Window) {
    if (!this.belongs(source) || this.phase === 'failed') return;
    if (this.phase === 'updating' && source.document === this.previousDocument) return;
    if (!this.isRestored(source.document)) return;
    this.dispose();
    this.phase = 'ready';
    const { frame, frozen, overlay } = this.elements;
    frame.inert = false;
    frame.style.visibility = '';
    frozen.hidden = true;
    overlay.hidden = true;
  }

  async retry() {
    this.start();
    const source = this.elements.frame.contentWindow;
    if (!source) return;
    this.previousDocument = source.document;
    try {
      const { frame, frozen } = this.elements;
      if (frozen.hidden) {
        await captureCompanionPreview(source.document, frozen.contentDocument!);
        frozen.hidden = false;
        frame.style.visibility = 'hidden';
      }
      await source.__foliolePreviewClose?.();
      source.location.reload();
    } catch (error) {
      this.failed(source, error instanceof Error ? error.message : String(error));
    }
  }

  dispose() { clearTimeout(this.deadline); }
}

export function mountCompanionPreviewShell(document: Document, timeoutMs = 30_000) {
  const elements = createShellElements(document);
  const stopFitting = fitCompanionPreviewViewport(elements.viewport);
  const shell = new PreviewTransition(elements, timeoutMs);
  elements.retry.addEventListener('click', () => void shell.retry());
  document.defaultView!.__foliolePreviewShell = shell;
  const url = new URL(document.URL);
  url.searchParams.set('__foliole_preview_frame', '1');
  elements.frame.src = url.href;
  return { ...elements, shell, dispose: () => { shell.dispose(); stopFitting(); } };
}

if (typeof document !== 'undefined' && document.body.dataset.companionPreviewShell === 'true')
  mountCompanionPreviewShell(document);
