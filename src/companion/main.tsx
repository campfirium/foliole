import React from 'react';
import ReactDOM from 'react-dom/client';

import '../app/styles.css';
import { installCompanionSyncInstrumentationProbe } from '../shared/platform/companionSyncInstrumentationProbe';
import { StartupErrorBoundary } from '../shared/ui/StartupErrorBoundary';

import { CompanionApp } from './CompanionApp';

installCompanionSyncInstrumentationProbe();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in companion entry.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <StartupErrorBoundary moduleLabel="Companion renderer">
      <CompanionApp />
    </StartupErrorBoundary>
  </React.StrictMode>
);
