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

Haz que la lectura llegue realmente a completarse.<br>
Una app accesible de lectura incremental.

La alpha para Windows está abierta para pruebas.<br>
La alpha para Android se espera alrededor de julio.<br>
Las builds alpha para macOS e iOS se esperan alrededor de agosto.<br>
También puedes probar Foliole con la [demo en línea](https://foliole.app/en/demo/).

<p align="center">
  <img src="../../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## Demo en línea

[Abrir la demo en línea](https://foliole.app/en/demo/)

Una demo interactiva local en el navegador para probar Foliole sin instalación.

## Demo

[Ver la demo en YouTube](https://youtu.be/Cp-EaCVS-Ds)

## Principios de diseño

### Código abierto

El código es abierto. Cualquier persona puede revisar la implementación, compilar Foliole desde el código fuente o contribuir mejoras.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### Datos abiertos

Foliole usa una base de datos SQLite y ofrece un espejo en Markdown, para que los materiales sean más fáciles de leer, migrar y reutilizar.

<p align="center">
  <img src="../../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### Local first

Sin sistema de cuentas. Sin sincronización central en la nube. Todos los datos permanecen en tus dispositivos personales; los dispositivos se sincronizan por la red local.

<p align="center">
  <img src="../../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## Funciones principales

### Lectura incremental nativa

Foliole se basa en las ideas de lectura incremental de Piotr Woźniak, con un flujo nativo para extraer pasajes, crear cloze deletions y refinar materiales sin salir del flujo de lectura.

<p align="center">
  <img src="../../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### Planificación FSRS integrada

Foliole integra FSRS (Free Spaced Repetition Scheduler), un algoritmo abierto y eficiente para planificar repasos.

<p align="center">
  <img src="../../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### Reúne tus materiales de lectura

Foliole gestiona materiales de lectura de distintas fuentes, ya sean archivos locales, documentos web, notas administradas en Obsidian o materiales exportados desde Readwise Reader.

<p align="center">
  <img src="../../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### Indexa documentos externos

Foliole indexa otras carpetas locales de tu computadora sin copiar ni mover los archivos originales, creando una biblioteca externa que puede buscarse, consultarse y usarse en los clientes compatibles.

<p align="center">
  <img src="../../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### Soporte para contenido complejo

Foliole admite Markdown, PDF, EPUB, matemáticas en LaTeX, bloques de código y otras necesidades de renderizado de contenido.

<p align="center">
  <img src="../../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## Agradecimientos

Gracias especialmente a Piotr Woźniak y Jarrett Ye. Sin SuperMemo, la lectura incremental y FSRS, Foliole no existiría.

Muchas gracias también a los siguientes proyectos y componentes de código abierto:

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
