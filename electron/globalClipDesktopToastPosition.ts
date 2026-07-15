import type { GlobalClipToastPosition } from './globalClipSettings.js';

export interface ToastWorkArea {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function resolveGlobalClipToastPoint(args: {
  gutter: number;
  margin: number;
  position: GlobalClipToastPosition;
  toastHeight: number;
  toastWidth: number;
  workArea: ToastWorkArea;
}) {
  const { workArea } = args;
  return {
    x: workArea.x + workArea.width - args.toastWidth - args.margin - args.gutter,
    y: args.position === 'top-right'
      ? workArea.y + args.margin - args.gutter
      : workArea.y + workArea.height - args.toastHeight - args.margin - args.gutter
  };
}
