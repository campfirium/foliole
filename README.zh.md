<p align="center">
  <sub>
    <a href="https://github.com/campfirium/foliole/blob/main/README.md">English</a> ·
    <a href="https://github.com/campfirium/foliole/blob/main/README.zh.md">简体中文</a>
  </sub>
</p>

# Foliole

让阅读真正完成。
一款现代的渐进阅读软件。

Windows alpha 已开放测试。
Android alpha 预计在 7 月左右发布。
macOS 和 iOS alpha 预计在 8 月左右发布。
## 设计原则

### 代码开源

代码完全开源，任何人都可以审查实现、自行构建或参与改进。

### 数据开放

使用 SQLite 数据库并提供 Markdown 镜像，方便资料的读取、迁移和调用。

### 本地优先

没有账号和中心云同步系统。所有数据都保存在个人设备上；多设备之间通过局域网同步。

## 核心功能

### 原生支持渐进阅读

践行 Piotr Woźniak 的渐进阅读理念，支持在深度阅读中无缝摘录、流畅挖空、持续重构。

### 集成 FSRS 调度

集成 FSRS（Free Spaced Repetition Scheduler），采用开源高效的复习调度算法。

### 汇聚阅读材料

可集中处理各种来源的阅读材料，无论是本地文件、网页文档，还是 Obsidian 管理的笔记、Readwise Reader 导出的材料。


### 索引外部文档

无需复制或移动原文件，即可索引电脑上的其他本地文件夹，建立可在各平台客户端查阅和调用的外部文档库。

### 支持复杂材料

支持 Markdown、PDF、EPUB 等文件格式，以及数学公式（LaTeX）、代码块等内容渲染。

## 致谢

特别感谢 Piotr Woźniak 和 Jarrett Ye。没有 SuperMemo、渐进阅读和 FSRS，就没有 Foliole。

也非常感谢以下优秀的开源项目和组件：

- better-sqlite3
- Capacitor
- CodeMirror 6
- Drizzle ORM
- Electron
- React
- SQLite
- TypeScript
- Vite
