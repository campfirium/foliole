import { extractDocumentOutline } from '../../features/editor/model/documentOutline';

const HOVER_ZONE_WIDTH_PX = 72;
const OUTLINE_RIGHT_GAP_RATIO = 0.1;

export interface OutlineDisplayItem {
  from: number;
  level: number;
  text: string;
  to: number;
}

export interface OutlineHorizontalMetrics {
  panelRight: number;
  panelWidth: number;
}

export function resolveOutlineHorizontalMetrics(
  containerWidth: number,
  documentMaxWidth: number
): OutlineHorizontalMetrics {
  const visibleDocumentWidth = Math.min(containerWidth, documentMaxWidth);
  const splitterOffset = Math.max(0, (containerWidth - visibleDocumentWidth) / 2 - 5);
  const panelRight = splitterOffset * OUTLINE_RIGHT_GAP_RATIO;
  const panelWidth = Math.max(0, splitterOffset - panelRight);

  return {
    panelRight,
    panelWidth
  };
}

export function getOutlineLayerWidth(horizontalMetrics: OutlineHorizontalMetrics, isOpen: boolean) {
  if (!isOpen) {
    return HOVER_ZONE_WIDTH_PX;
  }
  return Math.max(HOVER_ZONE_WIDTH_PX, horizontalMetrics.panelWidth + horizontalMetrics.panelRight + HOVER_ZONE_WIDTH_PX);
}

export function resolveDisplayItems(content: string): OutlineDisplayItem[] {
  const visibleItems = extractDocumentOutline(content).slice(1);
  const baseLevel = visibleItems.reduce((minLevel, item) => Math.min(minLevel, item.level), Number.POSITIVE_INFINITY);

  return visibleItems.map((item) => ({
    ...item,
    level: Math.max(1, item.level - baseLevel + 1)
  }));
}

export function mayHaveOutline(content: string) {
  return /^\s{0,3}(?:#{1,6}[ \t]+|\*\*#{1,6}[ \t]+\S.*\*\*\s*$)/m.test(content);
}

export function resolveActiveIndex(items: OutlineDisplayItem[], anchorPosition: number) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && anchorPosition >= item.from) {
      return index;
    }
  }
  return 0;
}

export function resolvePanelScrollTop(anchorY: number, activeTop: number, panelHeight: number, scrollHeight: number) {
  const maxScrollTop = Math.max(0, scrollHeight - panelHeight);
  return Math.max(0, Math.min(maxScrollTop, activeTop - anchorY));
}

export function resolvePanelSlack(panelHeight: number) {
  return panelHeight;
}
