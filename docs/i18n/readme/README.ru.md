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

Доводите чтение до настоящего завершения.<br>
Доступное приложение для инкрементального чтения.

Альфа-версии для Windows и macOS открыты для тестирования.<br>
Альфа-версии для Android и iOS ожидаются примерно в августе.<br>
Вы также можете попробовать Foliole в [онлайн-демо](https://foliole.app/en/demo/).

<p align="center">
  <img src="../../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Онлайн-демо

[Открыть онлайн-демо](https://foliole.app/en/demo/)

Интерактивное локальное демо в браузере, чтобы попробовать Foliole без установки.

## Демо

[Посмотреть демо на YouTube](https://youtu.be/Cp-EaCVS-Ds)

## Принципы дизайна

### Открытый исходный код

Код открыт. Любой может изучить реализацию, собрать Foliole из исходников или предложить улучшения.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Открытые данные

Foliole использует базу данных SQLite и предоставляет Markdown-зеркало, чтобы материалы было проще читать, переносить и повторно использовать.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local first

Без системы аккаунтов. Без централизованной облачной синхронизации. Все данные остаются на ваших личных устройствах; устройства синхронизируются по локальной сети.

<p align="center">
  <img src="../../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Основные возможности

### Нативное инкрементальное чтение

Foliole построен вокруг идей инкрементального чтения Петра Возняка и предлагает нативный рабочий процесс для извлечения фрагментов, создания cloze deletions и постепенной доработки материалов без выхода из потока чтения.

<p align="center">
  <img src="../../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Встроенное планирование FSRS

Foliole интегрирует FSRS (Free Spaced Repetition Scheduler), открытый и эффективный алгоритм планирования повторений.

<p align="center">
  <img src="../../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Собирайте материалы для чтения вместе

Foliole работает с материалами из разных источников: локальными файлами, веб-документами, заметками из Obsidian и материалами, экспортированными из Readwise Reader.

<p align="center">
  <img src="../../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Индексируйте внешние документы

Foliole индексирует другие локальные папки на вашем компьютере, не копируя и не перемещая исходные файлы. Так создается внешняя библиотека документов, которую можно искать, просматривать и использовать на поддерживаемых клиентах.

<p align="center">
  <img src="../../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Поддержка сложного контента

Foliole поддерживает Markdown, PDF, EPUB, формулы LaTeX, блоки кода и другие задачи отображения контента.

<p align="center">
  <img src="../../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## Благодарности

Особая благодарность Петру Возняку и Jarrett Ye. Без SuperMemo, инкрементального чтения и FSRS Foliole не существовал бы.

Спасибо следующим open-source проектам и компонентам:

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
