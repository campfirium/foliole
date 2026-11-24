import 'katex/dist/katex.min.css';

import katex from 'katex';
import { Check, Trash2, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';

import { createFormulaDomSelectionDescriptor } from '../features/editor/model/formulaDomSelection';
import type { FormulaClozePresentationRegion } from '../features/formula-cloze/model/formulaCloze';
import type { FormulaDomSelectionDescriptor, FormulaRegionRect } from '../features/nodes/model/nodeTypes';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';
import { AppDialog, AppDialogContent, AppDialogDescription, AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';

import { COMPANION_ANDROID_BACK_EVENT } from './companionAndroidBackEvent';

export interface CompanionFormulaClozeDraft { id: string; selection: FormulaDomSelectionDescriptor }

type Point = { x: number; y: number };
const MIN_DRAG = 6;
const FIT_MIN_EM = 0.8;
const FIT_MAX_EM = 2.4;

const boxOf = (element: HTMLElement): FormulaRegionRect => {
  const box = element.getBoundingClientRect();
  return { height: box.height, width: box.width, x: box.left, y: box.top };
};

function regionStyle(rect: FormulaRegionRect, state: 'saved' | 'draft' | 'selected'): CSSProperties {
  return {
    position: 'absolute', boxSizing: 'border-box', borderRadius: 4, pointerEvents: state === 'saved' ? 'none' : 'auto',
    left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
    ...(state === 'saved'
      ? { border: '2px dashed var(--role-accent)' }
      : { backgroundColor: 'color-mix(in srgb, var(--role-selection-surface) 55%, transparent)',
        border: `${state === 'selected' ? 3 : 2}px solid var(--role-accent)` })
  };
}

type Box = { left: number; top: number; width: number; height: number };

/** Renders the formula exactly as the article does, so the KaTeX leaf paths of a selection match on every device. */
function useRenderedFormula(tex: string, display: 'block' | 'inline') {
  // The dialog portal mounts its content after this component, so the formula host arrives through a callback ref.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(1);
  const [rootBox, setRootBox] = useState<Box | null>(null);
  const visualRoot = () => host?.querySelector<HTMLElement>('.katex-html') ?? null;
  useLayoutEffect(() => {
    if (!host) return;
    katex.render(tex, host, { displayMode: display === 'block', output: 'htmlAndMathml', strict: 'warn', throwOnError: false, trust: false });
    const fit = () => {
      const visual = host.querySelector<HTMLElement>('.katex-html');
      const width = frame.current?.clientWidth ?? 0;
      if (!visual || !width || !surface.current) return;
      const current = Number.parseFloat(surface.current.style.fontSize) || 1;
      const natural = visual.getBoundingClientRect().width / current;
      setFontSize(natural > 0 ? Math.max(FIT_MIN_EM, Math.min(FIT_MAX_EM, (width - 32) / natural)) : 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, [host, tex, display]);
  useLayoutEffect(() => {
    const root = host?.querySelector<HTMLElement>('.katex-html');
    const base = surface.current?.getBoundingClientRect();
    if (!root || !base) { setRootBox(null); return; }
    const box = root.getBoundingClientRect();
    setRootBox({ left: box.left - base.left, top: box.top - base.top, width: box.width, height: box.height });
  }, [host, tex, display, fontSize]);
  return { frame, surface, formula: setHost, fontSize, rootBox, visualRoot };
}

type EditorProps = {
  tex: string; display: 'block' | 'inline';
  savedRegions: FormulaClozePresentationRegion[];
  newId(): string;
  onCancel(): void;
  onConfirm(drafts: CompanionFormulaClozeDraft[]): Promise<void>;
};

/** One finger draws a box over the formula; the box keeps the KaTeX leaves it touches, as a desktop drag does. */
function useFormulaClozeDrafts(args: { locked: boolean; newId(): string; visualRoot(): HTMLElement | null; surface: RefObject<HTMLDivElement | null> }) {
  const [drafts, setDrafts] = useState<CompanionFormulaClozeDraft[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ start: Point; end: Point; pointerId: number } | null>(null);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (args.locked || drag || event.button > 0 || (event.target as Element).closest('[data-formula-draft]')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    setDrag({ start: point, end: point, pointerId: event.pointerId });
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    setDrag({ ...drag, end: { x: event.clientX, y: event.clientY } });
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const end = { x: event.clientX, y: event.clientY };
    setDrag(null);
    const root = args.visualRoot();
    const rect = { x: Math.min(drag.start.x, end.x), y: Math.min(drag.start.y, end.y),
      width: Math.abs(end.x - drag.start.x), height: Math.abs(end.y - drag.start.y) };
    if (event.type === 'pointercancel' || !root) return;
    if (rect.width < MIN_DRAG || rect.height < MIN_DRAG) { setSelected(null); return; }
    const selection = createFormulaDomSelectionDescriptor(root, rect, boxOf);
    if (!selection) return;
    const id = args.newId();
    setDrafts(current => [...current, { id, selection }]);
    setSelected(id);
  }
  const base = args.surface.current?.getBoundingClientRect();
  const dragRect = drag && base ? { left: Math.min(drag.start.x, drag.end.x) - base.left, top: Math.min(drag.start.y, drag.end.y) - base.top,
    width: Math.abs(drag.end.x - drag.start.x), height: Math.abs(drag.end.y - drag.start.y) } : null;
  return {
    drafts, selected, dragRect, handlers: { onPointerDown: begin, onPointerMove: move, onPointerUp: end, onPointerCancel: end },
    toggle: (id: string) => setSelected(current => current === id ? null : id),
    removeSelected: () => { setDrafts(current => current.filter(draft => draft.id !== selected)); setSelected(null); }
  };
}

function useFormulaClozeSave(props: EditorProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  useLayoutEffect(() => {
    const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); if (!busy.current) props.onCancel(); };
    document.addEventListener(COMPANION_ANDROID_BACK_EVENT, back, true);
    return () => { document.removeEventListener(COMPANION_ANDROID_BACK_EVENT, back, true); };
  }, [props.onCancel]);
  async function confirm(drafts: CompanionFormulaClozeDraft[]) {
    if (busy.current) return;
    if (!drafts.length) { props.onCancel(); return; }
    busy.current = true; setSaving(true); setError(false);
    try { await props.onConfirm(drafts); }
    catch { setError(true); }
    finally { busy.current = false; setSaving(false); }
  }
  return { saving, error, busy, confirm };
}

export function CompanionFormulaClozeEditor(props: EditorProps) {
  const t = useTranslation();
  const { frame, surface, formula, fontSize, rootBox, visualRoot } = useRenderedFormula(props.tex, props.display);
  const ready = rootBox !== null && rootBox.width > 0;
  const save = useFormulaClozeSave(props);
  const { drafts, selected, dragRect, handlers, toggle, removeSelected } = useFormulaClozeDrafts({ locked: save.saving || !ready, newId: props.newId, visualRoot, surface });
  return <AppDialog open onOpenChange={open => { if (!open && !save.busy.current) props.onCancel(); }}>
    <AppDialogPortal>
      <AppDialogContent aria-describedby="formula-cloze-instructions" className="flex flex-col !rounded-none !border-0 !bg-canvas"
        style={{ inset: 0, left: 0, top: 0, transform: 'none', translate: 'none', boxShadow: 'none', width: '100%', height: '100%', maxWidth: 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <header className="flex min-h-14 shrink-0 items-center justify-center px-3">
          <AppDialogTitle>{t('companion.formulaCloze.title')}</AppDialogTitle>
        </header>
        <AppDialogDescription id="formula-cloze-instructions" className="px-4 pb-3 text-sm">{t('companion.formulaCloze.help')}</AppDialogDescription>
        <div ref={frame} className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4">
          <div ref={surface} data-testid="formula-cloze-surface" className="relative touch-none select-none py-6" style={{ fontSize: `${fontSize}em` }} {...handlers}>
            <div ref={formula} />
            {rootBox ? <div data-testid="formula-cloze-regions" className="absolute" style={rootBox}>
              {props.savedRegions.map(region => <span key={region.id} data-formula-saved={region.id} style={regionStyle(region.fallbackRect, 'saved')} />)}
              {drafts.map((draft, index) => <button key={draft.id} type="button" data-formula-draft={draft.id}
                aria-label={t('companion.formulaCloze.region', { number: props.savedRegions.length + index + 1 })}
                aria-pressed={selected === draft.id} style={regionStyle(draft.selection.fallbackRect, selected === draft.id ? 'selected' : 'draft')}
                onClick={() => { if (!save.saving) toggle(draft.id); }} />)}
            </div> : null}
            {dragRect ? <span data-testid="formula-cloze-drag" className="pointer-events-none absolute" style={{ ...dragRect, border: '1px solid var(--role-accent)',
              backgroundColor: 'color-mix(in srgb, var(--role-selection-surface) 42%, transparent)', borderRadius: 4 }} /> : null}
          </div>
        </div>
        {save.error ? <p role="alert" className="px-4 text-sm text-error">{t('companion.formulaCloze.failed')}</p> : null}
        <footer className="flex shrink-0 items-center justify-center gap-4 px-3 py-3 [&_button]:min-h-11 [&_button]:min-w-11">
          <AppButton disabled={save.saving} onClick={props.onCancel} aria-label={t('common.cancel')} title={t('common.cancel')}><X aria-hidden="true" className="size-5" /></AppButton>
          <AppButton disabled={save.saving || !selected} aria-label={t('companion.formulaCloze.remove')} title={t('companion.formulaCloze.remove')}
            onClick={removeSelected}><Trash2 aria-hidden="true" className="size-5" /></AppButton>
          <AppButton disabled={save.saving || !ready} onClick={() => void save.confirm(drafts)} variant="emphasis" aria-label={t(save.saving ? 'companion.formulaCloze.saving' : 'companion.formulaCloze.confirm')} title={t('companion.formulaCloze.confirm')}><Check aria-hidden="true" className="size-5" /></AppButton>
        </footer>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
