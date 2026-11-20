import { resolveSandboxAuditPage } from './companionSandboxAuditPage';

const headers = ['页面 / 元素', '点按', '长按', '三点或其他入口', '审计'];

export function mountCompanionSandboxAuditPanel(document: Document) {
  const panel = document.createElement('aside');
  panel.className = 'sandbox-audit';
  panel.setAttribute('aria-label', '菜单审计');
  const title = document.createElement('h2');
  title.textContent = '菜单审计';
  const note = document.createElement('p');
  note.textContent = '等待手机页面…';
  const table = document.createElement('table');
  table.hidden = true;
  const head = table.createTHead().insertRow();
  for (const name of headers) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = name;
    head.append(cell);
  }
  const body = table.createTBody();
  panel.append(title, note, table);
  document.body.append(panel);

  let rows: string[][] | undefined;
  let lastPage: Document | undefined;
  let renderedName: string | undefined;
  const render = () => {
    if (!rows || !lastPage) return;
    const page = resolveSandboxAuditPage(lastPage);
    if (!page || page.name === renderedName) return;
    renderedName = page.name;
    title.textContent = `菜单审计 · ${page.name}`;
    const matches = rows.filter(row => page.matches.test(row[0] ?? ''));
    body.replaceChildren();
    for (const entry of matches) {
      const row = body.insertRow();
      for (const value of entry) row.insertCell().textContent = value.replace(/\x60/gu, '');
    }
    table.hidden = matches.length === 0;
    note.textContent = rows.length === 0 ? '当前工作区没有可用的菜单审计表。'
      : matches.length === 0 ? '审计表里还没有这个页面的记录。' : '来自 Foliole 菜单与操作入口审计。';
    panel.scrollTop = 0;
  };

  const abort = new AbortController();
  const origin = document.defaultView!.location.origin;
  void fetch(`${origin}/__foliole_preview/menu-audit`, { signal: abort.signal })
    .then(async response => { rows = response.ok ? await response.json() as string[][] : []; render(); })
    .catch(() => { if (!abort.signal.aborted) note.textContent = '未能读取菜单审计表。'; });

  return {
    show(page: Document) { lastPage = page; render(); },
    dispose() { abort.abort(); panel.remove(); }
  };
}
