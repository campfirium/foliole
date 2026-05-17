import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { useStudyMode } from './useStudyMode';

function Probe() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const study = useStudyMode({ activeNodeId, isViewingTrashNode: false });
  return (
    <>
      <div data-testid="mode">{study.isStudyMode ? 'on' : 'off'}</div>
      <button onClick={() => study.startStudyMode()} type="button">
        guarded
      </button>
      <button
        onClick={() => {
          setActiveNodeId('due-node');
          study.startStudyMode({ force: true });
        }}
        type="button"
      >
        forced
      </button>
    </>
  );
}

it('keeps guarded starts blocked without a current node but allows forced review starts', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'guarded' }).click());
  expect(screen.getByTestId('mode')).toHaveTextContent('off');

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  expect(screen.getByTestId('mode')).toHaveTextContent('on');
});
