import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const mergeClassNames = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-ui-xs',
        'text-ui-sm',
        'text-ui-base',
        'text-ui-md',
        'text-ui-lg',
        'text-ui-input',
        'text-ui-xl',
        'text-reading-sm',
        'text-reading-base',
        'text-reading-lg',
        'text-shellless-ui',
        'text-shellless-meta',
        'text-shellless-input'
      ]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return mergeClassNames(clsx(inputs));
}
