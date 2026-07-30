import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import folioleLeafUrl from '../../../assets/brand/foliole-leaf-tight.svg?url';
import type { NativeInitialLibrarySetupState } from '../../../lib/platform/nativeInitialLibrarySetupContract';
import {
  chooseInitialLibraryLocation,
  confirmInitialLibrarySetup,
  loadInitialLibrarySetup
} from '../../shared/platform/initialLibrarySetupRuntime';

import './initialLibrarySetup.css';

const COPY = {
  en: {
    change: 'Change Location',
    create: 'Create',
    creating: 'Creating…',
    error: 'Couldn’t create the library. Choose another location and try again.',
    heading: 'Create Library',
    loading: 'Loading…',
    welcome: 'Welcome to Foliole'
  },
  zh: {
    change: '更改位置',
    create: '创建',
    creating: '正在创建…',
    error: '无法创建资料库。请选择其他位置后重试。',
    heading: '创建资料库',
    loading: '正在载入…',
    welcome: '欢迎使用 Foliole'
  }
} as const;

function resolveCopy() {
  return navigator.language.toLowerCase().startsWith('zh') ? COPY.zh : COPY.en;
}

export function InitialLibrarySetupView() {
  const copy = resolveCopy();
  const [state, setState] = useState<NativeInitialLibrarySetupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void loadInitialLibrarySetup().then(setState).catch(() => setFailed(true));
  }, []);

  const changeLocation = async () => {
    setFailed(false);
    try {
      const result = await chooseInitialLibraryLocation();
      if (result.status === 'selected') setState(result.state);
    } catch {
      setFailed(true);
    }
  };

  const createLibrary = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await confirmInitialLibrarySetup();
      if (result.status === 'canceled') setBusy(false);
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <main className="initial-library-setup">
      <section className="initial-library-setup__content" aria-labelledby="initial-library-heading">
        <div className="initial-library-setup__welcome">
          <img src={folioleLeafUrl} alt="" />
          <span>{copy.welcome}</span>
        </div>
        <h1 id="initial-library-heading">{copy.heading}</h1>
        <div className="initial-library-setup__path" title={state?.library_home}>
          {state?.display_path ?? copy.loading}
        </div>
        {failed ? <p className="initial-library-setup__error" role="alert">{copy.error}</p> : null}
        <div className="initial-library-setup__actions">
          <button type="button" disabled={!state || busy} onClick={() => void changeLocation()}>
            {copy.change}
          </button>
          <button aria-busy={busy || undefined} className={`primary${busy ? ' is-loading' : ''}`} type="button" disabled={!state || busy} onClick={() => void createLibrary()}>
            {busy ? <LoaderCircle aria-hidden="true" className="initial-library-setup__spinner" size={16} /> : null}
            <span>{busy ? copy.creating : copy.create}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
