import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

it('shows an error when the selected highlights topic is unavailable', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="missing-topic"
      nodeOrder={[]}
      nodesById={{}}
      onRevealHighlight={() => undefined}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Topic unavailable');
});
