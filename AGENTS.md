# AGENTS.md · PetFocus（自律岛）

> **本文件是本仓库对 AI 编码代理（以及人类协作者）的最高约束。**
> 当本文件与任何其他文档、注释、口头描述冲突时，**以本文件为准**。
> 本文件不描述「功能怎么实现」——那在 `docs/` 里。本文件只描述「在这个仓库里该怎么工作」。

---

## 0. 当前阶段：🚧 编码中（M8 第一阶段已完成：可部署）

| 项 | 状态 |
|---|---|
| 已完成 | **M0–M7 全部** · **M8-1 导出/导入 UI + 演示模式 + PWA + Vercel 配置** |
| 待办（M8-2） | Supabase Edge Functions（结算 + AI 营养回退）· 实际部署到你自己的 Vercel 账号 · Live2D spike · 换装台独立页 |
| 部署步骤 | 见 `docs/部署指南.md`（含「需要你操作」的明确标注） |

**当前验证状态**：`pnpm verify` 全绿（**871 测试 / 0 失败**，行覆盖 96.2%、分支 93.1%、函数 90.1%）· `pnpm build` 入口 JS **337.0 KB / gzip 112.7 KB**（预算 350 KB）· 八个按需分块（ShopPanel 7.1 / demo-data 7.8 / SessionPage 9.8 / StatsPage 12.6 / FitnessPage 14.3 / DataPage 14.4 / FinancePage 19.0 / DietPage 93.6）

### 0.0 体积纪律（每次加功能都要看）

首屏预算 350 KB，入口目前在 337 KB。因此：

- **新增页面一律用 `React.lazy` + `Suspense`**（见 `App.tsx`）
- ⚠️ **懒加载的模块不能被静态 import**。商城的 `ShopPanel` 曾与首页的 `PetPanel`
  同文件，导致动态导入无法拆块（构建会 warning：`is dynamically imported ... but also statically imported`）
- ⚠️ **大块数据必须放在懒加载的模块里**。踩过两次：
  1. `useDiet` 提到 `App.tsx` 调用 → 502 条食物数据进首屏（+77 KB）
  2. 演示数据被 `boot.ts` 静态 import → 菜品名进首屏（+8 KB，改成 `await import()` 后恢复）
- **不要引入图表库**（自绘 SVG，见下）
- 守卫：`apps/web/src/bundle-budget.test.ts` 断言入口 ≤ 350 KB、至少 3 个按需分块、
  且**入口里不得出现食物库的中文名**（哨兵字符串）。这两次都是它抓出来的。

### 0.0.1 统计图表是自绘 SVG，不要换成图表库

`apps/web/src/features/stats/charts.tsx`。理由缺一不可：

1. **体积**：预算只剩十几 KB，任何图表库都装不下
2. **无障碍**：NFR-5.2 要求「图表必须提供文本等价物」，多数库默认做不到。
   自绘的每个图表都带一个 `sr-only-focusable` 的 `<table>`（读屏可读、可搜索），
   并且颜色不是唯一信息载体（同时有数值与 `title`）

### 0.0.2 食物库的数据必须过校验器（不是靠肉眼）

`packages/nutrition-db/src/validate.ts` 会检查能量与三大营养素是否自洽，
由 `food-db.test.ts` 守卫（当前零问题）。**新增或修改食物条目后必须跑测试**。

三个必须建模的现实（否则会满屏误报，我踩过）：

1. **膳食纤维也产能（约 2 kcal/g），而成分表的"碳水"不含纤维**。
   因此 4×蛋白+9×脂肪+4×碳水 会**系统性偏低**，高纤维蔬菜可差 40%。
   判据必须是区间 `[可见宏量产能, 可见宏量产能 + 纤维产能]`。
2. **酒精产能不在三大营养素内**（乙醇 7 kcal/g），含酒精条目完全跳过能量校验。
3. **"一份"不等于 100 克**。一个汉堡套餐 600 多克，"营养素是否超过份量"的检查
   只能对克/毫升基准的条目做。

### 0.1 装扮只保留 6 件：**宁可少而精，不要多而糙**

