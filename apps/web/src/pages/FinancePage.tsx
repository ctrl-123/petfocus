import { useCallback, useEffect, useState } from 'react';
import {
  MODULE_COIN,
  formatMoney,
  formatSignedMoney,
  splitBill,
  type BudgetLevel,
  type FinanceType,
} from '@petfocus/shared';
import { Button } from '../components/Button.tsx';
import {
  FINANCE_PRIVACY_NOTICE,
  addEntry,
  ensureCategories,
  isFinanceStoreReady,
  loadDay,
  loadMonth,
  loadTrend,
  removeEntry,
  setMonthBudget,
  type DayFinance,
  type MonthFinance,
} from '../features/finance/usecases.ts';
import type { DailyFinance, FinanceCategoryRecord } from '@petfocus/shared';

interface FinancePageProps {
  now: number;
}

const READY_POLL_MS = 50;
const READY_TIMEOUT_MS = 5_000;

/** 预算档位的颜色：只表达程度，不带评语 */
const BUDGET_TONE: Record<BudgetLevel, string> = {
  NONE: 'bg-ink-200',
  SAFE: 'bg-moss-base',
  WATCH: 'bg-amber-base',
  NEAR: 'bg-amber-deep',
  OVER: 'bg-clay-deep',
};

/**
 * 记账页（PRD FR-5.3）。
 *
 * 设计原则：
 * - **不评判消费**：只显示数字与比例，绝不出现"花太多了""要节制"这类话。
 *   记账工具一旦开始说教，用户就不记了。
 * - **金额走整数分**：加减与汇总全部用整数，只在展示时除以 100
 * - **隐私如实提示**：数据只在本机；导出文件是明文 JSON
 */
