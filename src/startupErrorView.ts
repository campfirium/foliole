const STARTUP_ERROR_TITLE = 'Foliole failed to start';
const STARTUP_ERROR_HELP = 'Try restarting the app. If the error persists, press Ctrl+Shift+I (or Cmd+Option+I on macOS) to open developer tools for details.';

export function renderStartupErrorView(rootElement: HTMLElement, message: string) {
  const section = document.createElement('section');
  section.style.cssText = 'padding:16px;font-family:var(--font-family-interface),Segoe UI,Arial,sans-serif;';

  const title = document.createElement('h1');
  title.style.cssText = 'margin:0 0 8px;font-size:18px;';
  title.textContent = STARTUP_ERROR_TITLE;

  const messageElement = document.createElement('p');
  messageElement.style.cssText = 'margin:0;color:#b91c1c;';
  messageElement.textContent = message;

  const help = document.createElement('p');
  help.style.cssText = 'margin:8px 0 0;color:#475569;';
  help.textContent = STARTUP_ERROR_HELP;

  section.append(title, messageElement, help);
  rootElement.replaceChildren(section);
}
