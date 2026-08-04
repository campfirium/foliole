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

Make reading actually complete.<br>
An approachable incremental reading app.

Alpha builds are available for macOS, Windows, and Linux (experimental).<br>
Android and iOS builds are expected in August.<br>
You can also try Foliole with the [online demo](https://foliole.app/en/demo/).

<p align="center">
  <img src="assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Online Demo

[Open the online demo](https://foliole.app/en/demo/)

An interactive local browser demo for trying Foliole without installation.

## Demo Clip

[Watch the demo clip on YouTube](https://youtu.be/Cp-EaCVS-Ds)

## Design Principles

### Open Source

The code is open source. Anyone can review the implementation, build it from source, or contribute improvements.

<p align="center">
  <img src="assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Open Data

Uses a SQLite database and provides a Markdown mirror, making materials easier to read, migrate, and reuse.

<p align="center">
  <img src="assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local First

No account system. No central cloud sync. All data stays on your personal devices; devices sync over the local network.

<p align="center">
  <img src="assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Core Features

### Native Incremental Reading

Built around Piotr Woźniak’s incremental reading ideas, with a native workflow for extracting passages, creating cloze deletions, and refining materials without leaving the reading flow.

<p align="center">
  <img src="assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Integrated FSRS Scheduling

Integrates FSRS (Free Spaced Repetition Scheduler), an open and efficient review scheduling algorithm.

<p align="center">
  <img src="assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Bring Reading Materials Together

Handles reading materials from different sources, whether local files, web documents, notes managed in Obsidian, materials exported from Readwise Reader, or selected text captured from other apps.

<p align="center">
  <img src="assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Index External Documents

Indexes other local folders on your computer without copying or moving the original files, creating an external document library that can be searched, viewed, and used across supported clients.

<p align="center">
  <img src="assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Complex Content Support

Supports Markdown, PDF, EPUB, LaTeX math, code blocks, and other content rendering needs.

<p align="center">
  <img src="assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

### Command-Line and Agent Workflows

Lets Terminal and local agents read, write, and organize materials in Foliole, while Foliole Aide brings Codex directly into the app using the allowance included in your ChatGPT plan.

<p align="center">
  <img src="assets/screenshots/Command-Line%20and%20Agent%20Workflows.png" alt="Foliole Aide working with materials in the desktop app." width="900">
</p>

### Publish Evolving Topics

Turns evolving Topics into content you can continue to update on your own site, WordPress, or Discourse.

<p align="center">
  <img src="assets/screenshots/Publish%20Evolving%20Topics.png" alt="Foliole publishing settings for an evolving website." width="900">
</p>

## Acknowledgements

Special thanks to Piotr Woźniak and Jarrett Ye. Without SuperMemo, incremental reading, and FSRS, Foliole would not exist.

Many thanks to the following open-source projects, components, and communities:

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Capacitor](https://capacitorjs.com)
- [CodeMirror 6](https://codemirror.net)
- [Drizzle ORM](https://orm.drizzle.team)
- [Electron](https://www.electronjs.org)
- [Linux.do](https://linux.do)
- [React](https://react.dev)
- [SQLite](https://www.sqlite.org)
- [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev)
