import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';

import { turnCompanionReadingPage } from './companionPagedReading';

type TurnPage = ((direction: number) => void) | null;
const PageContext = createContext<TurnPage>(null);
const RegisterContext = createContext<Dispatch<SetStateAction<TurnPage>> | null>(null);

export function CompanionReadingPageNavigation(props: { children: ReactNode }) {
  const [turnPage, setTurnPage] = useState<TurnPage>(null);
  return <RegisterContext.Provider value={setTurnPage}>
    <PageContext.Provider value={turnPage}>{props.children}</PageContext.Provider>
  </RegisterContext.Provider>;
}

export const useCompanionReadingPageNavigation = () => useContext(PageContext);

export function useRegisterCompanionReadingPages(surfaceRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const register = useContext(RegisterContext);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!register || !enabled || !surface) return;
    register(() => (direction: number) => turnCompanionReadingPage(surface, direction));
    return () => register(null);
  }, [register, surfaceRef, enabled]);
}
