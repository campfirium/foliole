import { createContext } from 'react';

export const PdfExpandedWidthContext = createContext<((width: number) => void) | null>(null);
