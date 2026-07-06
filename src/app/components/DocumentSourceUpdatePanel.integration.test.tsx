import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: () => <div data-testid="source-update-pane" />
}));

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

describe('DocumentSourceUpdatePanel integration', () => {
  it('renders the live two-pane comparison without crashing', () => {
    renderWithLocalization(
      <MouseGestureSettingsProvider>
        <DocumentSourceUpdatePanel
          currentContent={'# Title\n\nSame\nLeft only\nEnd'}
          currentHighlightCount={1}
          currentNodeId="node-1"
          documentMaxWidth={760}
          editorAppearanceKey="appearance-1"
          onCurrentContentChange={() => undefined}
          onOpenChange={() => undefined}
          open
          updatedHighlightCount={2}
          updatedContent={'# Title\n\nSame\nRight only\nEnd'}
        />
      </MouseGestureSettingsProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(screen.getByText('Incoming update')).toBeInTheDocument();
    expect(screen.getByText('Incoming')).toBeInTheDocument();
    expect(screen.getAllByTestId('source-update-pane')).toHaveLength(2);
  });
});
