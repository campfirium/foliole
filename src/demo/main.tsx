import React from 'react';
import ReactDOM from 'react-dom/client';

import '../app/styles.css';

import { installExternalFolderRuntimeProvider } from '../shared/platform/externalFolderRuntime';
import { installDemoRuntimeController } from '../shared/platform/runtime/demoRuntime';
import {
  createBrowserLocalWorkspaceMutationRepository,
  installWorkspaceMutationRepository
} from '../store/workspaceMutationRepository';

import { createDemoExternalFolderProvider } from './demoExternalFolderProvider';
import { createBrowserDemoRuntimeController } from './demoRuntimeController';
import { installDemoUrlSync, resolveDemoLanguagePreferenceFromPath } from './demoUrlSync';
import { DemoUrlSyncBridge } from './DemoUrlSyncBridge';
import { installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in Demo entry.');
}

await installDemoWorkspaceSnapshot();
installDemoRuntimeController(createBrowserDemoRuntimeController());
installExternalFolderRuntimeProvider(createDemoExternalFolderProvider());
installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
installDemoUrlSync();
const { App } = await import('../app/App');
const initialLanguagePreference = resolveDemoLanguagePreferenceFromPath(window.location.pathname);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App initialLanguagePreference={initialLanguagePreference} providerBridge={<DemoUrlSyncBridge />} />
  </React.StrictMode>
);
