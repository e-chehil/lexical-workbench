# Lexical Workbench

本地优先（Local-First）的个人英语词汇数据库、BNC/COCA 25,000 词族检索、CET-4/CET-6 官方大纲对照与学习规划工作台。

- **在线访问（GitHub Pages）**：<https://e-chehil.github.io/lexical-workbench/>
- **代码仓库（GitHub）**：<https://github.com/e-chehil/lexical-workbench>

---

## 1. 产品定位

**Lexical Workbench** 是面向英语学习者与词汇研究者的 **个人词汇数据库与词族分析工作台**：

- **精确数据在底层，直观关系在表层，个人学习决策在中心**：将四六级考纲词表与 BNC/COCA 25,000 词族频次库有机融合，帮助学习者理解词汇、观察词族派生关系、记录个人掌握进度并遴选下一批高杠杆待学词汇。
- **全量词族与词频检索**：即时查询任意单词、屈折变形（如 `abilities`）或多词短语（如 `owing to`），查看其所属 BNC/COCA 1k–25k 词族、词族总频次、各派生词独立频次与族内占比。
- **官方四六级大纲精确映射**：严格区分 CET-4 基础词与 CET-6 进阶词，完整保留同形异义词编号（`¹ ² ³`）、斜杠并列简写（`a/an`、`advisor/-er`、`sober/-re`）、括号可选字母（`ag(e)ing`、`catalog(ue)`）及同词目派生链。
- **个人学习状态与规划**：支持 5 态学习标注（未评 / 待学 / 在学 / 掌握 / 暂缓）、复习打卡记录、自定义标签、词条助记笔记、基于词频与熟词词族杠杆的下一批待学词单生成，以及与外部词书的 TSV / 标准 CSV（RFC 4180）批量同步。
- **本地优先与离线可用**：所有个人学习记录、词集、变更日志及自定义词表持久化存储于浏览器本地 IndexedDB（`LexicalWorkbenchDB_v1`），支持 JSON 全量备份/保守合并恢复与 PWA 离线安装。

---

## 2. 数据工程与解析审计摘要

系统在构建统一词形索引时严格区分独立统计口径，绝不伪造或混用词频：

### 2.1 `CET2016.txt`（全国大学英语四、六级考试大纲词表）
- **编码与分隔符处理**：自动剥离文件首行 UTF-8 BOM（`\uFEFF`），严格按真实 Tab（`\t`）切分同词目下的词头与派生词，完整保留多词短语内部空格（共 5 项多词短语：`according to`、`baby boom`、`acid rain`、`owing to`、`zero hour`）。
- **官方词目总行数**：`5,377` 行（其中 CET-4 基础词目 `4,114` 行，CET-6 进阶词目 `1,263` 行）。
- **语法记号展开与去重**：
  - 同形异义上标编号（`¹ ² ³`）：`154` 项（展示保留编号，跨源匹配与外部查词时自动还原基础词形）。
  - 斜杠并列与词尾简写（`/`）：`130` 项（区分完整词并列与后缀简写，如 `advisor/-er` → `advisor`, `adviser`；`sober/-re` → `sober`, `sobre`）。
  - 括号可选字母（`()`）：`80` 项（同时生成含括号与不含括号的拼写变体，如 `jewel(l)ery` → `jewelery`, `jewellery`）。
  - 展开后总引用数：`8,110` 项；去重后独立规范化 CET 词形数：**`8,014` 词形**。

### 2.2 `BNC_COCA_lists.txt`（BNC/COCA 1k–25k 词族频次表）
- **有效词族记录行数**：**`25,002` 词族**，覆盖 `1k`–`25k` 共 25 个千词频段。
- **成员词形记录与多重归属**：共 **`76,126` 个成员槽位**，对应 **`76,125` 个去重独立词形**（其中 `grannies` 在原始词表中合法归属 `grandfather` 1k 与 `granny` 6k 两个词族，系统完整保留其多重词族归属；显式频次为 `(0)` 的词形共 `7,947` 项）。

### 2.3 跨源对齐与统一词形索引
- **统一索引独立词形总数**：**`76,331` 词形**
- **CET 词形与 BNC/COCA 25k 直接精确匹配**：**`7,825` 词形**（拥有独立 BNC/COCA 实测词频）
- **CET 未直接收录于 BNC 25k 的词形**：**`189` 词形**
  - 其中 **`17` 项变体关联词形**（如 `oftentimes`、`airplane`、`sobre`、`coup d'état`、`bbq` 等）已关联至同词目变体所属 BNC 词族，但其 `formFrequency` 严格记为 `null / 无独立频次`，绝不借用同词目其他拼写的词频；
  - 其余 **`172` 项**为未进入 BNC 25k 的独立考纲词形或多词短语（频次标记为 `null / 未收录`）。
