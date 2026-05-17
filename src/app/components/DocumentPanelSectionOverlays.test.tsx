import { expect, it } from 'vitest';

import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import { resolveAdjustableHighlight } from './DocumentPanelSectionOverlays';

function createProps(locator: { from: number; originalText: string; to: number }) {
  return {
    contextMenu: {
      canRunCommands: true,
      existingHighlight: {
        canAdjustRange: true,
        kind: 'highlight',
        locator: { from: 6, originalText: 'old', to: 9 },
        nodeId: 'highlight-1',
        originalText: 'old'
      },
      kind: 'selection',
      left: 0,
      mode: 'existing-highlight-toolbar',
      notePanelLeft: 0,
      notePanelTop: 0,
      payload: null,
      top: 0
    },
    nodesById: {
      'highlight-1': {
        anchorLink: {
          id: 'anchor-1',
          kind: 'highlight',
          locator
        },
        id: 'highlight-1'
      }
    }
  } as unknown as DocumentPanelSectionProps;
}

it('derives adjustable highlight locator from the current child node instead of the toolbar snapshot', () => {
  const highlight = resolveAdjustableHighlight(createProps({ from: 0, originalText: 'Alpha', to: 5 }));

  expect(highlight).toEqual(expect.objectContaining({
    locator: { from: 0, originalText: 'Alpha', to: 5 },
    nodeId: 'highlight-1',
    originalText: 'Alpha'
  }));
});