曾经有 22 件装扮、27 种 CSS 绘制特征，但多数经需求方预览后判定"画得奇怪"，全部下架重做，
最终只保留需求方确认好看并继续扩展的 6 件：
**蝴蝶结（双耳之间）、草帽、发光皇冠、小手套、气球、提灯**（外加 1 个默认背景）。

**这条经验对本项目很重要**：粗糙的装扮不会激励用户攒币，只会让人觉得敷衍。
新增装扮前，先在浏览器里确认形状真的好看，否则不要加进目录。

### 0.2 配件绘制用 SVG + 统一坐标系（改形状前必读）

`renderer.ts` 用 **130×130 的 viewBox，每个 SVG 单位 = 0.01rem**，身体盒（65×60 单位）居中。
于是坐标可以**推导**而不是靠试：

| 锚点 | 坐标 |
|---|---|
| 身体盒 | x 32.5–97.5，y 35–95 |
| 左耳 / 右耳圆心 | (39, 46) / (91, 46)，半径 9.5 |
| **双耳中点（蝴蝶结结心）** | **(65, 46)** |
| 面部中心 / 身体底部 | (65, 60) / y 95 |

配件容器用 `inset: -50%`（SVG 盒是身体盒的 2 倍），使帽子、气球等**超出身体也不被裁剪**。
配件挂在 `.pet-body` **内部**，因此天然跟随身体的动画与心情姿态。

**改动任何身体尺寸（`.pet-body` 的 6.5rem × 6rem、耳朵的 1.9rem）都必须同步更新坐标注释**，
并有测试守卫生死（`pet-css-build.test.ts`）。

### 0.3 宠物的渲染是 SVG，**不是 Live2D**（务必如实说明）

`apps/web/src/features/pet/renderer.ts` 定义了 `PetRenderer` 接口，当前唯一实现是
`CssPetRenderer`（纯 SVG/CSS 画的小生物，零外部资源、无许可约束）。

- **界面与「关于」页不得声称是 Live2D**（同 AGENTS.md 原则 1：不假装有能力）
- 换装商品一律标 `modelCompat: 'PARTIAL'` 并在 UI 显示「通过叠加层适配」，
  因为当前渲染器不支持模型部件级换装
- 待 spike 选定模型后实现 `PixiLive2DRenderer` 即可替换，**不需要改任何业务代码**
- 已就绪的兜底：若最终放弃 Live2D，改用 Rive / 序列帧，宠物功能完整性不受影响

### 0.4 dev server 会因「编辑工具的临时文件」崩溃（EBUSY）

现象：`vite.config.ts` 的 `server.watch` 需要忽略 `**/*.tmpdir/**` 与 `**/*.tmp`。
某些编辑方式（写临时文件 + 原子重命名）会产生形如
`.TaskList.tsx.<pid>.<uuid>.tmpdir/TaskList.tsx.tmp` 的临时文件，
Vite 的 fs watcher 抓到正在被占用的它们会抛 `EBUSY` 并**直接终止 dev server**。
`apps/web/vite.config.ts` 已配置忽略规则；若再次遇到，先确认该规则还在。

**仍然有效的纪律**：不要跳过验证；不要把未验证的代码说成"已完成"；遇到文档没写的行为先问。

### 0.5 React effect 顺序导致「运行时未就绪」（真实踩过的 bug）

**症状**：宠物面板永久停在「正在唤醒宠物…」，没有任何报错。

**根因**：React 的 effect 是**子组件先执行、父组件后执行**。
`runtime` 是在父组件（`App` 的 `useBoot`）的 effect 里通过 `setRuntime` 设置的，
而子组件里 `usePet` 的 effect **先跑**，此时 `getRuntime()` 抛
「运行时尚未就绪」。原代码没有 try/catch，于是 `setLoading(false)` 永不执行。

**修法（两条都要有）**：
1. `usecases.ts` 用 `tryGetRuntime()` + `isPetStoreReady()`，未就绪时抛可识别的 `RUNTIME_NOT_READY`
2. `use-pet.ts` **轮询等待就绪**（50ms 间隔、5s 上限）后再加载，并且**必须把真实错误显示给用户**
   ——一个永不结束的加载态比一句报错糟糕得多

