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

Lesen wirklich abschließen.<br>
Eine zugängliche App für inkrementelles Lesen.

Alpha-Versionen für Windows und macOS sowie eine experimentelle Linux-Version sind zum Testen verfügbar.<br>
Die Alpha-Versionen für Android und iOS werden etwa im August erwartet.<br>
Du kannst Foliole auch mit der [Online-Demo](https://foliole.app/en/demo/) ausprobieren.

<p align="center">
  <img src="../../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Online-Demo

[Online-Demo öffnen](https://foliole.app/en/demo/)

Eine interaktive lokale Browser-Demo, mit der du Foliole ohne Installation ausprobieren kannst.

## Demo-Clip

[Demo-Clip auf YouTube ansehen](https://youtu.be/Cp-EaCVS-Ds)

## Designprinzipien

### Open Source

Der Code ist quelloffen. Jede Person kann die Implementierung prüfen, Foliole aus dem Quellcode bauen oder Verbesserungen beitragen.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Offene Daten

Foliole nutzt eine SQLite-Datenbank und stellt einen Markdown-Spiegel bereit, damit Materialien leichter gelesen, migriert und weiterverwendet werden können.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local First

Kein Kontosystem. Keine zentrale Cloud-Synchronisierung. Alle Daten bleiben auf deinen persönlichen Geräten; Geräte synchronisieren sich über das lokale Netzwerk.

<p align="center">
  <img src="../../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Kernfunktionen

### Natives inkrementelles Lesen

Foliole baut auf Piotr Woźniaks Ideen zum inkrementellen Lesen auf, mit einem nativen Workflow zum Extrahieren von Passagen, Erstellen von Cloze-Deletions und fortlaufenden Überarbeiten von Materialien, ohne den Lesefluss zu verlassen.

<p align="center">
  <img src="../../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Integrierte FSRS-Planung

Foliole integriert FSRS (Free Spaced Repetition Scheduler), einen offenen und effizienten Algorithmus für Wiederholungsplanung.

<p align="center">
  <img src="../../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Lesematerialien zusammenführen

Foliole verarbeitet Lesematerialien aus unterschiedlichen Quellen zentral, ob lokale Dateien, Webdokumente, in Obsidian verwaltete Notizen, aus Readwise Reader exportierte Materialien oder in anderen Apps ausgewählter Text.

<p align="center">
  <img src="../../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Externe Dokumente indexieren

Foliole indexiert andere lokale Ordner auf deinem Computer, ohne Originaldateien zu kopieren oder zu verschieben. So entsteht eine externe Dokumentbibliothek, die durchsucht, angezeigt und auf unterstützten Clients genutzt werden kann.

<p align="center">
  <img src="../../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Unterstützung für komplexe Inhalte

Foliole unterstützt Markdown, PDF, EPUB, LaTeX-Formeln, Codeblöcke und weitere Anforderungen an die Inhaltsdarstellung.

<p align="center">
  <img src="../../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

### Kommandozeilen- und Agent-Workflows

Terminal und lokale Agents können Materialien in Foliole lesen, schreiben und organisieren, während Foliole Aide Codex direkt in die App bringt und dabei das im ChatGPT-Tarif enthaltene Codex-Kontingent nutzt.

<p align="center">
  <img src="../../../assets/screenshots/Command-Line%20and%20Agent%20Workflows.png" alt="Foliole Aide working with materials in the desktop app." width="900">
</p>

### Sich weiterentwickelnde Themen veröffentlichen

Macht sich weiterentwickelnde Themen zu Inhalten, die sich auf der eigenen Website, in WordPress oder Discourse fortlaufend aktualisieren lassen.

<p align="center">
  <img src="../../../assets/screenshots/Publish%20Evolving%20Topics.png" alt="Foliole publishing settings for an evolving website." width="900">
</p>

## Danksagung

Besonderer Dank gilt Piotr Woźniak und Jarrett Ye. Ohne SuperMemo, inkrementelles Lesen und FSRS gäbe es Foliole nicht.

Vielen Dank auch an die folgenden Open-Source-Projekte und Komponenten:

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
