import React from 'react';
import ReactDOM from 'react-dom/client';

import { InitialLibrarySetupView } from './InitialLibrarySetupView';

export function renderInitialLibrarySetup(rootElement: HTMLElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <InitialLibrarySetupView />
    </React.StrictMode>
  );
}
