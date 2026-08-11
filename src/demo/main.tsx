import type { ComponentType, ReactNode } from 'react';

import {
  getPersistedAppLanguagePreference,
  type AppLanguagePreference
} from '../shared/localization/appLanguage';

import { installDemoResumeShell } from './demoResumeShell';

type DemoAppProps = {
  initialLanguagePreference?: AppLanguagePreference | undefined;
  providerBridge?: ReactNode;
};

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in Demo entry.');
}

installDemoResumeShell();

const [
  ,
  React,
  ReactDOM,
  { installExternalFolderRuntimeProvider },
  { installDemoRuntimeController },
  { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository },
  { createDemoExternalFolderProvider },
  { createBrowserDemoRuntimeController },
  { installDemoUrlSync, resolveDemoInitialLanguagePreference },
  { DemoUrlSyncBridge },
  { installDemoWorkspaceSnapshot },
  { App }
] = await Promise.all([
  import('../app/styles.css'),
  import('react'),
  import('react-dom/client'),
  import('../shared/platform/externalFolderRuntime'),
  import('../shared/platform/runtime/demoRuntime'),
  import('../store/workspaceMutationRepository'),
  import('./demoExternalFolderProvider'),
  import('./demoRuntimeController'),
  import('./demoUrlSync'),
  import('./DemoUrlSyncBridge'),
  import('./demoWorkspaceSnapshot'),
  import('../app/App')
]);

await installDemoWorkspaceSnapshot();
installDemoRuntimeController(createBrowserDemoRuntimeController());
installExternalFolderRuntimeProvider(createDemoExternalFolderProvider());
installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
installDemoUrlSync();
const initialLanguagePreference = resolveDemoInitialLanguagePreference(
  window.location.pathname,
  getPersistedAppLanguagePreference()
);
const DemoReact = React as typeof import('react');
const DemoReactDOM = ReactDOM as typeof import('react-dom/client');
const DemoApp = App as ComponentType<DemoAppProps>;

DemoReactDOM.createRoot(rootElement).render(
  DemoReact.createElement(
    DemoReact.StrictMode,
    null,
    DemoReact.createElement(DemoApp, {
      initialLanguagePreference,
      providerBridge: DemoReact.createElement(DemoUrlSyncBridge)
    })
  )
);
