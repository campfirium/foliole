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

讓閱讀真正完成。<br>
一款現代的漸進閱讀軟體。

Windows 和 macOS alpha 已開放測試。<br>
Android 和 iOS alpha 預計在 8 月左右發布。<br>
也可以先透過[在線體驗版](https://foliole.app/en/demo/)體驗 Foliole。

<p align="center">
  <img src="../../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## 在線體驗版

[打開在線體驗版](https://foliole.app/en/demo/)

一個在瀏覽器本地執行的互動式 Demo，無需安裝即可體驗 Foliole。

## 演示影片

[在 YouTube 上觀看演示影片](https://youtu.be/Cp-EaCVS-Ds)

## 設計原則

### 程式碼開源

程式碼完全開源，任何人都可以審查實作、自行建置或參與改進。

<p align="center">
  <img src="../../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### 資料開放

使用 SQLite 資料庫並提供 Markdown 鏡像，方便資料的讀取、遷移和調用。

<p align="center">
  <img src="../../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### 本地優先

沒有帳號和中心雲端同步系統。所有資料都保存在個人裝置上；多裝置之間透過區域網路同步。

<p align="center">
  <img src="../../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## 核心功能

### 原生支援漸進閱讀

踐行 Piotr Woźniak 的漸進閱讀理念，支援在深度閱讀中無縫摘錄、流暢挖空、持續重構。

<p align="center">
  <img src="../../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### 整合 FSRS 調度

整合 FSRS（Free Spaced Repetition Scheduler），採用開源高效的複習調度演算法。

<p align="center">
  <img src="../../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### 匯聚閱讀材料

可集中處理各種來源的閱讀材料，無論是本地檔案、網頁文件，還是 Obsidian 管理的筆記、Readwise Reader 匯出的材料。

<p align="center">
  <img src="../../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### 索引外部文件

無需複製或移動原檔案，即可索引電腦上的其他本地資料夾，建立可在各平台客戶端查閱和調用的外部文件庫。

<p align="center">
  <img src="../../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### 支援複雜材料

支援 Markdown、PDF、EPUB 等檔案格式，以及數學公式（LaTeX）、程式碼區塊等內容渲染。

<p align="center">
  <img src="../../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

## 致謝

特別感謝 Piotr Woźniak 和 Jarrett Ye。沒有 SuperMemo、漸進閱讀和 FSRS，就沒有 Foliole。

也非常感謝以下優秀的開源專案和元件：

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
