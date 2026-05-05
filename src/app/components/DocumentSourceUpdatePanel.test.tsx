import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

const { documentPanelBodyMock } = vi.hoisted(() => ({
  documentPanelBodyMock: vi.fn((props: unknown) => {
    void props;
    return <div data-testid="document-panel-body" />;
  })
}));

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: (props: unknown) => {
    documentPanelBodyMock(props);
    return <div data-testid="document-panel-body" />;
  }
}));

describe('DocumentSourceUpdatePanel', () => {
  it('renders both sides with the same document surface and keeps the right side read-only', () => {
    render(
      <DocumentSourceUpdatePanel
        currentContent={'alpha\nbeta'}
        currentNodeId="node-1"
        documentMaxWidth={760}
        editorAppearanceKey="appearance-1"
        onCurrentContentChange={() => undefined}
        onOpenChange={() => undefined}
        open
        updatedContent={'alpha\ngamma'}
      />
    );

    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        editorAppearanceKey: 'appearance-1-source-update-current',
        editorContent: 'alpha\nbeta',
        editorNodeId: 'node-1',
        readOnly: undefined
      })
    );
    expect(documentPanelBodyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        editorAppearanceKey: 'appearance-1-source-update-reference',
        editorContent: 'alpha\ngamma',
        editorNodeId: null,
        readOnly: true
      })
    );
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(2);
  });

  it('shows the revised panel copy that matches the main document framing', () => {
    render(
      <DocumentSourceUpdatePanel
        currentContent={'first\nsecond\nfourth'}
        currentNodeId="node-1"
        documentMaxWidth={760}
        editorAppearanceKey="appearance-1"
        onCurrentContentChange={() => undefined}
        onOpenChange={() => undefined}
        open
        updatedContent={'first\nsecond\nthird\nfourth changed'}
      />
    );

    expect(
      screen.getByText('This side keeps the same reading and editing feel as the main document, but scrolls independently inside the panel.')
    ).toBeInTheDocument();
    expect(screen.getByText('This side uses the same document rendering, but stays read-only.')).toBeInTheDocument();
  });
});
