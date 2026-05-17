import type { MarkdownImageMatch } from '../model/markdownImageMatches';

export interface MarkdownImageStatusActions {
  canRetryFromSource?: boolean;
  onContextMenu?: ((event: MouseEvent, anchor: HTMLElement) => void) | null;
  onDismissHint?: (() => void) | null;
  onDismissHintPermanently?: (() => void) | null;
  onRetry?: (() => void) | null;
  showRecoveryHint?: boolean;
}

export function createImageStatusElement(
  status: 'loading' | 'unavailable',
  display: MarkdownImageMatch['display'],
  actions: MarkdownImageStatusActions = {}
) {
  const element = document.createElement('span');
  element.className = display === 'inline' ? 'cm-md-image-status cm-md-image-status-inline' : 'cm-md-image-status cm-md-image-status-block';
  element.dataset.mdImageStatus = status;
  if (status === 'loading') {
    element.textContent = '';
    return element;
  }

  const label = document.createElement('span');
  label.className = 'cm-md-image-status-label';
  label.textContent = "Image couldn't load";
  element.append(label);
  if (display === 'inline') {
    return element;
  }
  if (actions.onContextMenu) {
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      actions.onContextMenu?.(event, element);
    });
  }

  const controls = document.createElement('span');
  controls.className = 'cm-md-image-status-actions';
  if (actions.canRetryFromSource && actions.onRetry) {
    controls.append(createStatusAction('Retry', actions.onRetry));
  }
  element.append(controls);
  if (actions.showRecoveryHint) {
    element.append(createRecoveryHint(actions));
  }
  return element;
}

function createRecoveryHint(actions: MarkdownImageStatusActions) {
  const hint = document.createElement('span');
  hint.className = 'cm-md-image-recovery-hint';
  const text = document.createElement('span');
  text.textContent = 'Use the image menu to provide the source website.';
  hint.append(text);
  hint.append(
    createStatusAction('Dismiss', () => {
      actions.onDismissHint?.();
      hint.remove();
    }),
    createStatusAction("Don't show again", () => {
      actions.onDismissHintPermanently?.();
      hint.remove();
    })
  );
  return hint;
}

function createStatusAction(label: string, onClick: () => void) {
  const action = document.createElement('button');
  action.className = 'cm-md-image-status-action';
  action.type = 'button';
  action.textContent = label;
  action.addEventListener('click', onClick);
  return action;
}
