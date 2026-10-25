import { createContext } from 'react';

export const FlowExitHereContext = createContext<(() => void) | null>(null);