**推广**：任何在子组件挂载时就要访问 `getRuntime()` 的用例层调用，都要先判断就绪；
`apps/web/src/features/pet/usecases.test.ts` 里有对应的回归测试，新模块请照抄这个模式。

### 0.6 动态拼接的类名**绝不能**放进 Tailwind 的层里（真实踩过的缺陷）

**症状**：点商城的「试穿」什么都不显示。typecheck 通过、lint 通过、单元测试全绿。

**根因**：27 个配件类名是运行时拼的（`acc-` + trait 小写），源码里从不出现字面量。
它们原先写在 `styles.css` 的 Tailwind `components` 层里，而 **Tailwind v3 对层内的类
同样做内容扫描清除**，于是全部被判定为未使用并在构建时删除。

**修法**：配件样式放在**普通 CSS 文件**里（`apps/web/src/features/pet/pet-renderer.css`），
由 `main.tsx` 直接 import —— Vite 会原样打包，不经 Tailwind 的清除。

**守卫**：`apps/web/src/features/pet/pet-css-build.test.ts` 会读**构建产物 CSS** 并断言
全部配件类都在。这类"只有产物才暴露"的问题，必须由产物本身的检查兜住。
后续任何"运行时拼类名"的样式都按这个模式处理。

### 0.7 不要用 PowerShell 读中文文件

排查产物时曾出现「`<title>` 显示为 `鑷緥宀?`」的乱码，一度怀疑文件编码坏了。
**实为假警报**：文件是合法 UTF-8，是 PowerShell 的 `Get-Content` 按 GBK 读取导致的显示问题。

- 检查中文内容时**用 Node 读**（`readFile(...).toString('utf8')`），不要用 `Get-Content`
- 判断「是否合法 UTF-8」看有没有 `U+FFFD` 替换字符，而不是看终端显示
- 构建产物里中文会被转义成 `\uXXXX`，直接搜中文会搜不到——要先解码再搜

### 0.8 不要手写 .cmd 启动脚本

仓库根目录的 `dev.cmd` 由 `tools/gen-dev-cmd.mjs` 生成，**不要手工编辑**。
原因：cmd.exe 按系统 ANSI 代码页（中文 Windows 是 GBK）解析 .batch 文件，
UTF-8 的中文会变成乱码命令导致**双击闪退**；且必须使用 CRLF 换行。
生成脚本会做字节级自检（非 ASCII 字节数必须为 0、必须含 CRLF）。

---

## 1. 项目速览

| 项 | 内容 |
|---|---|
| 名称 | 自律岛 / PetFocus |
| 一句话 | 会管住你、也会陪着你的个人工作台：到点锁住电脑，干完给宠物发工资 |
| 形态 | PWA Web 应用（主交付，Vercel 免费版）+ 可选 Windows 桌面增强包（C#，提供真实应用拦截） |
| 用户 | 18–32 岁、有明确目标但总开不了工的学生与职场人 |
| 运行环境 | Windows（开发机实测：Node v24.19.0 · Git 2.56.0 · pnpm 9.15.4 · VS Code 1.140.0 · .NET 8 ✅） |
| 语言 | TypeScript strict（前端） / C# .NET 8（增强包） / SQL（Supabase） |
| 后端 | **仅 Supabase Edge Function**（免费版），只做两件事：按设备 ID 结算金币/配额 + 代理 AI 营养估算 |
| 文档语言 | 简体中文；代码标识符与提交信息用英文 |

### 1.1 四条不可动摇的产品原则

1. **绝不假装有拦截能力。** 浏览器无法结束其他进程。Web 端必须如实标注「软约束」，只有桌面增强包在线时才显示「硬约束已生效」。
2. **惩罚不羞辱。** 任何面向用户的文案，指向方法与事实，绝不指向人格。禁止出现「你真懒」「又失败了」「对不起宠物」一类表达。
3. **宠物不死亡、不离家出走。** 无论用户多久没来、被罚多少次，宠物只会「蔫」，不会消失、不会掉级到无法恢复。
4. **没有账号，数据只在本机。** 不实现注册/登录/邮箱/密码/用户资料，界面任何位置不得出现「账号」概念；身份只是一个前端生成的匿名设备 ID。**所有业务数据（待办、会话、统计、宠物、健身、饮食、记账）只存本机 IndexedDB，绝不上云。** 换设备靠导出/导入 JSON。