export function FinancePage({ now }: FinancePageProps): JSX.Element {
  const [day, setDay] = useState<DayFinance | undefined>(undefined);
  const [month, setMonth] = useState<MonthFinance | undefined>(undefined);
  const [trend, setTrend] = useState<DailyFinance[]>([]);
  const [categories, setCategories] = useState<FinanceCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);

  // 表单
  const [type, setType] = useState<FinanceType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('cat-food');
  const [note, setNote] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  /** 拆账结果（按人数均分） */
  const [splitParts, setSplitParts] = useState(2);

  const reload = useCallback(async (): Promise<void> => {
    const [dayData, monthData, trendData, cats] = await Promise.all([
      loadDay(now),
      loadMonth(now),
      loadTrend(now, 14),
      ensureCategories(),
    ]);
    setDay(dayData);
    setMonth(monthData);
    setTrend(trendData);
    setCategories(cats);
  }, [now]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    void (async () => {
      while (!cancelled && !isFinanceStoreReady()) {
        if (Date.now() - startedAt > READY_TIMEOUT_MS) {
          setLoadError('本机存储启动超时，记账数据暂时无法读取。刷新页面可重试。');
          setLoading(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, READY_POLL_MS));
      }
      if (cancelled) return;
      try {
        await reload();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reload]);

  const visibleCategories = categories.filter((c) => c.type === type);

  const onSubmit = async (): Promise<void> => {
    const result = await addEntry({ amountText: amount, type, categoryId, note }, Date.now());
    setFeedback(result.message);
    if (result.ok) {
      setAmount('');
      setNote('');
      await reload();
    }
  };

  const onSaveBudget = async (): Promise<void> => {
    if (!month) return;
    const ok = await setMonthBudget(month.monthKey, budgetInput);
    setFeedback(ok ? '本月预算已保存。' : '预算金额填得不太对，试试「3000」这样的写法。');
    if (ok) {
      setBudgetInput('');
      await reload();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">记账</h1>
      </header>

      {loading ? (
        <p className="text-sm text-ink-500" role="status">
          正在读取本机记录…
        </p>
      ) : loadError ? (
        <p role="alert" className="rounded-card bg-clay-soft/25 p-4 text-sm text-clay-deep">
          记账数据读取失败：{loadError}
        </p>
      ) : (
        <div className="space-y-5">
          {/* 本月概览 */}
          {month ? (
            <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-ink-700">本月（{month.monthKey}）</h2>
                <span className="text-[11px] text-ink-400">
                  共 {month.summary.entryCount} 笔
                </span>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-ink-500">支出</p>
                  <p className="tabular-nums text-lg font-semibold text-clay-deep">
                    {formatMoney(month.summary.expenseCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">收入</p>
                  <p className="tabular-nums text-lg font-semibold text-moss-deep">
                    {formatMoney(month.summary.incomeCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">净额</p>
                  {/* 净额为负是事实，不用红色警告色，也不加评语 */}
                  <p className="tabular-nums text-lg font-semibold text-ink-900">
                    {formatMoney(month.summary.netCents)}
                  </p>
                </div>
              </div>

              {/* 预算 */}
              {month.budget.level === 'NONE' ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="w-28">
                    <span className="text-xs text-ink-500">本月预算</span>
                    <input
                      type="number"
                      min="0"
                      value={budgetInput}
                      onChange={(event) => setBudgetInput(event.target.value)}
                      placeholder="3000"
                      className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                    />
                  </label>
                  <Button variant="outline" size="sm" onClick={() => void onSaveBudget()}>
                    设置
                  </Button>
                  <p className="text-[11px] text-ink-400">不设也可以，只是看不到进度。</p>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between text-xs text-ink-600">
                    <span>
                      预算 {formatMoney(month.budget.limitCents)} · 已用{' '}
                      {Math.round(month.budget.usedRatio * 100)}%
                    </span>
                    <span className="tabular-nums">
                      {month.budget.remainingCents >= 0
                        ? `还剩 ${formatMoney(month.budget.remainingCents)}`
                        : `已超出 ${formatMoney(-month.budget.remainingCents)}`}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-200">
                    <div
                      className={`h-full rounded-full ${BUDGET_TONE[month.budget.level] ?? 'bg-ink-300'}`}
                      style={{ width: `${Math.min(100, month.budget.usedRatio * 100)}%` }}
                    />
                  </div>
                  {month.budget.remainingCents > 0 ? (
                    <p className="mt-1 text-[11px] text-ink-400">
                      这个月还剩 {month.remainingDays} 天，平均每天可用{' '}
                      {formatMoney(month.dailyAllowanceCents)}。
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {/* 记一笔 */}
          <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
            <h2 className="text-sm font-medium text-ink-700">记一笔</h2>

            <div role="tablist" aria-label="收支类型" className="mt-3 flex gap-2">
              {(['EXPENSE', 'INCOME'] as FinanceType[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={type === item}
                  onClick={() => {
                    setType(item);
                    const first = categories.find((c) => c.type === item);
                    if (first) setCategoryId(first.id);
                  }}
                  className={[
                    'rounded-lg px-3 py-1 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep',
                    type === item
                      ? 'bg-amber-base text-ink-900'
                      : 'border border-ink-300 text-ink-600 hover:bg-ink-100',
                  ].join(' ')}
                >
                  {item === 'EXPENSE' ? '支出' : '收入'}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="w-32">
                <span className="text-xs text-ink-500">金额</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void onSubmit();
                  }}
                  placeholder="12.5"
                  className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                />
              </label>

              <label className="min-w-[9rem] flex-1">
                <span className="text-xs text-ink-500">备注（可选）</span>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="午饭"
                  className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                />
              </label>

              <Button onClick={() => void onSubmit()}>记下</Button>
            </div>

            {/* 分类选择：用真实按钮表达选中态 */}
            <fieldset className="mt-3">
              <legend className="text-xs text-ink-500">分类</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {visibleCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={categoryId === cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={[
                      'rounded-lg border px-2 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep',
                      categoryId === cat.id
                        ? 'border-amber-base bg-amber-soft/30 text-ink-900'
                        : 'border-ink-300 text-ink-600 hover:bg-ink-100',
                    ].join(' ')}
                  >
                    <span aria-hidden="true" className="mr-1">
                      {cat.icon}
                    </span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* 拆账工具：算完可以直接填进金额 */}
            <details className="mt-3 rounded-lg bg-ink-100 p-3">
              <summary className="cursor-pointer text-xs text-ink-600">
                要 AA 或分账？算一下每人多少
              </summary>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="w-28">
                  <span className="text-[11px] text-ink-500">人数</span>
                  <input
                    type="number"
                    min="1"
                    value={splitParts}
                    onChange={(event) => setSplitParts(Math.max(1, Number(event.target.value) || 1))}
                    className="mt-0.5 w-full rounded border border-ink-300 px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                  />
                </label>
                <div className="text-sm text-ink-700">
                  {amount.trim().length > 0 && !Number.isNaN(Number(amount))
                    ? (() => {
                        const totalCents = Math.round(Number(amount) * 100);
                        const parts = splitBill(totalCents, splitParts);
                        const unique = [...new Set(parts)];
                        return (
                          <span className="tabular-nums">
                            {unique.length === 1
                              ? `每人 ${formatMoney(unique[0] ?? 0)}`
                              : `每人 ${formatMoney(Math.min(...parts))}–${formatMoney(Math.max(...parts))}（余数分摊）`}
                          </span>
                        );
                      })()
                    : '先在上面填金额'}
                </div>
              </div>
            </details>

            {feedback ? (
              <p aria-live="polite" className="mt-3 rounded-lg bg-moss-soft/25 p-3 text-sm text-moss-deep">
                {feedback}
              </p>
            ) : null}

            <p className="mt-2 text-[11px] text-ink-400">
              每天前 {MODULE_COIN.financeDailyMax} 笔记账各 +{MODULE_COIN.financePerEntry} 金币。
            </p>
          </section>

          {/* 今日明细 */}
          <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-ink-700">今天（{day?.dayKey}）</h2>
              {day ? (
                <span className="text-[11px] tabular-nums text-ink-400">
                  支出 {formatMoney(day.summary.expenseCents)} · 收入{' '}
                  {formatMoney(day.summary.incomeCents)}
                </span>
              ) : null}
            </div>

            {!day || day.entries.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">今天还没有记录。</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink-200">
                {day.entries.map((entry) => {
                  const cat = categories.find((c) => c.id === entry.categoryId);
                  return (
                    <li key={entry.id} className="flex items-center gap-2 py-2">
                      <span aria-hidden="true" className="text-lg">
                        {cat?.icon ?? '📦'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink-800">
                          {cat?.name ?? '未分类'}
                          {entry.note ? <span className="ml-2 text-ink-400">{entry.note}</span> : null}
                        </p>
                      </div>
                      <span
                        className={[
                          'shrink-0 text-sm tabular-nums',
                          entry.type === 'EXPENSE' ? 'text-clay-deep' : 'text-moss-deep',
                        ].join(' ')}
                      >
                        {formatSignedMoney(entry.amountCents, entry.type)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            await removeEntry(entry.id);
                            await reload();
                          })();
                        }}
                        aria-label="删除这条记录"
                        className="shrink-0 rounded px-1.5 text-ink-400 transition hover:text-clay-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 本月支出分类 */}
          {month && month.summary.expenseByCategory.length > 0 ? (
            <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
              <h2 className="text-sm font-medium text-ink-700">本月支出构成</h2>
              <ul className="mt-2 space-y-1.5">
                {month.summary.expenseByCategory.slice(0, 8).map((row) => {
                  const cat = month.categoryNames[row.categoryId];
                  const ratio = month.summary.expenseCents > 0
                    ? row.amountCents / month.summary.expenseCents
                    : 0;
                  return (
                    <li key={row.categoryId}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-ink-700">
                          <span aria-hidden="true" className="mr-1">
                            {cat?.icon ?? '📦'}
                          </span>
                          {cat?.name ?? '未分类'}
                        </span>
                        <span className="tabular-nums text-ink-600">
                          {formatMoney(row.amountCents)}
                          <span className="ml-1 text-[11px] text-ink-400">
                            {Math.round(ratio * 100)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink-200">
                        <div className="h-full rounded-full bg-amber-base" style={{ width: `${ratio * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* 近 14 天趋势 */}
          <TrendChart trend={trend} />

          <p className="text-[11px] text-ink-400">{FINANCE_PRIVACY_NOTICE}</p>
        </div>
      )}
    </div>
  );
}

function TrendChart({ trend }: { trend: DailyFinance[] }): JSX.Element {
  const peak = Math.max(...trend.map((d) => Math.max(d.expenseCents, d.incomeCents)), 1);
  const hasAny = trend.some((d) => d.expenseCents > 0 || d.incomeCents > 0);

  if (!hasAny) {
    return (
      <section className="rounded-card bg-white/70 p-4 text-sm text-ink-500 ring-1 ring-ink-200">
        近 14 天还没有记录。
      </section>
    );
  }

  return (
    <figure className="m-0 rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
      <h2 className="text-sm font-medium text-ink-700">近 14 天</h2>
      <div className="mt-3 flex h-20 items-end gap-1" role="img" aria-label="近 14 天收支柱状图">
        {trend.map((day) => (
          <div key={day.dayKey} className="flex min-w-0 flex-1 items-end gap-[1px]">
            <div
              className="flex-1 rounded-t bg-clay-base/70"
              style={{ height: `${Math.max(day.expenseCents > 0 ? 3 : 0, (day.expenseCents / peak) * 100)}%` }}
              title={`${day.dayKey} 支出 ${formatMoney(day.expenseCents)}`}
            />
            <div
              className="flex-1 rounded-t bg-moss-base/70"
              style={{ height: `${Math.max(day.incomeCents > 0 ? 3 : 0, (day.incomeCents / peak) * 100)}%` }}
              title={`${day.dayKey} 收入 ${formatMoney(day.incomeCents)}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {trend.map((day) => (
          <span key={day.dayKey} className="min-w-0 flex-1 text-center text-[9px] text-ink-400">
            {day.dayKey.slice(8)}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-ink-500">
        红为支出、绿为收入（单位：元）
      </figcaption>

      <table className="sr-only-focusable">
        <caption>近 14 天收支明细</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">支出</th>
            <th scope="col">收入</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((day) => (
            <tr key={day.dayKey}>
              <th scope="row">{day.dayKey}</th>
              <td>{formatMoney(day.expenseCents)}</td>
              <td>{formatMoney(day.incomeCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
