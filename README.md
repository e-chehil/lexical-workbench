# Lexical Workbench 2.0

本地优先的英语词汇观测台：把 **COCA 2020 词元 + 词性频次**、**Nation BNC/COCA 25k 词族** 与
**CET-4/6 2016 大纲** 合成一个可查询的词形枢纽，并把查询结果变成可解释的学习决策。

- 在线访问：<https://e-chehil.github.io/lexical-workbench/>
- 代码仓库：<https://github.com/e-chehil/lexical-workbench>

---

## 1. 产品概览

| 工作区 | 作用 |
| --- | --- |
| **Explore** | 六类实体（词形 / COCA 词头 / COCA 词性记录 / BNC 词族 / BNC 成员 / CET 词目）的统一检索、筛选、排序、批量标注与投影集合 |
| **Corpus Lab** | 官方排行、词性分布、排名 × 频次曲线、派生词头排名 × BNC 频段交叉表、三源 Venn 与集合比较 |
| **Family Atlas** | 25,002 个词族的目录、成员频次 / 族内占比、掌握进度、按成员加入词集 |
| **Study** | 静态 / 动态词集、学习队列、四种可解释规划策略、CSV 导出 |
| **Insights** | 按单位分开的学习状态、COCA / BNC 频次加权覆盖率、频段推进、事件时间线 |
| **Data Studio** | 来源卡片与诊断、三源对齐、自定义来源替换、孤立目标审计、用户数据备份/导入 |

界面采用 **Observatory** 方向：深色编号导航轨、暖白数据画布、衬线词条、等宽数字与微标签；
桌面详情在 ≥1536px 默认泊靠、以下为浮层，移动端为全屏页。

---

## 2. 数据语义（不可妥协）

1. 每个数字都有 `MetricId`；派生指标必须带「（计算）」字样的声音与提示。
2. `null` = 来源未列出，`0` = 来源明确打印 0；绝不把 `null` 变成 0。
3. 数值不跨单位借用：词族总频次不出现在成员行，COCA 词元频次不出现在屈折形式上。
4. 不做形态推断：`went → go`、`colour = color`、`cafe = café` 只作为来源事实或候选关系。
5. 集合比较先投影到同一实体类别；跨源跳转只经过 Form 词形枢纽。
6. 适配器跳过坏单元并记录诊断，不修补、不求和、不猜测。

真实数据审计与数字见 [`docs/v2/DATA_AUDIT.md`](docs/v2/DATA_AUDIT.md)。

---

## 3. 技术栈

React 19 · TypeScript 7（`tsc --noEmit`）· Vite 8 · Tailwind 4 · Dexie 4 · Web Worker ·
TanStack Virtual · vite-plugin-pwa · `node:test` + `tsx`。

索引在 Worker 中从 `public/data/` 构建，主线程只接收 DTO；学习记录、词集、自定义来源与事件日志
保存在本机 IndexedDB `LexicalWorkbenchDB_v2`。

关键目录：

```text
src/v2/domain/       ids、实体类型、指标注册表
src/v2/sources/      三个来源适配器（含 CET 展开）
src/v2/engine/       LexicalIndex、查询协议、投影、DTO 构建
src/v2/learning/     学习状态、覆盖率、目标解析
src/v2/insights/     洞察报告（纯函数）
src/v2/planning/     四种学习规划策略（纯函数）
src/v2/store/        Dexie 存储、词集、备份
src/v2/worker/       Worker、RPC、加载器、消息注册表
src/app/             新 UI：shell、providers、search、detail、collections、workspaces/*
docs/v2/             实现计划、契约、架构、产品规格与数据审计
```

---

## 4. 开发命令

需要 Node ≥ 22（Windows 上 git 的 CRLF 警告是预期现象）。

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # TypeScript 类型检查
npm test           # 引擎、存储、路由、界面纯逻辑测试（真实数据）
npm run build      # 生产构建
npm run audit:v2   # 重新生成 docs/v2/data-audit.generated.json
```

生产构建支持 GitHub Pages 子路径：`npm run build:gh-pages`（`GITHUB_BASE` / `VITE_BASE_PATH`
逻辑见 `vite.config.ts`）。

---

## 5. 快捷键

- `Ctrl/⌘ K` 或 `/`：全局检索面板。
- `↑` / `↓`：移动名录焦点；`Shift + ↑/↓` 扩展选择。
- `Space`：勾选当前行；`Enter`：打开详情。
- `1`–`5`：未评 / 待学 / 在学 / 掌握 / 暂缓（选择优先，否则焦点行）。

---

## 6. 本地数据与备份

- 学习状态、标签、笔记、学习次数、事件日志、静态 / 动态词集和自定义来源都在本机 IndexedDB。
- **Data Studio → 用户数据** 可以导出 `version: 2` JSON 备份；导入为**替换模式**，导入前会完整校验，
  失败不会清空现有数据。
- 替换来源文件时先由适配器解析并在 Worker 中构建新索引，成功后才提交；失败继续使用当前来源。
- PWA 离线缓存来源文件、字体与应用资源；不向第三方字体或分析服务发请求。

---

## 7. 文档

- [`AGENTS.md`](AGENTS.md)：给后续 Agent 的项目规则与目录地图。
- [`docs/v2/IMPLEMENTATION_PLAN.md`](docs/v2/IMPLEMENTATION_PLAN.md)：任务状态与 NEXT_TASK。
- [`docs/v2/CONTRACTS.md`](docs/v2/CONTRACTS.md)：已实现的跨模块契约。
- [`docs/v2/ARCHITECTURE.md`](docs/v2/ARCHITECTURE.md)：领域模型、统计语义、ADR。
- [`docs/v2/PRODUCT_SPEC.md`](docs/v2/PRODUCT_SPEC.md)：工作区行为与验收项。