---

## 2. 目录地图与依赖方向

```
apps/web/src/
  app/         路由、Provider、错误边界
  pages/       页面（只做组合，写业务逻辑即违规）
  features/    按功能切分：focus/lock/tasks/stats/shop/pet/fitness/diet/finance/settings
               └─ 每个 feature 内含 components/ hooks/ usecases/ __tests__/
  domain/      纯函数领域层 ★ 零依赖（禁止 import React / Dexie / fetch / Supabase）
  data/        Dexie schema、仓储实现、结算队列（outbox）、Edge Function 客户端
  platform/    能力适配器（fullscreen/visibility/notification/wakelock/processguard/clock）
  components/  通用 UI 组件
  test/        测试基建（FakeClock、factories、内存仓储、MSW handlers）

packages/shared/        跨端类型、Zod schema、config（经济/配额/时长常数）、文案库、经济公式（前后端共用）
packages/nutrition-db/  本地食物营养库（数据 + 构建脚本 + 来源说明）
supabase/migrations/    SQL 迁移（仅 devices / coin_ledger / quota_ledger / ai_nutrition_cache 四张表）
supabase/functions/     Edge Functions（register-device / settle-session / consume-quota / claim-grant / ai-nutrition）
tools/companion/        C# 桌面增强包
docs/                   需求研究 / PRD / 技术设计 / ADR / spikes
```

### 2.1 依赖方向铁律（ESLint 强制，违反即 CI 失败）

```
pages → features → domain
                ↘ data → platform
domain  ──✗──▶  禁止 import 除 packages/shared 纯类型与常量之外的任何东西
```

- `domain/` 里出现 `import React`、`import Dexie`、`fetch(`、`new Date()`（除显式传入的时间戳外）→ **视为严重缺陷**。
- `pages/` 里出现业务规则计算（如金币公式、配额判断）→ **视为严重缺陷**，必须下沉到 `domain/` + `features/*/usecases`。
- 跨 feature 直接互相 import 内部文件 → 禁止；只能通过 `features/<x>/index.ts` 的公开出口。

---

## 3. 编码规范（强制）

### 3.1 通用

| 规则 | 要求 |
|---|---|
| TypeScript | `strict: true`；**禁止 `any`**（用 `unknown` + 类型守卫或 Zod 解析） |
| 类型导入 | 使用 `import type { ... }` |
| 枚举 | 用字符串字面量联合类型，禁止 `enum`（除 C#） |
| 时间 | 一律 `number`（Unix 毫秒 UTC）存储；格式化只在渲染层；禁止存 ISO 字符串 |
| 日期计算 | 只用 `date-fns`；**禁止 Moment.js**；禁止手写 `new Date(y, m, d)` 做跨时区运算 |
| 随机数 | 业务上出现随机（话术、待机动作、转盘）必须可注入种子，便于测试 |
| 浮点 | 金额一律用**整数分**；金币用整数；比例用 `number` 但展示时四舍五入 |
| 命名 | 组件 `PascalCase`；函数/变量 `camelCase`；常量 `SCREAMING_SNAKE`；文件 `kebab-case.ts`（组件文件 `PascalCase.tsx`） |
| 导出的函数 | 必须有显式返回类型标注（禁止依赖推断的公共 API） |
| 注释 | 只在「为什么」不显然时写；禁止复述代码的注释；禁止留 `TODO` 而不写明条件 |
| 副作用 | `useEffect` 必须有清晰的依赖与清理；禁止在渲染期读写存储 |
| 错误处理 | 禁止空 `catch`；错误必须要么处理、要么带上上下文重新抛出 |

### 3.2 数值集中配置（PRD 第 17 章 / NFR-6.3）

以下数值**只能**出现在 `packages/shared/src/config/`：

