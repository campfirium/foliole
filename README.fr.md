<p align="center">
  <sub>
    <a href="https://github.com/campfirium/foliole/blob/dev/README.md">English</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.de.md">Deutsch</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.es.md">Español</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.fr.md">Français</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.it.md">Italiano</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.ja.md">日本語</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.ko.md">한국어</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.pl.md">Polski</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.pt.md">Português</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.ru.md">Русский</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.zh.md">简体中文</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/README.zh-Hant.md">繁體中文</a>
  </sub>
</p>

# Foliole

Faire que la lecture aille vraiment jusqu'au bout.<br>
Une application accessible de lecture incrémentale.

L'alpha Windows est ouverte aux tests.<br>
L'alpha Android est attendue autour de juillet.<br>
Les builds alpha pour macOS et iOS sont attendues autour d'août.

<p align="center">
  <img src="assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Démo

[Voir la démo sur YouTube](https://youtu.be/Cp-EaCVS-Ds)

## Principes de conception

### Open source

Le code est open source. Chacun peut examiner l'implémentation, compiler Foliole depuis les sources ou contribuer des améliorations.

<p align="center">
  <img src="assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Données ouvertes

Foliole utilise une base de données SQLite et fournit un miroir Markdown, afin de rendre les contenus plus faciles à lire, migrer et réutiliser.

<p align="center">
  <img src="assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local first

Pas de système de compte. Pas de synchronisation cloud centralisée. Toutes les données restent sur vos appareils personnels ; les appareils se synchronisent sur le réseau local.

<p align="center">
  <img src="assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Fonctionnalités principales

### Lecture incrémentale native

Foliole s'appuie sur les idées de lecture incrémentale de Piotr Woźniak, avec un flux natif pour extraire des passages, créer des textes à trous et retravailler les contenus sans quitter le fil de lecture.

<p align="center">
  <img src="assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Planification FSRS intégrée

Foliole intègre FSRS (Free Spaced Repetition Scheduler), un algorithme ouvert et efficace de planification des révisions.

<p align="center">
  <img src="assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Rassembler les supports de lecture

Foliole gère des supports de lecture provenant de sources variées, qu'il s'agisse de fichiers locaux, de documents web, de notes gérées dans Obsidian ou de contenus exportés depuis Readwise Reader.

<p align="center">
  <img src="assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Indexer des documents externes

Foliole indexe d'autres dossiers locaux sur votre ordinateur sans copier ni déplacer les fichiers originaux, créant une bibliothèque externe consultable, recherchable et utilisable sur les clients compatibles.

<p align="center">
  <img src="assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Prise en charge des contenus complexes

Foliole prend en charge Markdown, PDF, EPUB, les formules LaTeX, les blocs de code et d'autres besoins de rendu de contenu.

<p align="center">
  <img src="assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## Remerciements

Merci tout particulièrement à Piotr Woźniak et Jarrett Ye. Sans SuperMemo, la lecture incrémentale et FSRS, Foliole n'existerait pas.

Merci également aux projets et composants open source suivants :

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
