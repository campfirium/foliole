import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

type Surface = { id: string; enabled: boolean };
const RegistrationContext = createContext<((surface: Surface) => () => void) | null>(null);
const StateContext = createContext<{
  titleHost: HTMLDivElement | null;
  setTitleHost: (host: HTMLDivElement | null) => void;
  floating: boolean;
  visible: boolean;
  revealHovered: boolean;
  setRevealHovered: (hovered: boolean) => void;
  setActivity: (id: string, active: boolean) => void;
}>({
  titleHost: null,
  setTitleHost: () => {},
  floating: false,
  visible: true,
  revealHovered: false,
  setRevealHovered: () => {},
  setActivity: () => {}
});

export const usePdfTopBars = () => useContext(StateContext);
export const useRegisterPdfTopBars = () => useContext(RegistrationContext);

function useVisibility(surface: Surface | null, protectedDisplay: boolean, suspended: boolean) {
  const [shown, setShown] = useState(true);
  const previous = useRef<Surface | null>(null);
  const floating = Boolean(surface?.enabled && !suspended);
  useEffect(() => {
    const entering =
      previous.current?.id !== surface?.id || previous.current?.enabled !== surface?.enabled;
    previous.current = surface;
    setShown(true);
    if (!floating || protectedDisplay) return;
    const timer = window.setTimeout(() => setShown(false), entering ? 3000 : 300);
    return () => window.clearTimeout(timer);
  }, [floating, protectedDisplay, surface]);
  return { floating, visible: !floating || protectedDisplay || shown };
}

export function PdfTopBarsProvider(props: { children: ReactNode; suspended: boolean }) {
  const [titleHost, setTitleHost] = useState<HTMLDivElement | null>(null);
  const [revealHovered, setRevealHovered] = useState(false);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [activities, setActivities] = useState<Set<string>>(() => new Set());
  const register = useCallback((next: Surface) => {
    setSurface(next);
    return () => setSurface((current) => (current?.id === next.id ? null : current));
  }, []);
  const setActivity = useCallback((id: string, active: boolean) => {
    setActivities((current) => {
      if (current.has(id) === active) return current;
      const next = new Set(current);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const visibility = useVisibility(surface, activities.size > 0 || revealHovered, props.suspended);
  return (
    <RegistrationContext.Provider value={register}>
      <StateContext.Provider value={{ ...visibility, titleHost, setTitleHost, setActivity, revealHovered: visibility.floating && revealHovered, setRevealHovered }}>
        {props.children}
      </StateContext.Provider>
    </RegistrationContext.Provider>
  );
}
