import { installDemoResumeShell } from './demoResumeShell';

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
  { installDemoUrlSync, resolveDemoLanguagePreferenceFromPath },
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
const initialLanguagePreference = resolveDemoLanguagePreferenceFromPath(window.location.pathname);

ReactDOM.createRoot(rootElement).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(App, {
      initialLanguagePreference,
      providerBridge: React.createElement(DemoUrlSyncBridge)
    })
  )
);
