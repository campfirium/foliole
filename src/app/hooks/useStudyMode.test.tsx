import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { useStudyMode } from './useStudyMode';

function Probe() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const study = useStudyMode({ activeNodeId, isViewingTrashNode });
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
      <button onClick={() => setActiveNodeId(null)} type="button">
        delete current node
      </button>
      <button onClick={() => setIsViewingTrashNode(true)} type="button">
        open trash
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

it('keeps an active review session when the current node is deleted', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  act(() => screen.getByRole('button', { name: 'delete current node' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('on');
});

it('exits review mode when trash view opens', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  act(() => screen.getByRole('button', { name: 'open trash' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('off');
});
