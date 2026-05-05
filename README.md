# Foliole

Foliole 当前处于从 0 到 1 的实现阶段，采用 **Trunk-Based Vibe Coding** 工作流推进。

## 快速开始（Agent 协作）
1. 阅读产品规范：`.lab/specs/`
2. 读取 Agent 约定：`AGENTS.md`
3. 查看当前阶段指针：`.lab/agent/current-phase.md`
4. 用任务模板执行：`.lab/agent/task-template.md`
5. 完成后记录：`.lab/agent/iteration-log.md`
6. 提交前执行：`scripts/quality-gate.sh`

## 当前里程碑
- M1：三栏编辑加工链路可用（节点列表 + Markdown 编辑 + 测试区占位 + 派生 + 持久化）

## 工作流原则
1. 主干小步提交，避免长周期分支合并。
2. 一次只做一个可验证任务。
3. 优先稳定主链路，再扩展外围能力。
