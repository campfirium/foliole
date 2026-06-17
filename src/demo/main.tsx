import React from 'react';
import ReactDOM from 'react-dom/client';

import '../app/styles.css';

import { installDemoRuntimeController } from '../shared/platform/runtime/demoRuntime';
import {
  createBrowserLocalWorkspaceMutationRepository,
  installWorkspaceMutationRepository
} from '../store/workspaceMutationRepository';

import { createBrowserDemoRuntimeController } from './demoRuntimeController';
import { installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in Demo entry.');
}

await installDemoWorkspaceSnapshot();
installDemoRuntimeController(createBrowserDemoRuntimeController());
installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
const { App } = await import('../app/App');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