- 金币基础值、时长系数、质量系数、每日上限、商品价格
- 配额数量（专注每日/每月、锁机每月、跳过每日）
- 惩罚值（越界扣币、跳过扣币、蔫时长）
- 违规阈值（30 秒）、宽限期（3 分钟）、自然日边界（4 点）
- 宠物衰减速率、动作冷却、心情阈值

组件或领域函数里出现上述任一数字字面量 → **视为缺陷**。测试可以引用配置常量，但不能复制数值。

### 3.3 文案

- 所有面向用户的字符串集中在 `packages/shared/src/copy/`，按功能分文件。
- 奖励话术每档 ≥ 8 条（PRD FR-1.5），新增话术必须自查是否符合「惩罚不羞辱」原则。
- 禁止在 JSX 里写裸中文文案（除纯标记性文本如 `aria-label` 可集中管理）。

### 3.4 无障碍（NFR-5）

- 交互元素必须是 `<button>` / `<a>`，禁止 `<div onClick>`。
- 模态框必须有焦点陷阱与 `Esc` 关闭（Radix UI 原生支持，不要自己写）。
- 图表必须提供文本等价物。
- 新增动画必须尊重 `prefers-reduced-motion`。
- 提交前自查：Tab 能否走完全部核心操作？焦点可见吗？

---

## 4. 关键机制不可被「简化」

以下机制是经过设计权衡的，**代理不得为了「代码更简单」而替换实现方式**。若认为确有必要，先提问、先改文档。

| 机制 | 必须这样做 | 明确禁止 |
|---|---|---|
| 会话计时 | 由 `startedAtMonotonic` + `pausedIntervals` 推导（ADR-003） | 用 `setInterval` 累加秒数；把「剩余秒数」当唯一状态存库 |
| 会话持久化 | 仅在状态变更与每 15 秒心跳时落盘 | 每秒写 IndexedDB |
| 配额/金币权威 | 服务端时间 + Edge Function 结算（ADR-004 / ADR-010） | 纯本地结算；信任客户端 `Date.now()`；把 `periodKey` 交给客户端计算 |
| 经济公式 | 前端与 Edge Function 引用 `packages/shared` 同一份源码 | 在服务端复制一份公式 |
| **数据驻留** | **业务数据只写本机 IndexedDB**；只有结算与 AI 请求出网 | 把待办/会话/宠物/记账/饮食上传到服务端；建业务数据的云端镜像表 |
| **身份** | 匿名设备 ID（`crypto.randomUUID()`）+ 本地密钥 + HMAC 请求签名 | 引入注册/登录/邮箱/密码；界面出现「账号」字样；把密钥上传 |
| 结算队列 | outbox 只承载 4 类请求：SETTLE / CONSUME_QUOTA / CLAIM_GRANT / AI_NUTRITION | 把纯本地数据放进 outbox；把 outbox 当同步队列用 |
| 服务端访问控制 | RLS 启用但**不建任何 policy**（默认全拒）+ 撤销 `anon`/`authenticated` 表权限；仅 Edge Function 用 `service_role` | 建 `auth.uid()` 策略；让前端直读表 |
| 约束能力 | 适配器模式 + 必须存在 Noop 降级实现 | 无能力时抛异常/白屏；UI 谎称已拦截 |
| 换装 | 优先模型内建部件，其次 Pixi 叠加层（ADR-006） | 为换装重新制作整套模型；选用了「禁止设计变更」的模型却做换装 |
| 宠物状态 | 由前端领域函数计算，只写本地 | 让服务端参与宠物状态计算 |
| 演示数据 | 独立 IndexedDB 库，物理隔离 | 把演示数据写进真实库 |
| 多标签页 | leader election（技术设计 E19） | 允许多标签各自计时 |
| 依赖方向 | `domain/` 零依赖 | 在 domain 里 import React/Dexie/fetch |
| **模块解析** | `moduleResolution: bundler` + 源码写显式 `.ts` 相对导入 | 改回 `nodenext`（会让 Dexie 的类型解析退化，见下）；改回 `rewriteRelativeImportExtensions`（与 `allowImportingTsExtensions` 互斥） |
| **Dexie 导入** | 就用 `import Dexie from 'dexie'` | 改成 `dexie/dist/dexie.js` 等子路径，或自己写类型垫片去引 `node_modules/.pnpm/...` 深层路径 |

