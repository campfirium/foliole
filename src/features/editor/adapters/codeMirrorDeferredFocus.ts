type FocusableView = { contentDOM: HTMLElement; focus: () => void };

function isEditable(view: FocusableView) {
  return view.contentDOM.getAttribute('contenteditable') === 'true';
}

// The browser ignores focus on a read-only editor, which is the state while a new document loads.
// Keep the request until the editor becomes editable, unless focus has moved elsewhere meanwhile.
export class CodeMirrorDeferredFocus {
  private origin: Element | null | undefined;

  constructor(private readonly getView: () => FocusableView) {}

  request() {
    const view = this.getView();
    if (isEditable(view)) {
      this.origin = undefined;
      view.focus();
      return;
    }
    this.origin = document.activeElement;
  }

  resolve() {
    const view = this.getView();
    if (this.origin === undefined || !isEditable(view)) return;
    const focusStayed = document.activeElement === this.origin || document.activeElement === document.body;
    this.origin = undefined;
    if (focusStayed) view.focus();
  }
}
