import { createLucideIcon } from 'lucide-react';

import license from './brand-icons.LICENSE?url';

// Preserve the retired brand artwork and include its license in every consuming bundle.
export const Github = Object.assign(createLucideIcon('Github', [
  ['path', {
    d: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
    key: 'outline'
  }],
  ['path', { d: 'M9 18c-4.51 2-5-2-7-2', key: 'tail' }]
]), { license });

export const Youtube = Object.assign(createLucideIcon('Youtube', [
  ['path', {
    d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17',
    key: 'outline'
  }],
  ['path', { d: 'm10 15 5-3-5-3z', key: 'play' }]
]), { license });
