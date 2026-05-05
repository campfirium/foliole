import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: () => <div data-testid="source-update-pane" />
}));

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

describe('DocumentSourceUpdatePanel integration', () => {
  it('renders the live two-pane comparison without crashing', () => {
    render(
      <MouseGestureSettingsProvider>
        <DocumentSourceUpdatePanel
          currentContent={'# Title\n\nSame\nLeft only\nEnd'}
          currentNodeId="node-1"
          documentMaxWidth={760}
          editorAppearanceKey="appearance-1"
          onCurrentContentChange={() => undefined}
          onOpenChange={() => undefined}
          open
          updatedContent={'# Title\n\nSame\nRight only\nEnd'}
        />
      </MouseGestureSettingsProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Updated Source')).toBeInTheDocument();
    expect(screen.getAllByTestId('source-update-pane')).toHaveLength(2);
  });
});
