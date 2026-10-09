import { createContext, useContext, type ReactNode } from 'react';

import { usePdfReadingViewRuntime } from './usePdfReadingViewRuntime';

const Context = createContext<ReturnType<typeof usePdfReadingViewRuntime> | null>(null);
export const usePdfReadingView = () => useContext(Context);

export function PdfReadingViewProvider(props: { page: number; children: ReactNode }) {
  const runtime = usePdfReadingViewRuntime(props.page);
  return <Context.Provider value={runtime}>{props.children}</Context.Provider>;
}
