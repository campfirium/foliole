import { render } from '@testing-library/react';
import { compile } from 'tailwindcss';
import { expect, it } from 'vitest';

import companionStyles from './companionMinimal.css?raw';
import { CompanionReviewHeader } from './CompanionReviewHeader';

it('keeps the review breadcrumb in the scrolling document instead of overlaying it', async () => {
  const view = render(<CompanionReviewHeader><nav>Folder</nav></CompanionReviewHeader>);
  const header = view.container.firstElementChild;
  if (!(header instanceof HTMLElement)) throw new Error('Missing review header');
  const candidates = Array.from(view.container.querySelectorAll('*')).flatMap(element => Array.from(element.classList));
  const utilities = await compile('@tailwind utilities;');
  const styles = document.createElement('style');
  styles.textContent = utilities.build(candidates) + companionStyles;
  document.head.append(styles);
  try {
    expect(['fixed', 'sticky', 'absolute']).not.toContain(window.getComputedStyle(header).position);
  } finally {
    styles.remove();
    view.unmount();
  }
});
