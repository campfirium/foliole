import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { baseNode, documentPanelBodyMock, renderSectionWithProps } from './DocumentPanelSection.testSupport';

describe('DocumentPanelSection internal link hover preview', () => {
  it('shows and hides a hover preview panel for editor body wiki links', async () => {
    renderSectionWithProps({
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': { ...baseNode, content: 'See [[Linked note]].' },
        'node-2': {
          ...baseNode,
          id: 'node-2',
          title: 'Linked note',
          content: '# Linked note\n\nBody preview text.'
        }
      }
    });

    const bodyProps = documentPanelBodyMock.mock.calls.at(-1)?.[0] as {
      onPreviewNodeLink?: (request: {
        anchorRect: { bottom: number; height: number; left: number; right: number; top: number; width: number };
        title: string;
      } | null) => void;
    };
    expect(bodyProps.onPreviewNodeLink).toBeTypeOf('function');

    await act(async () => {
      bodyProps.onPreviewNodeLink?.({
        anchorRect: { bottom: 160, height: 24, left: 120, right: 220, top: 136, width: 100 },
        title: 'Linked note'
      });
    });

    expect(screen.getByLabelText('Linked topic preview')).toBeInTheDocument();
    expect(screen.getByText('Linked note')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('Body preview text.'))).toBeInTheDocument();

    await act(async () => {
      bodyProps.onPreviewNodeLink?.(null);
    });

    expect(screen.queryByLabelText('Linked topic preview')).not.toBeInTheDocument();
  });
});
