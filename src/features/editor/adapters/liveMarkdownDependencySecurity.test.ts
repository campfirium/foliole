import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const requireDependency = createRequire(import.meta.url);
const requireMermaidDependency = createRequire(requireDependency.resolve('mermaid'));
const createDOMPurify = requireMermaidDependency('dompurify');

describe('diagram sanitizer dependency security', () => {
  it.each([
    'beforeSanitizeElements',
    'uponSanitizeElement',
    'afterSanitizeElements',
    'afterSanitizeAttributes'
  ] as const)('neutralizes detached descendants after %s', (hookName) => {
    const purifier = createDOMPurify(window);
    const root = document.createElement('div');
    root.innerHTML = '<section id="wrapper"><img src="x" onerror="ATTACKER()"></section>';
    const wrapper = root.querySelector('section')!;
    const image = root.querySelector('img')!;
    document.body.appendChild(root);
    purifier.addHook(hookName, (node: Node) => {
      if (node === wrapper) wrapper.remove();
    });
    try {
      purifier.sanitize(root, { IN_PLACE: true });
      expect(root.querySelector('section')).toBeNull();
      expect(image.hasAttribute('onerror')).toBe(false);
    } finally {
      purifier.removeAllHooks();
      root.remove();
    }
  });

  it('removes event handlers without hooks while keeping safe content', () => {
    const purifier = createDOMPurify(window);
    const sanitized = purifier.sanitize('<strong>Diagram</strong><img src="x" onerror="ATTACKER()">');
    expect(sanitized).toContain('<strong>Diagram</strong>');
    expect(sanitized).not.toContain('onerror');
  });
});
