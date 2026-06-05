<p align="center">
  <sub>
    <a href="https://github.com/campfirium/foliole/blob/dev/README.md">English</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.de.md">Deutsch</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.es.md">Español</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.fr.md">Français</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.it.md">Italiano</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.ja.md">日本語</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.ko.md">한국어</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.pl.md">Polski</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.pt.md">Português</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.ru.md">Русский</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.zh.md">简体中文</a> ·
    <a href="https://github.com/campfirium/foliole/blob/dev/docs/i18n/README.zh-Hant.md">繁體中文</a>
  </sub>
</p>

# Foliole

Spraw, aby czytanie naprawdę prowadziło do ukończenia.<br>
Przystępna aplikacja do czytania inkrementalnego.

Alpha dla Windows jest otwarta do testów.<br>
Alpha dla Androida jest planowana około lipca.<br>
Buildy alpha dla macOS i iOS są planowane około sierpnia.

<p align="center">
  <img src="../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Demo

[Obejrzyj demo na YouTube](https://youtu.be/Cp-EaCVS-Ds)

## Zasady projektowe

### Open source

Kod jest open source. Każdy może przejrzeć implementację, zbudować Foliole ze źródeł albo wnieść własne usprawnienia.

<p align="center">
  <img src="../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Otwarte dane

Foliole używa bazy SQLite i udostępnia lustrzaną wersję Markdown, dzięki czemu materiały łatwiej czytać, przenosić i wykorzystywać ponownie.

<p align="center">
  <img src="../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local first

Bez systemu kont. Bez centralnej synchronizacji w chmurze. Wszystkie dane pozostają na twoich osobistych urządzeniach; urządzenia synchronizują się przez sieć lokalną.

<p align="center">
  <img src="../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Główne funkcje

### Natywne czytanie inkrementalne

Foliole opiera się na ideach czytania inkrementalnego Piotra Woźniaka i oferuje natywny przepływ pracy do wyodrębniania fragmentów, tworzenia cloze deletions oraz stopniowego dopracowywania materiałów bez opuszczania toku lektury.

<p align="center">
  <img src="../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Zintegrowane planowanie FSRS

Foliole integruje FSRS (Free Spaced Repetition Scheduler), otwarty i wydajny algorytm planowania powtórek.

<p align="center">
  <img src="../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Materiały do czytania w jednym miejscu

Foliole obsługuje materiały do czytania z różnych źródeł: pliki lokalne, dokumenty webowe, notatki zarządzane w Obsidianie oraz materiały eksportowane z Readwise Reader.

<p align="center">
  <img src="../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Indeksowanie dokumentów zewnętrznych

Foliole indeksuje inne lokalne foldery na komputerze bez kopiowania lub przenoszenia oryginalnych plików, tworząc zewnętrzną bibliotekę dokumentów, którą można przeszukiwać, przeglądać i wykorzystywać na obsługiwanych klientach.

<p align="center">
  <img src="../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Obsługa złożonych treści

Foliole obsługuje Markdown, PDF, EPUB, formuły LaTeX, bloki kodu i inne potrzeby związane z renderowaniem treści.

<p align="center">
  <img src="../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## Podziękowania

Szczególne podziękowania dla Piotra Woźniaka i Jarretta Ye. Bez SuperMemo, czytania inkrementalnego i FSRS Foliole by nie powstało.

Dziękujemy również następującym projektom i komponentom open source:

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
