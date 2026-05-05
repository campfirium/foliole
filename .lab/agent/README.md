# Agent Files

## 共享规则
- `AGENTS.md`：仓库入口规则，属于共享 policy，应提交。
- `.lab/specs/**`：产品、架构、平台专题真相，属于共享 truth，应提交。
- `.lab/agent/workflow.md`：agent 执行手册，属于共享 operations policy，应提交。

## 本地状态
- `.lab/agent/TODO.md`、`.lab/agent/DONE.md`、`*.flag`、`handoffs/**`、`iteration-log/**`：运行态状态与会话痕迹，默认不提交。

## 目录约定
- 共享规则：`AGENTS.md`、`.lab/specs/**`、`.lab/agent/workflow.md`
- 本地状态：`.lab/agent/TODO.md`、`.lab/agent/DONE.md`、`.lab/agent/current-phase.md`、`.lab/agent/windows-preview.flag`、`.lab/agent/park.flag`、`.lab/agent/handoffs/**`、`.lab/agent/iteration-log/**`
- 不放在 `agent`：想法、backlog、事故复盘、专项调查；这些分别进入 `.lab/planning/**` 或 `.lab/incidents/**`
