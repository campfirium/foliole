import {
  type WorkspaceSurfaceColorValue,
  withWorkspaceSurfaceAlpha,
  workspaceSurfaceColorFromHsl,
  workspaceSurfaceColorToHsl
} from '../../model/workspaceSurfaceColor';

export type WorkspaceSurfaceChannelMode = 'hex' | 'hsl' | 'rgb';

export type WorkspaceSurfaceEditorDraft = {
  alphaDraft: number;
  channelMode: WorkspaceSurfaceChannelMode;
  hslDraft: { h: number; l: number; s: number };
  rgbDraft: { b: number; g: number; r: number };
  setAlphaDraft: (value: number) => void;
  setChannelMode: (value: WorkspaceSurfaceChannelMode) => void;
  setHslDraft: (value: { h: number; l: number; s: number }) => void;
  setRgbDraft: (value: { b: number; g: number; r: number }) => void;
};

export function nextWorkspaceSurfaceChannelMode(current: WorkspaceSurfaceChannelMode) {
  if (current === 'hsl') {
    return 'rgb';
  }
  if (current === 'rgb') {
    return 'hex';
  }
  return 'hsl';
}

export function syncDraftsFromWorkspaceSurfaceColor(
  draft: WorkspaceSurfaceEditorDraft,
  color: WorkspaceSurfaceColorValue
) {
  draft.setHslDraft(workspaceSurfaceColorToHsl(color));
  draft.setRgbDraft({ b: color.b, g: color.g, r: color.r });
}

function clampChannel(value: number, max: number) {
  return Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function applyWorkspaceSurfaceRgbChannel(args: {
  channel: 'b' | 'g' | 'r';
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
  value: number;
}) {
  const nextRgb = { ...args.draft.rgbDraft, [args.channel]: clampChannel(args.value, 255) };
  args.draft.setRgbDraft(nextRgb);
  args.draft.setHslDraft(
    workspaceSurfaceColorToHsl({ a: args.draft.alphaDraft / 100, ...nextRgb })
  );
  args.onCommit(withWorkspaceSurfaceAlpha({ a: 1, ...nextRgb }, args.draft.alphaDraft));
}

export function applyWorkspaceSurfaceHslChannel(args: {
  channel: 'h' | 'l' | 's';
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
  value: number;
}) {
  const max = args.channel === 'h' ? 360 : 100;
  const nextHsl = { ...args.draft.hslDraft, [args.channel]: clampChannel(args.value, max) };
  args.draft.setHslDraft(nextHsl);
  const nextColor = workspaceSurfaceColorFromHsl({
    a: args.draft.alphaDraft / 100,
    h: nextHsl.h,
    l: nextHsl.l,
    s: nextHsl.s
  });
  args.draft.setRgbDraft({ b: nextColor.b, g: nextColor.g, r: nextColor.r });
  args.onCommit(nextColor);
}

export function applyWorkspaceSurfaceOpacity(args: {
  currentColor: WorkspaceSurfaceColorValue;
  draft: WorkspaceSurfaceEditorDraft;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
  value: number;
}) {
  const nextOpacity = clampChannel(args.value, 100);
  args.draft.setAlphaDraft(nextOpacity);
  args.onCommit(withWorkspaceSurfaceAlpha(args.currentColor, nextOpacity));
}
