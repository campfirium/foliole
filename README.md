<p align="center">
  <sub>
    <a href="https://github.com/campfirium/foliole/blob/dev/README.md">English</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.zh.md">简体中文</a>
  </sub>
</p>

# Foliole

Make reading actually complete.<br>
An approachable incremental reading app.

Windows alpha is open for testing.<br>
Android alpha is expected around July.<br>
macOS and iOS alpha builds are expected around August.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Design Principles

### Open Source

The code is open source. Anyone can review the implementation, build it from source, or contribute improvements.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Open Data

Uses a SQLite database and provides a Markdown mirror, making materials easier to read, migrate, and reuse.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local First

No account system. No central cloud sync. All data stays on your personal devices; devices sync over the local network.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Core Features

### Native Incremental Reading

Built around Piotr Woźniak’s incremental reading ideas, with a native workflow for extracting passages, creating cloze deletions, and refining materials without leaving the reading flow.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Integrated FSRS Scheduling

Integrates FSRS (Free Spaced Repetition Scheduler), an open and efficient review scheduling algorithm.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Bring Reading Materials Together

Handles reading materials from different sources, whether local files, web documents, notes managed in Obsidian, or materials exported from Readwise Reader.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Index External Documents

Indexes other local folders on your computer without copying or moving the original files, creating an external document library that can be searched, viewed, and used across supported clients.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Complex Content Support

Supports Markdown, PDF, EPUB, LaTeX math, code blocks, and other content rendering needs.

<p align="center">
  <img src="https://foliole.app/assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## Acknowledgements

Special thanks to Piotr Woźniak and Jarrett Ye. Without SuperMemo, incremental reading, and FSRS, Foliole would not exist.

Many thanks to the following open-source projects and components:

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
