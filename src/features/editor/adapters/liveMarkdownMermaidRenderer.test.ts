import { expect, it, vi } from 'vitest';

const { load, initialize, render } = vi.hoisted(() => ({
  load: vi.fn(),
  initialize: vi.fn(),
  render: vi.fn(async () => ({ svg: '<svg></svg>' }))
}));

vi.mock('mermaid', () => {
  load();
  return { default: { initialize, render } };
});

it('loads the diagram engine only when rendering and preserves strict theme initialization', async () => {
  const { renderMermaidSvg } = await import('./liveMarkdownMermaidRenderer');
  expect(load).not.toHaveBeenCalled();

  await expect(renderMermaidSvg('first', 'graph TD; A-->B')).resolves.toEqual({ svg: '<svg></svg>' });
  await renderMermaidSvg('second', 'graph TD; B-->C');

  expect(load).toHaveBeenCalledTimes(1);
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
    htmlLabels: false,
    securityLevel: 'strict',
    startOnLoad: false
  }));
  expect(render).toHaveBeenLastCalledWith('second', 'graph TD; B-->C');
});
