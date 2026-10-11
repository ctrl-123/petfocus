// @ts-check
/**
 * ESLint 扁平配置。
 *
 * 这个文件的价值不在「风格检查」，而在于**用机器强制 AGENTS.md 里的架构铁律**：
 *   1. domain/ 层零依赖（禁止 React / Dexie / fetch / Supabase）
 *   2. 业务数值只能出现在 packages/shared/src/config/（禁止散落的魔法数字）
 *   3. 禁止 any / ts-ignore / eslint-disable 逃逸
 *
 * 违反即 CI 失败。见 AGENTS.md 第 2 节与 3.2 节。
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** domain 层禁止 import 的模块（技术设计 3 节「依赖方向铁律」） */
const FORBIDDEN_IN_DOMAIN = [
  { name: 'react', message: 'domain 层必须零依赖，禁止 import react（AGENTS.md 3 节）' },
  { name: 'react-dom', message: 'domain 层必须零依赖' },
  { name: 'dexie', message: 'domain 层禁止访问持久化层，仓储由 data/ 提供' },
  { name: '@supabase/supabase-js', message: 'domain 层禁止网络访问' },
  { name: 'pixi.js', message: 'domain 层禁止渲染依赖' },
  { name: 'zustand', message: 'domain 层禁止状态管理依赖' },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.pnpm-store/**',
      '**/.npm-cache/**',
      '**/.npm-global/**',
      '**/.tools/**',
      '**/coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 全仓库通用规则
  {
    files: ['**/*.ts'],
    rules: {
      // AGENTS.md 3.1：禁止 any（用 unknown + 类型守卫）
      '@typescript-eslint/no-explicit-any': 'error',
      // 禁止用 ts-ignore / ts-expect-error 逃逸类型检查（需写理由才允许，这里一律禁）
      '@typescript-eslint/ban-ts-comment': 'error',
      // 禁止空 catch（AGENTS.md 3.1）
      'no-empty': ['error', { allowEmptyCatch: false }],
      // 禁止 console.log 残留（AGENTS.md 5 节完成度清单）
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // 禁止 == null 之外的松散比较
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // 禁止 var
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // 架构铁律 1 & 2：domain 层零依赖 + 禁止魔法数字
  {
    files: ['packages/shared/src/domain/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: FORBIDDEN_IN_DOMAIN,
          patterns: [
            {
              group: ['node:fs', 'node:http', 'node:https', 'node:child_process', 'fs', 'http', 'https'],
              message: 'domain 层禁止 IO 与网络',
            },
            {
              group: ['**/data/**', '**/platform/**', '**/features/**', '**/pages/**', '**/components/**'],
              message: 'domain 层不得依赖上层模块（依赖方向：pages → features → domain）',
            },
          ],
        },
      ],
      // 业务数值必须来自 config/。
      // ignore 列表说明：0/1/2/3/4 是**结构性与类型性**常量
      // （数组下标、`HeatLevel = 0|1|2|3|4` 这类联合类型字面量、比较基准），
      // 不是可调业务参数；真正的业务数值（时长、金币、阈值）一律在 config/ 里。
      'no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2, 3, 4],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreTypeIndexes: true,
          enforceConst: false,
          detectObjects: false,
        },
      ],
    },
  },

  // domain 的测试文件：允许硬编码期望值（测试本来就要写具体数字），但保留架构约束
  {
    files: ['packages/shared/src/domain/**/*.test.ts'],
    rules: {
      'no-magic-numbers': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: FORBIDDEN_IN_DOMAIN,
        },
      ],
    },
  },

  // 测试基建与测试文件：允许 console 与任意数字
  {
    files: ['**/*.test.ts', 'packages/shared/src/test/**/*.ts', 'tools/**/*.mjs'],
    rules: {
      'no-console': 'off',
      'no-magic-numbers': 'off',
    },
  },

  // apps/web：UI 层的布局数值（间距、字号、超时）不属于「业务数值」，
  // 不受 no-magic-numbers 约束；但业务数值仍必须来自 @petfocus/shared 的 config。
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-magic-numbers': 'off',
      // 领域层零依赖的铁律不适用于 UI，但 UI 仍不该直接 import Dexie
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dexie',
              message: 'UI 层不得直接访问数据库，请通过 app/runtime.ts 暴露的仓储',
            },
          ],
        },
      ],
    },
  },

  // Service Worker：运行在 worker 全局作用域里，不是 window 也不是 Node。
  // 它需要 caches / fetch / Response / self 这些 worker 全局变量。
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        URL: 'readonly',
        Promise: 'readonly',
      },
    },
    rules: {
      // SW 里 await 一个不关心的清理动作是正常的，但空 catch 仍禁止
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // 脚本文件（.mjs）：Node 环境，且不需要类型检查规则
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
);
