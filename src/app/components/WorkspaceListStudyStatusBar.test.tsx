import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { WorkspaceListStudyStatusBar } from './WorkspaceListStudyStatusBar';

it('shows Flow queue progress without a separate due count', () => {
  render(
    <WorkspaceListStudyStatusBar
      isStudyMode
      reviewCompletedCount={3}
      reviewQueueCount={5}
      reviewStatus="awaiting-answer"
    />
  );

  expect(screen.getByText('Flow · 5 left · 3 done · Awaiting answer')).toBeInTheDocument();
  expect(screen.queryByText(new RegExp(['due', 'now'].join(' '), 'i'))).not.toBeInTheDocument();
});

it('stays hidden outside Flow mode', () => {
  render(
    <WorkspaceListStudyStatusBar
      isStudyMode={false}
      reviewCompletedCount={3}
      reviewQueueCount={5}
      reviewStatus="awaiting-answer"
    />
  );

  expect(screen.queryByText(/Flow ·/)).not.toBeInTheDocument();
});
