import { createContext, useContext, type ReactNode } from 'react';

import type { CommandPaletteItem } from './types';

interface PublicCommandContextValue {
  items: CommandPaletteItem[];
  runCommand: (commandId: string) => void;
}

const EMPTY_CONTEXT: PublicCommandContextValue = {
  items: [],
  runCommand: () => undefined
};

const PublicCommandContext = createContext<PublicCommandContextValue>(EMPTY_CONTEXT);

export function PublicCommandProvider(props: PublicCommandContextValue & { children: ReactNode }) {
  return (
    <PublicCommandContext.Provider value={{ items: props.items, runCommand: props.runCommand }}>
      {props.children}
    </PublicCommandContext.Provider>
  );
}

export function usePublicCommands() {
  return useContext(PublicCommandContext);
}