- **仅存在于 BNC/COCA**：**`68,317` 词形**

---

## 3. 快捷键与高效操作

- **`⌘K` / `Ctrl+K` 或 `/`**：唤起全局快速检索面板（支持任意变形词反查词族代表词）。
- **`↑` / `↓`**：在词库列表中上下移动当前选中词条；配合 **`Shift + ↑/↓`** 或鼠标按住勾选框上下拖动可连续批量选中。
- **`Space` / `Enter`**：在词库列表中切换当前行勾选状态或打开词条详情面板。
- **数字键 `1` – `5`**：对当前选中词条（或批量勾选词条）快速切换学习状态（`1` 未评 · `2` 待学 · `3` 在学 · `4` 掌握 · `5` 暂缓）。

---

## 4. 本地开发与 GitHub Pages 自动部署

本项目为纯前端静态单页应用（React 19 + TypeScript + Vite + Tailwind CSS + VitePWA），支持根路径（`/`，如本地开发与 Google AI Studio 预览）和 GitHub Pages 项目子路径（`/lexical-workbench/`）双环境构建。

### 4.1 本地开发与构建命令

项目使用 `bun.lock` 锁文件，推荐使用 **Bun**（亦可使用 Node.js / npm）：

```bash
# 安装依赖
bun install

# 启动本地开发服务器 (http://localhost:3000)
bun run dev

# 运行解析器与统计逻辑单元测试
npx tsx --test src/data/parser.test.ts

# 类型检查
bun run lint

# 默认根路径构建 (base = "/")
bun run build

# GitHub Pages 子路径构建 (base = "/lexical-workbench/")
bun run build:gh-pages
```

### 4.2 GitHub Pages 自动部署配置

仓库已内置 `.github/workflows/deploy.yml` 工作流：

1. **触发条件**：每次推送到 `main` 分支（`push`）自动触发，同时支持在 GitHub Actions 页面手动触发（`workflow_dispatch`）。
2. **构建环境**：使用 `oven-sh/setup-bun@v2` 与 `bun install`，通过环境变量 `GITHUB_PAGES=true` 和 `VITE_BASE_PATH=/lexical-workbench/` 执行构建，自动将 HTML、JS/CSS 静态资源、词表文件（`data/CET2016.txt`、`data/BNC_COCA_lists.txt`）、PWA Manifest（`id` / `start_url` / `scope`）及 Service Worker（`/lexical-workbench/sw.js`）切换到 `/lexical-workbench/` 子路径下。

### 4.3 注意事项与数据安全

- **本地数据存储**：用户的学习状态、标签、笔记、词集、变更日志和自定义词表保存在当前设备浏览器的 IndexedDB（数据库名 `LexicalWorkbenchDB_v1`）及 `localStorage` 中，不会上传至任何服务器。
- **标准多行 CSV（RFC 4180）往返同步**：导出的 CSV 与批量同步解析器完整支持含逗号、转义双引号（`""`）、引号内换行符（`\n` / `\r\n`）、多词短语（如 `owing to`、`baby boom`）及中文标签/笔记的无损往返导入。
- **跨设备迁移与备份**：清理浏览器站点数据前，或需要在桌面端与手机端同步进度时，请前往「**数据设置**」板块点击「**导出 JSON 备份**」，并在目标设备上使用「**导入 JSON 恢复**」：
  - **保守合并（按最新时间）**：当本地记录与备份记录的 `updatedAt` 时间戳不同时，严格以较新快照的学习状态、标签、笔记、复习次数及静态词集成员为准（尊重用户主动将状态重置为 `unrated` 或删除标签/词集词条的操作）；仅在时间戳完全相同时对标签和静态词集取并集。
  - **完全覆盖**：带二次确认保护，清空当前浏览器已有记录并用备份文件完全替换。
- **自定义词表安全校验**：上传替换 `CET2016.txt` 或 `BNC_COCA_lists.txt` 时，系统会先在内存中完成文件格式与解析结构校验，校验通过后才会写入 IndexedDB 并切换词库；若上传了空文件、错误类型文件或无效词表，系统会明确报错并完整保留当前可用词库。

