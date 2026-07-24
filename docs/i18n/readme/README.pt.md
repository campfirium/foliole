<p align="center">
  <sub>
    <a href="https://github.com/campfirium/foliole/blob/dev/README.md">English</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.de.md">Deutsch</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.es.md">Español</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.fr.md">Français</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.it.md">Italiano</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.ja.md">日本語</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.ko.md">한국어</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.pl.md">Polski</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.pt.md">Português</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.ru.md">Русский</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.zh.md">简体中文</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/readme/README.zh-Hant.md">繁體中文</a>
  </sub>
</p>

# Foliole

Faça a leitura realmente chegar ao fim.<br>
Um app acessível de leitura incremental.

As versões alpha para Windows e macOS estão abertas para testes.<br>
As versões alpha para Android e iOS são esperadas por volta de agosto.<br>
Você também pode experimentar o Foliole com a [demo online](https://foliole.app/en/demo/).

<p align="center">
  <img src="../../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Demo online

[Abrir demo online](https://foliole.app/en/demo/)

Uma demo interativa local no navegador para experimentar o Foliole sem instalação.

## Demo

[Assista à demo no YouTube](https://youtu.be/Cp-EaCVS-Ds)

## Princípios de design

### Código aberto

O código é aberto. Qualquer pessoa pode revisar a implementação, compilar o Foliole a partir do código-fonte ou contribuir com melhorias.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Dados abertos

O Foliole usa um banco de dados SQLite e fornece um espelho em Markdown, tornando os materiais mais fáceis de ler, migrar e reutilizar.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local first

Sem sistema de contas. Sem sincronização central na nuvem. Todos os dados permanecem nos seus dispositivos pessoais; os dispositivos sincronizam pela rede local.

<p align="center">
  <img src="../../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Recursos principais

### Leitura incremental nativa

O Foliole é construído em torno das ideias de leitura incremental de Piotr Woźniak, com um fluxo nativo para extrair trechos, criar cloze deletions e refinar materiais sem sair do fluxo de leitura.

<p align="center">
  <img src="../../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Agendamento FSRS integrado

O Foliole integra o FSRS (Free Spaced Repetition Scheduler), um algoritmo aberto e eficiente de agendamento de revisões.

<p align="center">
  <img src="../../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Reúna materiais de leitura

O Foliole lida com materiais de leitura de diferentes fontes, sejam arquivos locais, documentos da web, notas gerenciadas no Obsidian ou materiais exportados do Readwise Reader.

<p align="center">
  <img src="../../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Indexe documentos externos

O Foliole indexa outras pastas locais no seu computador sem copiar ou mover os arquivos originais, criando uma biblioteca externa de documentos que pode ser pesquisada, visualizada e usada nos clientes compatíveis.

<p align="center">
  <img src="../../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Suporte a conteúdo complexo

O Foliole oferece suporte a Markdown, PDF, EPUB, fórmulas LaTeX, blocos de código e outras necessidades de renderização de conteúdo.

<p align="center">
  <img src="../../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## Agradecimentos

Agradecimentos especiais a Piotr Woźniak e Jarrett Ye. Sem o SuperMemo, a leitura incremental e o FSRS, o Foliole não existiria.

Muito obrigado também aos seguintes projetos e componentes de código aberto:

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
