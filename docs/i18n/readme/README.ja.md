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

読書を本当に完了できるものにする。<br>
親しみやすいインクリメンタルリーディングアプリです。

macOS、Windows、Linux（実験版）の alpha を利用できます。<br>
Android と iOS 版は 8 月に公開予定です。<br>
[オンラインデモ](https://foliole.app/en/demo/)でも Foliole を試せます。

<p align="center">
  <img src="../../../assets/screenshots/foliole-desktop.png" alt="Foliole desktop app showing a document library, reading pane, and scheduling panel." width="900">
</p>

## オンラインデモ

[オンラインデモを開く](https://foliole.app/en/demo/)

インストール不要で Foliole を試せる、ブラウザ内でローカルに動作するインタラクティブなデモです。

## デモ

[YouTube でデモを見る](https://youtu.be/Cp-EaCVS-Ds)

## 設計原則

### オープンソース

コードはオープンソースです。誰でも実装を確認し、ソースからビルドし、改善に参加できます。

<p align="center">
  <img src="../../../assets/screenshots/Open%20Source.png" alt="Foliole desktop interface preview." width="900">
</p>

### オープンデータ

SQLite データベースを使用し、Markdown ミラーを提供します。これにより、素材の閲覧、移行、再利用がしやすくなります。

<p align="center">
  <img src="../../../assets/screenshots/Open%20Data.png" alt="Foliole document library and reading workspace." width="900">
</p>

### ローカルファースト

アカウントシステムはありません。中央集権的なクラウド同期もありません。すべてのデータは個人のデバイス上に残り、デバイス間の同期はローカルネットワークで行います。

<p align="center">
  <img src="../../../assets/screenshots/Local%20First.png" alt="Foliole local reading workspace." width="900">
</p>

## 主な機能

### ネイティブなインクリメンタルリーディング

Foliole は Piotr Woźniak のインクリメンタルリーディングの考え方を基盤にしています。読書の流れを離れずに、文章の抜き出し、穴埋め問題の作成、素材の継続的な整理ができるネイティブなワークフローを備えています。

<p align="center">
  <img src="../../../assets/screenshots/Native%20Incremental%20Reading.png" alt="Foliole reading pane with extracted notes." width="900">
</p>

### FSRS スケジューリング統合

Foliole は、オープンで効率的な復習スケジューリングアルゴリズムである FSRS（Free Spaced Repetition Scheduler）を統合しています。

<p align="center">
  <img src="../../../assets/screenshots/Integrated%20FSRS%20Scheduling.png" alt="Foliole scheduling panel in the desktop app." width="900">
</p>

### 読書素材をひとつに集約

ローカルファイル、Web ドキュメント、Obsidian で管理しているノート、Readwise Reader からエクスポートした素材、他のアプリで選択したテキストなど、さまざまな出所の読書素材をまとめて扱えます。

<p align="center">
  <img src="../../../assets/screenshots/Bring%20Reading%20Materials%20Together.png" alt="Foliole document list and reading sources." width="900">
</p>

### 外部ドキュメントのインデックス化

元のファイルをコピーまたは移動せずに、コンピューター上の他のローカルフォルダをインデックス化します。対応クライアントから検索、表示、利用できる外部ドキュメントライブラリを作成できます。

<p align="center">
  <img src="../../../assets/screenshots/Index%20External%20Documents.png" alt="Foliole document navigation and indexed folders." width="900">
</p>

### 複雑なコンテンツへの対応

Markdown、PDF、EPUB、LaTeX 数式、コードブロックなど、さまざまなコンテンツ表示の要件に対応します。

<p align="center">
  <img src="../../../assets/screenshots/Complex%20Content%20Support.png" alt="Foliole complex content reading view." width="900">
</p>

### コマンドラインと Agent のワークフロー

Terminal やローカル Agent から Foliole の素材を読み取り、書き込み、整理できます。Foliole Aide では、ChatGPT プランに含まれる Codex 利用枠を使って、アプリ内で Codex を直接利用できます。

<p align="center">
  <img src="../../../assets/screenshots/Command-Line%20and%20Agent%20Workflows.png" alt="Foliole Aide working with materials in the desktop app." width="900">
</p>

### 更新を重ねるテーマを公開

更新を重ねるテーマを、自分のサイト、WordPress、Discourse で継続的に更新できるコンテンツとして公開できます。

<p align="center">
  <img src="../../../assets/screenshots/Publish%20Evolving%20Topics.png" alt="Foliole publishing settings for an evolving website." width="900">
</p>

## 謝辞

Piotr Woźniak と Jarrett Ye に特別な感謝を捧げます。SuperMemo、インクリメンタルリーディング、FSRS がなければ、Foliole は存在しませんでした。

以下のオープンソースプロジェクトおよびコンポーネントにも感謝します。

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
