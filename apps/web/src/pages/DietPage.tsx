import { useState } from 'react';
import {
  formatPortion,
  macroRatio,
  sumNutrients,
  type FoodRecord,
  type MealSlot,
  type Nutrients,
  type Portion,
  type PortionUnit,
} from '@petfocus/shared';
import type { WheelCategory } from '@petfocus/nutrition-db';
import { Button } from '../components/Button.tsx';
import { BarChart, BarChartLabels } from '../features/stats/BarChart.tsx';
import { CHART_COLORS } from '../features/stats/chart-theme.ts';
import { FoodWheel } from '../features/diet/FoodWheel.tsx';
import {
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  foodDbDisclosure,
  type DayMeals,
  type DailyIntake,
  type FrequentFood,
} from '../features/diet/usecases.ts';
import { useDiet } from '../features/diet/use-diet.ts';

/** 份量单位的中文标签 */
const UNIT_LABELS: Record<PortionUnit, string> = {
  GRAM: '克',
  ML: '毫升',
  SERVING: '份',
};

interface DietPageProps {
  now: number;
}

/**
 * 饮食记录页（PRD FR-5.2 / FR-5.3）。
 *
 * ⚠️ `useDiet` **必须在这里调用，不要提到 App 里**：
 * 它链式依赖 `nutrition-db` 的 `FOOD_DB`（500+ 条食物数据），
 * 一旦在 App 里调用，整个食物库会被打进首屏入口（实测 +77 KB，直接超标）。
 *
 * 设计原则：
 * - **如实**：本地库未命中就说未命中，不猜数值、不假装有 AI
 * - **不评判**：不出现"热量超标""今天吃太多了"这类话，只呈现事实
 * - **有出口**：不知道吃什么 → 转盘；懒 → 常吃排行"再来一份"
 */
