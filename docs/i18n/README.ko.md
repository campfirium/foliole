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

읽기를 정말로 끝까지 완성하게 합니다.<br>
접근하기 쉬운 점진적 읽기 앱입니다.

Windows alpha는 테스트용으로 공개되어 있습니다.<br>
Android alpha는 7월경 공개될 예정입니다.<br>
macOS와 iOS alpha 빌드는 8월경 공개될 예정입니다.

<p align="center">
  <img src="../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## 데모

[YouTube에서 데모 보기](https://youtu.be/Cp-EaCVS-Ds)

## 설계 원칙

### 오픈 소스

코드는 오픈 소스입니다. 누구나 구현을 검토하고, 소스에서 빌드하거나, 개선에 기여할 수 있습니다.

<p align="center">
  <img src="../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### 열린 데이터

SQLite 데이터베이스를 사용하고 Markdown 미러를 제공하여 자료를 더 쉽게 읽고, 이전하고, 재사용할 수 있게 합니다.

<p align="center">
  <img src="../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### 로컬 우선

계정 시스템이 없습니다. 중앙 클라우드 동기화도 없습니다. 모든 데이터는 개인 기기에 남아 있으며, 기기들은 로컬 네트워크를 통해 동기화됩니다.

<p align="center">
  <img src="../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## 핵심 기능

### 네이티브 점진적 읽기

Foliole은 Piotr Woźniak의 점진적 읽기 아이디어를 바탕으로 합니다. 읽기 흐름을 벗어나지 않고 구절을 발췌하고, 빈칸 삭제를 만들고, 자료를 계속 다듬을 수 있는 네이티브 워크플로를 제공합니다.

<p align="center">
  <img src="../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### 통합 FSRS 스케줄링

Foliole은 개방적이고 효율적인 복습 스케줄링 알고리즘인 FSRS(Free Spaced Repetition Scheduler)를 통합합니다.

<p align="center">
  <img src="../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### 읽기 자료 통합

로컬 파일, 웹 문서, Obsidian에서 관리하는 노트, Readwise Reader에서 내보낸 자료 등 다양한 출처의 읽기 자료를 한곳에서 다룰 수 있습니다.

<p align="center">
  <img src="../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### 외부 문서 인덱싱

원본 파일을 복사하거나 이동하지 않고 컴퓨터의 다른 로컬 폴더를 인덱싱하여, 지원되는 클라이언트에서 검색하고 열람하고 활용할 수 있는 외부 문서 라이브러리를 만듭니다.

<p align="center">
  <img src="../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### 복잡한 콘텐츠 지원

Markdown, PDF, EPUB, LaTeX 수식, 코드 블록 등 다양한 콘텐츠 렌더링 요구를 지원합니다.

<p align="center">
  <img src="../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## 감사의 말

Piotr Woźniak과 Jarrett Ye에게 특별히 감사드립니다. SuperMemo, 점진적 읽기, FSRS가 없었다면 Foliole은 존재하지 않았을 것입니다.

다음 오픈 소스 프로젝트와 구성 요소에도 깊이 감사드립니다.

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
