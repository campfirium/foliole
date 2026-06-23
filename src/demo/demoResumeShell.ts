import { applyStartupSkeletonLocalStorageSettings } from '../startupSkeletonDom';

export function installDemoResumeShell(doc = document) {
  applyStartupSkeletonLocalStorageSettings();
  const shell = findOrCreateBootSkeleton(doc);
  if (!shell) return false;
  ensureDemoResumeShellStyles(doc);
  shell.classList.add('startup-shell--resume');
  return true;
}

function findOrCreateBootSkeleton(doc: Document) {
  const existingShell = doc.getElementById('boot-skeleton');
  if (existingShell) return existingShell;
  if (!doc.body) return null;
  const shell = doc.createElement('section');
  shell.id = 'boot-skeleton';
  shell.className = 'startup-shell';
  shell.setAttribute('aria-hidden', 'true');
  ['rail', 'folder', 'topic', 'document', 'sidebar'].forEach((region) => {
    const element = doc.createElement(region === 'document' ? 'main' : region === 'sidebar' ? 'aside' : 'div');
    element.className = `startup-shell__${region}`;
    shell.append(element);
  });
  doc.body.prepend(shell);
  return shell;
}

function ensureDemoResumeShellStyles(doc: Document) {
  if (doc.getElementById('demo-resume-shell-style')) return;
  const style = doc.createElement('style');
  style.id = 'demo-resume-shell-style';
  style.textContent = `
    body[data-boot-skeleton='hidden'] #boot-skeleton{display:none}
    #boot-skeleton.startup-shell{position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-columns:40px 200px 250px minmax(0,1fr) 250px;min-height:100%;overflow:hidden;background:var(--startup-region-main-document-bg,#fff)}
    #boot-skeleton .startup-shell__rail{background:var(--startup-region-main-rail-bg,#b9b1a7)}
    #boot-skeleton .startup-shell__folder{background:var(--startup-region-main-folder-bg,#e7e3dd)}
    #boot-skeleton .startup-shell__topic{background:var(--startup-region-main-topic-bg,#f3eee8)}
    #boot-skeleton .startup-shell__document{background:var(--startup-region-main-document-bg,#fff)}
    #boot-skeleton .startup-shell__sidebar{background:var(--startup-region-main-sidebar-bg,#fbf9f7)}
  `;
  doc.head.append(style);
}