### 4.1 模块解析坑的完整记录（别再踩）

**现象**：`class X extends Dexie` 报 `TS2507: Type 'typeof import(".../dexie/dist/dexie")' is not a constructor function type`，
尽管运行时完全正常（测试全绿）。

**根因（经 `--traceResolution` 与最小复现确认）**：
Dexie 4.4.6 的 `import-wrapper.d.mts` 内容是
`export * from './dist/dexie.js'; export { default } from './dist/dexie.js';`。
在 `moduleResolution: nodenext` 下，`'./dist/dexie.js'` 被解析成 **CJS 形态**的 `dist/dexie.d.ts`，
其 `export { Dexie as default }` 无法作为构造函数类型的 default 导出，于是默认导入退化成「模块命名空间对象」。

**解法**：`moduleResolution: bundler`。

**为什么这个解法对本项目是正确的而不是将就**：数据层最终由 Vite 打包进浏览器应用，本身就是 bundler 场景；
`nodenext` 是为 Node 库作者准备的。代价是不能再使用 `rewriteRelativeImportExtensions`
（与 `allowImportingTsExtensions` 互斥），所以源码统一写 `./foo.ts` 这种显式相对导入——
这对 Node 的 `--experimental-strip-types` 直接运行测试反而更安全。

**排查过程中的一个方法论教训**：一开始我用「只把 Dexie 当类型比较」的探针测试，结果显示"通过"，
于是误判为 tsconfig 开关问题，浪费了多轮。**探针必须复现真实用法**（这里是 `extends`，才需要构造函数类型）；
否则探针本身会给出假阳性。另外要注意 `tsc <file>` 会向上查找并使用仓库根的 `tsconfig.json`，
并不会使用"默认配置"——我一度据此得出错误结论。

---

## 5. 验证要求（Definition of Done，代理自检清单）

**任何代码变更在声称完成之前，必须逐项自查：**

- [ ] `pnpm typecheck` 通过（无 `any`、无类型错误）
- [ ] `pnpm lint` 通过（含架构依赖规则）
- [ ] `pnpm test` 通过；`domain/` 覆盖率 ≥ 95%，整体 ≥ 80%
- [ ] 新增/修改的领域规则有对应单测，且测试使用 `FakeClock` 而非真实定时器
- [ ] 新增数值已放入 `config/` 并有测试引用
- [ ] 涉及 UI 的变更有组件测试或 E2E 覆盖关键路径
- [ ] 无 `console.log` 残留（用统一的 logger）
- [ ] 无硬编码密钥、无 `// @ts-ignore`、无 `eslint-disable` 而无理由注释
- [ ] **出网请求审查**：新增的任何网络请求只传「结算摘要」或「食物名+份量」，**不得携带任何业务数据**
- [ ] **文案审查**：全站不出现「登录 / 注册 / 账号 / 密码」；不出现「防作弊 / 无法破解」一类承诺
- [ ] 如改变了 PRD/技术设计中的行为，**已同步更新对应文档**（见第 7 节）

**代理禁止做的事：**

- ❌ 为了让测试通过而修改测试断言（应先判断是实现错还是需求错，并说明）
- ❌ 顺手重构与任务无关的代码（保持变更聚焦；确有必要则单独提出）
- ❌ 新增依赖而不说明理由（新增依赖必须写清：解决什么问题、替代方案、体积影响）
- ❌ 放宽 `tsconfig` / ESLint 规则来绕过错误
- ❌ 在用户未授权的情况下创建业务代码（见第 0 节）

---

## 6. 数据与迁移

