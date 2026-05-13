import type { ReactNode } from 'react';

import { AppButton } from './Button';

export interface StartupSurfaceAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface StartupSurfaceModel {
  eyebrow: string;
  logPath?: string | null;
  message: string;
  moduleLabel?: string | null;
  title: string;
  tone?: 'default' | 'critical';
}

export interface StartupErrorActions {
  exportDiagnostics?: () => void;
  exit?: () => void;
  openLogs?: () => void;
  retry?: () => void;
}

export interface StartupErrorViewModel {
  logPath?: string | null;
  message: string;
  moduleLabel?: string | null;
  title?: string;
}

const STARTUP_ERROR_TITLE = 'Foliole startup encountered a problem';
const STARTUP_BOOT_TITLE = 'Starting Foliole';
const STARTUP_BOOT_HELP = 'Preparing the workspace services...';

function resolveActionList(actions: StartupErrorActions): StartupSurfaceAction[] {
  const actionList: StartupSurfaceAction[] = [];
  if (actions.retry) {
    actionList.push({ label: 'Retry', onClick: actions.retry, variant: 'primary' });
  }
  if (actions.openLogs) {
    actionList.push({ label: 'Open logs', onClick: actions.openLogs });
  }
  if (actions.exportDiagnostics) {
    actionList.push({ label: 'Export diagnostics', onClick: actions.exportDiagnostics });
  }
  if (actions.exit) {
    actionList.push({ label: 'Exit', onClick: actions.exit });
  }
  return actionList;
}

export function createStartupBootSurfaceModel(): StartupSurfaceModel {
  return {
    eyebrow: 'Startup',
    message: STARTUP_BOOT_HELP,
    title: STARTUP_BOOT_TITLE,
    tone: 'default'
  };
}

export function createStartupErrorSurfaceModel(input: string | StartupErrorViewModel): StartupSurfaceModel {
  const model = typeof input === 'string' ? { message: input } : input;
  return {
    eyebrow: 'Startup problem',
    ...(model.logPath !== undefined ? { logPath: model.logPath } : {}),
    message: model.message,
    ...(model.moduleLabel !== undefined ? { moduleLabel: model.moduleLabel } : {}),
    title: model.title ?? STARTUP_ERROR_TITLE,
    tone: 'critical'
  };
}

export function StartupSurface(props: {
  actions?: StartupSurfaceAction[];
  children?: ReactNode;
  model: StartupSurfaceModel;
}) {
  const isCritical = props.model.tone === 'critical';
  return (
    <main className="startup-surface" role={isCritical ? 'alert' : 'status'}>
      <p className="startup-surface__eyebrow">{props.model.eyebrow}</p>
      <h1 className="startup-surface__title">{props.model.title}</h1>
      {props.model.moduleLabel ? (
        <p className="startup-surface__meta">Failed module: {props.model.moduleLabel}</p>
      ) : null}
      <p className="startup-surface__message" data-tone={isCritical ? 'critical' : 'default'}>
        {props.model.message}
      </p>
      {props.model.logPath ? <p className="startup-surface__meta">Logs: {props.model.logPath}</p> : null}
      {props.actions?.length ? (
        <div className="startup-surface__actions">
          {props.actions.map((action) => (
            <AppButton
              key={action.label}
              onClick={action.onClick}
              size="sm"
              variant={action.variant === 'primary' ? 'primary' : 'ghost'}
            >
              {action.label}
            </AppButton>
          ))}
        </div>
      ) : null}
      {props.children}
    </main>
  );
}

function appendTextElement(parent: HTMLElement, tagName: string, className: string, text: string) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function appendActionButton(
  parent: HTMLElement,
  label: string,
  action: (() => void) | undefined,
  variant: 'primary' | 'secondary' = 'secondary'
) {
  if (!action) {
    return;
  }
  const button = document.createElement('button');
  button.className = 'startup-surface__button';
  button.dataset.variant = variant;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  parent.append(button);
}

export function renderStartupBootView(rootElement: HTMLElement) {
  renderStartupSurface(rootElement, createStartupBootSurfaceModel());
}

export function renderStartupErrorView(
  rootElement: HTMLElement,
  input: string | StartupErrorViewModel,
  actions: StartupErrorActions = {}
) {
  renderStartupSurface(rootElement, createStartupErrorSurfaceModel(input), resolveActionList(actions));
}

function renderStartupSurface(
  rootElement: HTMLElement,
  model: StartupSurfaceModel,
  actions: StartupSurfaceAction[] = []
) {
  const section = document.createElement('section');
  section.className = 'startup-surface';
  section.setAttribute('role', model.tone === 'critical' ? 'alert' : 'status');

  appendTextElement(section, 'p', 'startup-surface__eyebrow', model.eyebrow);
  appendTextElement(section, 'h1', 'startup-surface__title', model.title);

  if (model.moduleLabel) {
    appendTextElement(section, 'p', 'startup-surface__meta', `Failed module: ${model.moduleLabel}`);
  }

  const message = appendTextElement(section, 'p', 'startup-surface__message', model.message);
  message.dataset.tone = model.tone === 'critical' ? 'critical' : 'default';

  if (model.logPath) {
    appendTextElement(section, 'p', 'startup-surface__meta', `Logs: ${model.logPath}`);
  }

  const actionRow = document.createElement('div');
  actionRow.className = 'startup-surface__actions';
  for (const action of actions) {
    appendActionButton(actionRow, action.label, action.onClick, action.variant ?? 'secondary');
  }
  section.append(actionRow);

  rootElement.replaceChildren(section);
}
