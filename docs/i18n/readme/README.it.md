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

Portare davvero a termine la lettura.<br>
Un'app accessibile per la lettura incrementale.

L'alpha per Windows è aperta ai test.<br>
L'alpha per Android è prevista intorno a luglio.<br>
Le build alpha per macOS e iOS sono previste intorno ad agosto.

<p align="center">
  <img src="../../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Demo

[Guarda la demo su YouTube](https://youtu.be/Cp-EaCVS-Ds)

## Principi di progettazione

### Open source

Il codice è open source. Chiunque può esaminare l'implementazione, compilare Foliole dal sorgente o contribuire con miglioramenti.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Dati aperti

Foliole usa un database SQLite e fornisce uno specchio Markdown, rendendo i materiali più facili da leggere, migrare e riutilizzare.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local first

Nessun sistema di account. Nessuna sincronizzazione cloud centrale. Tutti i dati restano sui tuoi dispositivi personali; i dispositivi si sincronizzano tramite la rete locale.

<p align="center">
  <img src="../../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Funzioni principali

### Lettura incrementale nativa

Foliole si basa sulle idee di lettura incrementale di Piotr Woźniak, con un flusso nativo per estrarre passaggi, creare cloze deletion e rifinire i materiali senza uscire dal flusso di lettura.

<p align="center">
  <img src="../../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Pianificazione FSRS integrata

Foliole integra FSRS (Free Spaced Repetition Scheduler), un algoritmo aperto ed efficiente per la pianificazione dei ripassi.

<p align="center">
  <img src="../../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Riunire i materiali di lettura

Foliole gestisce materiali di lettura provenienti da fonti diverse, che siano file locali, documenti web, note gestite in Obsidian o materiali esportati da Readwise Reader.

<p align="center">
  <img src="../../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Indicizzare documenti esterni

Foliole indicizza altre cartelle locali sul computer senza copiare o spostare i file originali, creando una libreria esterna ricercabile, consultabile e utilizzabile sui client supportati.

<p align="center">
  <img src="../../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Supporto per contenuti complessi

Foliole supporta Markdown, PDF, EPUB, formule LaTeX, blocchi di codice e altre esigenze di rendering dei contenuti.

<p align="center">
  <img src="../../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## Ringraziamenti

Un ringraziamento speciale a Piotr Woźniak e Jarrett Ye. Senza SuperMemo, la lettura incrementale e FSRS, Foliole non esisterebbe.

Grazie anche ai seguenti progetti e componenti open source:

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