export function DietPage({ now }: DietPageProps): JSX.Element {
  const diet = useDiet(now);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('100');
  const [unit, setUnit] = useState<PortionUnit>('GRAM');
  /** 本地库未命中时展开的手工录入面板 */
  const [manualFor, setManualFor] = useState<string | undefined>(undefined);
  const [manual, setManual] = useState({ kcal: '', protein: '', fat: '', carb: '' });

  const portion: Portion = { value: Number(amount) || 0, unit };

  const submit = async (): Promise<void> => {
    const outcome = await diet.add(name, portion, diet.slot);
    if (outcome.matched) {
      setName('');
      setManualFor(undefined);
    } else if (outcome.needsManual) {
      setManualFor(name);
    }
  };

  const submitManual = async (): Promise<void> => {
    if (!manualFor) return;
    const nutrients: Nutrients = {
      kcal: Number(manual.kcal) || 0,
      proteinG: Number(manual.protein) || 0,
      fatG: Number(manual.fat) || 0,
      carbG: Number(manual.carb) || 0,
    };
    await diet.addManual(manualFor, portion, diet.slot, nutrients);
    setManualFor(undefined);
    setName('');
    setManual({ kcal: '', protein: '', fat: '', carb: '' });
  };

  /** 转盘选中某个食物 → 填进输入框并切到"份"（因为转盘给的是整道菜） */
  const onWheelPick = (food: FoodRecord): void => {
    setName(food.name);
    setUnit(food.per.unit === 'SERVING' ? 'SERVING' : 'GRAM');
    setAmount(String(food.per.value));
  };

  const onWheelSector = (_category: WheelCategory): void => {
    // 目前只用于埋点/将来做"按类别筛选候选"，暂不需要状态
    void _category;
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">饮食记录</h1>
      </header>

      {diet.loading ? (
        <p className="text-sm text-ink-500" role="status">
          正在读取本机记录…
        </p>
      ) : diet.loadError ? (
        <p role="alert" className="rounded-card bg-clay-soft/25 p-4 text-sm text-clay-deep">
          饮食数据读取失败：{diet.loadError}
        </p>
      ) : (
        <div className="space-y-5">
          {/* 今日合计 */}
          <TodaySummary meals={diet.meals} />

          {/* 转盘 */}
          <FoodWheel onSectorChange={onWheelSector} onPick={onWheelPick} />

          {/* 添加入口 */}
          <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
            <h2 className="text-sm font-medium text-ink-700">记一笔</h2>

            {/* 餐次 */}
            <div role="tablist" aria-label="餐次" className="mt-3 flex flex-wrap gap-2">
              {MEAL_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  role="tab"
                  aria-selected={diet.slot === slot}
                  onClick={() => diet.setSlot(slot)}
                  className={[
                    'rounded-lg px-3 py-1 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep',
                    diet.slot === slot
                      ? 'bg-amber-base text-ink-900'
                      : 'border border-ink-300 text-ink-600 hover:bg-ink-100',
                  ].join(' ')}
                >
                  {MEAL_SLOT_LABELS[slot]}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[10rem] flex-1">
                <span className="text-xs text-ink-500">吃了什么</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submit();
                  }}
                  placeholder="例如：米饭 / 西红柿炒蛋"
                  className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                />
              </label>

              <label className="w-20">
                <span className="text-xs text-ink-500">份量</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                />
              </label>

              <label className="w-20">
                <span className="text-xs text-ink-500">单位</span>
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as PortionUnit)}
                  className="mt-1 w-full rounded-lg border border-ink-300 px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                >
                  {(Object.keys(UNIT_LABELS) as PortionUnit[]).map((key) => (
                    <option key={key} value={key}>
                      {UNIT_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>

              <Button onClick={() => void submit()}>添加</Button>
            </div>

            {diet.feedback ? (
              <p
                aria-live="polite"
                className={[
                  'mt-3 rounded-lg p-3 text-sm',
                  diet.feedback.matched ? 'bg-moss-soft/30 text-moss-deep' : 'bg-amber-soft/25 text-ink-700',
                ].join(' ')}
              >
                {diet.feedback.message}
              </p>
            ) : null}

            {/* 本地库未命中 → 手工补录（不猜数值） */}
            {manualFor ? (
              <div className="mt-3 rounded-lg bg-ink-100 p-3">
                <p className="text-xs text-ink-600">
                  手工填「{manualFor}」的营养值（可以只填热量，其余留空）
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ['kcal', '热量(千卡)'],
                      ['protein', '蛋白(克)'],
                      ['fat', '脂肪(克)'],
                      ['carb', '碳水(克)'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <span className="text-[11px] text-ink-500">{label}</span>
                      <input
                        type="number"
                        min="0"
                        value={manual[key]}
                        onChange={(event) =>
                          setManual((prev) => ({ ...prev, [key]: event.target.value }))
                        }
                        className="mt-0.5 w-full rounded border border-ink-300 px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => void submitManual()}>
                    保存
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setManualFor(undefined)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}

            {/* 常吃 */}
            {diet.frequent.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs text-ink-500">常吃的（点一下直接记）</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {diet.frequent.map((food: FrequentFood) => (
                    <button
                      key={food.normalizedName}
                      type="button"
                      onClick={() => {
                        setName(food.displayName);
                        setAmount(String(food.lastPortion.value));
                        setUnit(food.lastPortion.unit);
                      }}
                      className="rounded-lg border border-ink-300 px-2 py-1 text-xs text-ink-600 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                    >
                      {food.displayName}
                      <span className="ml-1 text-ink-400">×{food.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* 今日明细 */}
          <MealList meals={diet.meals} onRemove={(id) => void diet.remove(id)} />

          {/* 近 7 天趋势 */}
          <TrendStrip trend={diet.trend} />

          {/* 数据来源如实说明 */}
          <p className="text-[11px] text-ink-400">{foodDbDisclosure()}</p>
        </div>
      )}
    </div>
  );
}

function TodaySummary({ meals }: { meals: DayMeals | undefined }): JSX.Element {
  if (!meals || meals.count === 0) {
    return (
      <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
        <h2 className="text-sm font-medium text-ink-700">今天还没记录</h2>
        <p className="mt-1 text-sm text-ink-500">
          记下吃了什么就会自动估算营养。所有记录只存这台设备。
        </p>
      </section>
    );
  }

  const ratio = macroRatio(meals.total);
  return (
    <section aria-labelledby="today-title" className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
      <h2 id="today-title" className="text-sm font-medium text-ink-700">
        今天合计（{meals.count} 笔）
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="热量" value={`${Math.round(meals.total.kcal)}`} unit="千卡" />
        <Metric label="蛋白" value={meals.total.proteinG.toFixed(1)} unit="克" />
        <Metric label="脂肪" value={meals.total.fatG.toFixed(1)} unit="克" />
        <Metric label="碳水" value={meals.total.carbG.toFixed(1)} unit="克" />
      </div>

      {/* 宏量比例：只呈现事实，不做"超标"判断 */}
      {meals.total.kcal > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] text-ink-500">
            供能比例：蛋白 {Math.round(ratio.protein * 100)}% · 脂肪{' '}
            {Math.round(ratio.fat * 100)}% · 碳水 {Math.round(ratio.carb * 100)}%
          </p>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full">
            <div className="bg-moss-base" style={{ width: `${ratio.protein * 100}%` }} />
            <div className="bg-amber-deep" style={{ width: `${ratio.fat * 100}%` }} />
            <div className="bg-amber-base" style={{ width: `${ratio.carb * 100}%` }} />
          </div>
        </div>
      ) : null}

      {meals.total.fiberG !== undefined && meals.total.fiberG > 0 ? (
        <p className="mt-2 text-[11px] text-ink-400">膳食纤维约 {meals.total.fiberG.toFixed(1)} 克</p>
      ) : null}
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="tabular-nums font-medium text-ink-900">
        {value}
        <span className="ml-0.5 text-xs font-normal text-ink-400">{unit}</span>
      </p>
    </div>
  );
}

function MealList({
  meals,
  onRemove,
}: {
  meals: DayMeals | undefined;
  onRemove: (id: string) => void;
}): JSX.Element | null {
  if (!meals || meals.count === 0) return null;

  return (
    <section aria-labelledby="detail-title" className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
      <h2 id="detail-title" className="text-sm font-medium text-ink-700">
        今天的记录
      </h2>
      <div className="mt-3 space-y-3">
        {MEAL_SLOTS.map((slot: MealSlot) => {
          const rows = meals.bySlot[slot];
          if (rows.length === 0) return null;
          const subtotal = sumNutrients(rows.map((r) => r.nutrients));
          return (
            <div key={slot}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-medium text-ink-600">{MEAL_SLOT_LABELS[slot]}</h3>
                <span className="text-[11px] tabular-nums text-ink-400">
                  {Math.round(subtotal.kcal)} 千卡
                </span>
              </div>
              <ul className="mt-1 divide-y divide-ink-200">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-800">{row.foodName}</p>
                      <p className="text-[11px] text-ink-400">
                        {formatPortion({ value: row.portionValue, unit: row.portionUnit })}
                        {row.source === 'MANUAL' ? ' · 手工录入' : ''}
                        {row.source === 'AI_ESTIMATE' ? ' · AI 估算' : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-ink-600">
                      {Math.round(row.nutrients.kcal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(row.id)}
                      aria-label={`删除 ${row.foodName}`}
                      className="shrink-0 rounded px-1.5 text-ink-400 transition hover:text-clay-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TrendStrip({ trend }: { trend: DailyIntake[] }): JSX.Element {
  const withData = trend.filter((d) => d.hasData);
  if (withData.length === 0) {
    return (
      <section className="rounded-card bg-white/70 p-4 text-sm text-ink-500 ring-1 ring-ink-200">
        近 7 天还没有记录。坚持记几天就能看出自己的饮食节奏。
      </section>
    );
  }

  const peak = Math.max(...trend.map((d) => d.nutrients.kcal), 1);
  const avg = withData.reduce((sum, d) => sum + d.nutrients.kcal, 0) / withData.length;

  return (
    <figure className="m-0 rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
      <h2 className="text-sm font-medium text-ink-700">近 7 天热量</h2>
      {/* 用 SVG 柱状图：柱高是算出来的像素坐标，不依赖父元素的百分比高度 */}
      <div className="mt-3">
        <BarChart
          ariaLabel="近 7 天热量摄入柱状图"
          height={80}
          groupWidth={30}
          maxValue={peak}
          series={[
            {
              name: '热量',
              color: CHART_COLORS.amberBase,
              values: trend.map((day) => ({
                key: day.dayKey,
                value: day.nutrients.kcal,
                color: day.hasData ? CHART_COLORS.amberBase : CHART_COLORS.empty,
                title: `${day.dayKey}：${Math.round(day.nutrients.kcal)} 千卡`,
              })),
            },
          ]}
        />
      </div>
      <BarChartLabels labels={trend.map((day) => day.dayKey.slice(8))} />
      <figcaption className="mt-2 text-xs text-ink-500">
        有记录的 {withData.length} 天平均 {Math.round(avg)} 千卡
      </figcaption>

      <table className="sr-only-focusable">
        <caption>近 7 天热量明细</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">热量</th>
            <th scope="col">蛋白</th>
            <th scope="col">脂肪</th>
            <th scope="col">碳水</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((day) => (
            <tr key={day.dayKey}>
              <th scope="row">{day.dayKey}</th>
              <td>{Math.round(day.nutrients.kcal)}</td>
              <td>{day.nutrients.proteinG.toFixed(1)}</td>
              <td>{day.nutrients.fatG.toFixed(1)}</td>
              <td>{day.nutrients.carbG.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
