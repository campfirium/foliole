import { Capacitor, registerPlugin } from '@capacitor/core';
import React from 'react';
import ReactDOM from 'react-dom/client';

import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';

import { assertIdentity, requireValue } from './capacityAcceptanceSafety';
import { inspectCapacityWorkspace, prepareCapacityWorkspace } from './capacityWorkspaceFixture';
import { CompanionApp } from './CompanionApp';

export async function mountCapacityWorkspaceAcceptance(root: HTMLElement) {
  const initializing = document.createElement('p');
  initializing.dataset.testid = 't219-workspace-status';
  initializing.dataset.status = 'running';
  initializing.textContent = 'T219 workspace fixture: initializing';
  root.replaceChildren(initializing);
  try {
    await initializeCapacityWorkspaceAcceptance(root);
  } catch (error) {
    initializing.dataset.status = 'failed';
    initializing.dataset.error = error instanceof Error ? error.message : String(error);
    initializing.textContent = `T219 workspace failed: ${initializing.dataset.error}`;
    throw error;
  }
}

async function initializeCapacityWorkspaceAcceptance(root: HTMLElement) {
  const app = registerPlugin<{ getInfo(): Promise<{ id: string }> }>('App');
  const identity = await app.getInfo();
  assertIdentity(Capacitor.getPlatform(), identity.id);
  const bootstrap = await loadCompanionBootstrapState();
  requireValue(bootstrap.host_name, 'Normal companion host identity is missing');
  const hostName = bootstrap.host_name;
  const owner = getIosCompanionDatabaseOwner();
  let stage = await owner.read(inspectCapacityWorkspace);

  const renderSetup = () => {
    const status = document.createElement('p');
    status.dataset.testid = 't219-workspace-status';
    status.dataset.status = 'ready';
    status.dataset.stage = String(stage);
    status.textContent = `T219 workspace fixture: ${stage}`;
    status.style.paddingTop = 'max(env(safe-area-inset-top), 48px)';
    const prepare = stage < 10000 ? setupButton(`Prepare ${stage === 0 ? '1k' : '10k'} workspace`, 't219-prepare-workspace') : null;
    const open = stage > 0 ? setupButton(`Open ${stage / 1000}k workspace`, 't219-open-workspace') : null;
    root.replaceChildren(status, ...(prepare ? [prepare] : []), ...(open ? [open] : []));
    if (prepare) prepare.onclick = async () => {
      status.dataset.status = 'running';
      const target = stage === 0 ? 1000 : 10000;
      status.textContent = `T219 workspace fixture: preparing ${target}`;
      try {
        stage = await owner.runWriter((db) => prepareCapacityWorkspace(db, target, hostName));
        renderSetup();
      } catch (error) {
        status.dataset.status = 'failed';
        status.dataset.error = error instanceof Error ? error.message : String(error);
        status.textContent = `T219 workspace failed: ${status.dataset.error}`;
      }
    };
    if (open) open.onclick = () => ReactDOM.createRoot(root).render(
      <React.StrictMode><CompanionApp /></React.StrictMode>
    );
  };
  renderSetup();
}

function setupButton(label: string, testId: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.testid = testId;
  return button;
}
