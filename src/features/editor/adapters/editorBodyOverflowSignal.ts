import type { EditorBodyOverflow } from './EditorAdapter';

export class EditorBodyOverflowSignal {
  private listeners = new Set<(request: EditorBodyOverflow) => void>();

  hasListeners() { return this.listeners.size > 0; }

  emit(request: EditorBodyOverflow) {
    this.listeners.forEach((listener) => listener(request));
  }

  clear() { this.listeners.clear(); }

  subscribe(listener: (request: EditorBodyOverflow) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}
