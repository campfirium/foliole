import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode
} from 'react';
import { useDocumentContext } from 'react-pdf';

import { loadPdfTopBarsPreference, savePdfTopBarsPreference } from '../model/pdfTopBarsPreferences';

import { useRegisterPdfTopBars } from './PdfTopBarsContext';

const Context = createContext<ReturnType<typeof usePreference> | null>(null);
export const usePdfTopBarsPreference = () => useContext(Context);

function usePreference() {
  const [fingerprint, setFingerprint] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!fingerprint) return;
    let alive = true;
    setReady(false);
    void loadPdfTopBarsPreference(fingerprint)
      .then((saved) => {
        if (!alive) return;
        setEnabled(saved);
        setReady(true);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [fingerprint]);
  const toggle = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(false);
    try {
      await savePdfTopBarsPreference(fingerprint, !enabled);
      setEnabled(!enabled);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return { enabled, ready, busy, error, toggle, setFingerprint };
}

export function PdfTopBarsDocument(props: { children: ReactNode; isVisible: boolean }) {
  const preference = usePreference();
  const register = useRegisterPdfTopBars();
  const id = useId();
  useEffect(() => {
    if (!register || !props.isVisible) return;
    return register({ id, enabled: preference.enabled });
  }, [id, preference.enabled, props.isVisible, register]);
  return <Context.Provider value={preference}>{props.children}</Context.Provider>;
}

export function PdfTopBarsDocumentConnection() {
  return usePdfTopBarsPreference() ? <ConnectedDocument /> : null;
}

function ConnectedDocument() {
  const pdf = useDocumentContext()?.pdf;
  const preference = usePdfTopBarsPreference();
  const setFingerprint = preference?.setFingerprint;
  const connect = useCallback(() => {
    const fingerprint = pdf ? pdf.fingerprints[0] : undefined;
    if (fingerprint) setFingerprint?.(fingerprint);
  }, [pdf, setFingerprint]);
  useEffect(connect, [connect]);
  return null;
}