| 场景 | 要求 |
|---|---|
| 修改 IndexedDB schema | 必须新增 Dexie `version(n+1)`，附 `upgrade()` 变换；必须有迁移测试（造旧数据 → 升级 → 断言） |
| 修改云端表 | 新增 `supabase/migrations/<timestamp>_<name>.sql`；**禁止修改已应用的迁移文件** |
| 新增云端表 | **默认不允许**。服务端只应有 `devices` / `coin_ledger` / `quota_ledger` / `ai_nutrition_cache` 四张表；要新增必须先在技术设计中说明理由并成为 ADR。新增时必须：建表 + 索引 + 启用 RLS 且**不建 policy** + 撤销 `anon`/`authenticated` 权限 |
| 破坏性变更 | 分两步：先加新字段并双写，后删旧字段（至少隔一个版本） |
| 删除数据 | 只做软删除（`deletedAt`），硬删除仅限「用户主动清空数据」；**清除本地数据前必须先强制导出** |
| 导出兼容 | 导出文件带 `schemaVersion`；导入时做版本校验与必要的迁移；导入提供「合并 / 覆盖」两种模式 |
| 敏感数据 | 记账金额、饮食记录属于隐私数据，导出文件为明文 JSON，相关 UI 必须提示「请自行妥善保管」 |

---

## 7. 文档同步规则（文档即契约）

| 你改了什么 | 必须同步更新 |
|---|---|
| 用户可见行为、验收标准 | `docs/02-PRD-产品需求文档.md`（对应 AC 编号） |
| 架构、数据模型、机制、接口契约 | `docs/03-技术设计文档.md` |
| 技术选型或被否方案 | 技术设计文档「2.2 架构决策记录（ADR）」新增/修改 ADR |
| 平台能力边界 | 需求研究第 5 节 + 技术设计第 12 节 + README |
| 数值（金币/配额/惩罚） | PRD 第 17 章 + `packages/shared/src/config/` |
| 仓库工作方式 | 本文件 `AGENTS.md` |

**原则**：文档与代码不一致时，默认**代码是错的**，除非用户明确表示口头决定覆盖文档——此时也必须先把文档改掉再改代码。

---

## 8. 提交与协作约定

| 项 | 约定 |
|---|---|
| 分支 | `main`（可发布）/ `feat/<scope>` / `fix/<scope>` / `docs/<scope>` |
| 提交信息 | Conventional Commits：`feat(focus): 到点自动进入专注`；scope 用目录名 |
| 提交粒度 | 一个提交只做一件事；不混合格式化与逻辑变更 |
| PR 描述 | 必须写明：改了什么 / 为什么 / 如何验证 / 是否影响文档 |
| 合并前 | CI 全绿 + 自检清单通过 |
| 禁止 | 提交 `.env`、密钥、`node_modules`、`dist`、大型模型资源（走 Git LFS 或 CDN） |

---

## 9. 环境与命令（预期，编码阶段生效）

```bash
pnpm install              # 安装依赖
pnpm dev                  # 启动开发服务器（apps/web 就绪后可用）
pnpm typecheck            # tsc --noEmit（bundler 解析，见第 4 节）
pnpm lint                 # ESLint（含架构依赖规则）
pnpm test                 # Node 内置测试运行器（--experimental-strip-types 直接跑 .ts）
pnpm test:coverage        # 覆盖率
pnpm verify               # typecheck + lint + test:coverage（提交前必跑，当前全绿）

# 桌面增强包（Windows，需管理员）
dotnet publish tools/companion -c Release -r win-x64 -p:PublishSingleFile=true --self-contained false
```

**测试框架说明**：领域层单测用 **Node 内置 `node:test`**（而不是技术设计里写的 Vitest）。
理由：Node 24 的 `--experimental-strip-types` 可直接运行 `.ts`，零额外依赖、启动更快，
且对 `packages/shared` 这种「零依赖 + 纯函数」的代码完全够用。
组件测试与 E2E 仍按技术设计使用 Testing Library / Playwright（待 M3 引入）。

**本机环境现状（2026-02-14 实测，已全部就位）**：
Git `D:\APP\git` · pnpm `D:\APP\pnpm` · Node `D:\APP\Node.js` · VS Code `D:\Apps\VSCode`。
其中前三个已加入用户 PATH，终端可直接调用。
另：本机沙箱若限制读取 `D:\APP\Node.js`，`node`/`pnpm` 会报 `EPERM`——
此时需在更高权限下执行，而不是改用其他安装方式。

---

## 10. 当你不确定时

| 情况 | 正确做法 |
|---|---|
| 文档没写这个行为 | **停下来问用户**，不要发明规则，更不要"先实现了再说" |
| 文档之间冲突 | 优先级：`AGENTS.md` > 技术设计 > PRD > 需求研究；并报告冲突 |
| 需求与平台能力冲突 | 报告「这在 Web 上做不到」，给出降级方案，**绝不假装做到** |
| 测试与需求冲突 | 以需求为准（文档）→ 修实现；若判断需求本身有问题，先说明再动手 |
| 需要新增依赖 | 先在回复中说明：为什么现有依赖不够、替代方案、体积影响，得到认可再加 |
| 变更会超出当前任务范围 | 先完成当前任务，把额外发现写成建议提出，不擅自扩大改动 |

---

## 11. 面向评审者的提示（面试/演示场景）

本仓库的文档是**作品的一部分**。评审者常会问：

1. **「网页怎么可能阻止我打开微信？」** → 答：做不到，所以有 ADR-001 与边界清单，并提供原生增强包。见 `docs/research/01-需求研究报告.md` 第 5 节与技术设计 12.1。
2. **「用户改系统时间刷金币怎么办？」** → 答：单调时钟计时 + 服务端时间权威 + 幂等键 + 异常标记。见 ADR-003/004/010 与技术设计 5.4。
3. **「为什么不用 Electron？」** → 见 ADR-001 的被否方案。
4. **「怎么保证前端和服务端算的金币一样？」** → 共享同一份源码 + CI 契约测试。见技术设计 5.4.1。
5. **「断网了还能用吗？」** → 能。业务数据本来就在本地，只有金币结算进队列等联网，见技术设计 5.3。
6. **「为什么不做账号/登录？防作弊怎么办？」** → 见 ADR-010：身份是前端生成的匿名设备 ID，配 HMAC 请求签名，**能挡住改系统时间与改 localStorage，挡不住打开 DevTools 抄密钥**——这是被明确接受并如实公示的残余风险。回答时**不要**声称「防作弊」。
7. **「数据存在哪？换电脑怎么办？」** → 全部在本机 IndexedDB，服务端只有 3 张结算账本表；换电脑靠导出/导入 JSON（见技术设计 5.3.4）。
8. **「为什么宠物不能用最常用的 Hiyori 模型？」** → 该模型的许可明文禁止任何设计变更，无法配合换装。见 PRD 15.1。
9. **「这项目每月花多少钱？」** → 0 元。Vercel Hobby + Supabase Free + Live2D 个人免发布许可；唯一变动成本是 AI 营养估算（本地库优先，重度使用约 1–3 元/月，不配 Key 则为 0）。已查证官方额度并单列 ADR-011，含成本护栏。
10. **「免费版会被暂停，简历链接不就挂了？」** → Supabase 免费项目 7 天不活动会被暂停，但**业务数据本来就在用户本机**，网页仍完整可用，只有金币结算进队列。这正是本地优先架构的价值。见 ADR-011 与 11.6 上线检查清单的降级验证项。

因此：**任何削弱上述机制「可解释性」的改动，都要谨慎**——这些正是这个项目值得被看见的地方。

---

## 12. 成本红线（硬性约束）

> 需求方明确要求低资金投入。**「月支出 0 元」是产品约束，不是优化目标。** 依据 ADR-011 与 PRD 16.4。

| 规则 | 要求 |
|---|---|
| 基础设施 | 只用免费额度：Vercel Hobby + Supabase Free + 免费授权的 Live2D 模型 |
| 付费红线 | **不得引入任何按月订阅**。若某功能必须付费才能实现，**先降级功能**，并向用户说明后再讨论 |
| 新增云服务 | 必须先说明「免费额度多少、本项目预计消耗、超限怎么办」，得到认可才可引入 |
| AI 调用 | 必须有护栏：本地库优先 → 服务端缓存 → 每设备每日 ≤ 20 次 → 全局每日 ≤ 200 次；超限返回 `AI_UNAVAILABLE` 并回退手动录入 |
| 成本可见 | 设置页显示「本月结算与 AI 调用量」 |
| 降级优先 | 结算服务不可用时，**网页必须仍能正常打开与使用**（本地优先）。这是硬性验收项，不是「尽力而为」 |
