/**
 * 食物转盘（PRD FR-5.2 / AC-5.2.x）。
 *
 * ── 设计意图（很重要，别把它做成玩具）──
 * 转盘**不是"随机抽一个食物"，而是帮你在"不知道吃什么"时先定下大方向**。
 * 因此：指针落在一个**类别扇区**上 → 给出该类别下的一个具体食物 → 你可以"换一个"。
 * 这一步顺序是有意的：先缩小到"想吃哪类"，再从该类里挑具体的东西。
 *
 * ── 为什么用 SVG 画扇形而不是 CSS 拼 ──
 * 早先版本用 `rotate + skewY` 拼扇形，**形状会溢出容器**（没被裁剪时铺满整页，
 * 截图里就是了）。SVG 的 `path` 用极坐标精确算点，天然不会溢出，也不需要调坐标。
 *
 * ── 无障碍（NFR-5.2）──
 * 扇区标签是真实文本节点（SVG `<text>`，带白色描边保证对比度）；
 * 结果通过 aria-live 播报。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FOOD_DB,
  WHEEL_CATEGORIES,
  categoryCounts,
  foodsByTag,
  type WheelCategory,
} from '@petfocus/nutrition-db';
import type { FoodRecord } from '@petfocus/shared';
import { Button } from '../../components/Button.tsx';

/** 转盘配色：同一暖色系的不同深度，避免"彩虹玩具"观感 */
const SECTOR_COLORS: ReadonlyArray<string> = [
  '#e8a33d',
  '#d68f3a',
  '#c47f4a',
  '#b07055',
  '#9c6a52',
  '#c98f5c',
  '#d9a05b',
  '#e0b071',
  '#b8834f',
  '#a8763f',
  '#cf9a6a',
];

const SECTORS = WHEEL_CATEGORIES;

/** SVG 画布尺寸与几何（外径/内径），全部由这里决定，不在别处散落魔法数 */
const SIZE = 200;
const CENTER = SIZE / 2;
const OUTER_R = 96;
const INNER_R = 34;

function polar(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

/** 画一个圆环扇区（annulus wedge） */
function wedgePath(startDeg: number, endDeg: number): string {
  const a = polar(OUTER_R, startDeg);
  const b = polar(OUTER_R, endDeg);
  const c = polar(INNER_R, endDeg);
  const d = polar(INNER_R, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${a.x.toFixed(2)} ${a.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
    `L ${c.x.toFixed(2)} ${c.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

type Phase = 'IDLE' | 'SPINNING' | 'BROWSING';

interface FoodWheelProps {
  onSectorChange: (category: WheelCategory) => void;
  onPick: (food: FoodRecord) => void;
}

export function FoodWheel({ onSectorChange, onPick }: FoodWheelProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [rotation, setRotation] = useState(0);
  const [sector, setSector] = useState<WheelCategory | undefined>(undefined);
  const [candidate, setCandidate] = useState<FoodRecord | undefined>(undefined);
  const [rerolls, setRerolls] = useState(0);
  const lastPickedIdRef = useRef<string | undefined>(undefined);
  const timerRef = useRef(0);

  const counts = useMemo(() => categoryCounts(FOOD_DB), []);

  /** 每个扇区的角度范围：均分 360 度 */
  const sectorDeg = 360 / SECTORS.length;

  const pickFrom = useCallback((category: WheelCategory): FoodRecord | undefined => {
    const pool = foodsByTag(category, FOOD_DB);
    if (pool.length === 0) return undefined;
    if (pool.length === 1) return pool[0];
    const index = Math.floor(Math.random() * pool.length);
    const chosen = pool[index] ?? pool[0];
    if (chosen && chosen.id === lastPickedIdRef.current && pool.length > 1) {
      return pool[(index + 1) % pool.length];
    }
    return chosen;
  }, []);

  const spin = useCallback((): void => {
    if (phase === 'SPINNING') return;
    const targetIndex = Math.floor(Math.random() * SECTORS.length);
    const target = SECTORS[targetIndex];
    if (!target) return;

    setPhase('SPINNING');
    setCandidate(undefined);
    setRerolls(0);

    // 指针固定在正上方（0 度）。要让目标扇区中心转到 0 度：
    // 扇区 i 的中心在 i*sectorDeg + sectorDeg/2，因此反向旋转同样的角度。
    const targetCenter = targetIndex * sectorDeg + sectorDeg / 2;
    const extraTurns = 3 + Math.floor(Math.random() * 2);
    const currentMod = ((rotation % 360) + 360) % 360;
    const nextRotation = rotation + extraTurns * 360 + ((360 - targetCenter - currentMod + 360) % 360);

    setRotation(nextRotation);

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setSector(target.key);
      onSectorChange(target.key);
      setCandidate(pickFrom(target.key));
      setPhase('BROWSING');
    }, 1900);
  }, [phase, rotation, sectorDeg, onSectorChange, pickFrom]);

  const reroll = useCallback((): void => {
    if (!sector) return;
    setRerolls((n) => n + 1);
    const food = pickFrom(sector);
    setCandidate(food);
    if (food) lastPickedIdRef.current = food.id;
  }, [sector, pickFrom]);

  const sectorDef = sector ? SECTORS.find((s) => s.key === sector) : undefined;

  return (
    <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
      <h2 className="text-sm font-medium text-ink-700">不知道吃什么？转一下</h2>
      <p className="mt-1 text-xs text-ink-500">
        转盘先帮你定下大方向（想吃哪一类），再从那类里挑具体的。
      </p>

      <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {/* 转盘本体：固定 200×200，永远在框内 */}
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          {/* 指针：固定在正上方，指向圆心 */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-0 z-20 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '14px solid #3a2f28',
            }}
          />

          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="absolute inset-0 transition-transform duration-[1900ms] ease-out"
            style={{ transform: `rotate(${rotation}deg)` }}
            role="img"
            aria-label="食物类别转盘"
          >
            {SECTORS.map((item, index) => {
              const start = index * sectorDeg;
              const end = start + sectorDeg;
              const mid = start + sectorDeg / 2;
              const labelPos = polar((OUTER_R + INNER_R) / 2, mid);
              const color = SECTOR_COLORS[index % SECTOR_COLORS.length] ?? '#e8a33d';
              const isActive = sector === item.key;
              return (
                <g key={item.key}>
                  <path
                    d={wedgePath(start, end)}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1.5}
                    opacity={sector === undefined || isActive ? 1 : 0.55}
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fontWeight={500}
                    fill="#3a2f28"
                    stroke="#fff"
                    strokeWidth={2.5}
                    paintOrder="stroke"
                    transform={`rotate(${mid} ${labelPos.x} ${labelPos.y})`}
                  >
                    {item.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* 中心按钮 */}
          <button
            type="button"
            onClick={spin}
            disabled={phase === 'SPINNING'}
            className={[
              'absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2',
              'rounded-full bg-ink-100 font-medium text-ink-800 shadow ring-4 ring-white',
              'transition hover:bg-white focus-visible:outline-none focus-visible:ring-amber-deep',
              phase === 'SPINNING' ? 'cursor-wait opacity-70' : '',
            ].join(' ')}
            style={{ width: 64, height: 64, fontSize: 13 }}
          >
            {phase === 'SPINNING' ? '转…' : phase === 'BROWSING' ? '再转' : '转一下'}
          </button>
        </div>

        {/* 结果区：与转盘并排，不再另起一大块 */}
        <div aria-live="polite" className="min-w-0 flex-1">
          {phase === 'BROWSING' && sectorDef ? (
            <div className="rounded-lg bg-amber-soft/25 p-3">
              <p className="text-xs text-ink-500">
                转到「{sectorDef.label}」（{counts[sectorDef.key]} 种可选）
              </p>
              {candidate ? (
                <>
                  <p className="mt-1 text-base font-medium text-ink-900">{candidate.name}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {candidate.nutrients.kcal} 千卡 / 100 克
                    {candidate.tags.length > 0 ? ` · ${candidate.tags.slice(0, 3).join(' · ')}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onPick(candidate)}>
                      就吃这个
                    </Button>
                    <Button variant="outline" size="sm" onClick={reroll}>
                      换一个
                    </Button>
                  </div>
                  {rerolls >= 3 ? (
                    <p className="mt-2 text-xs text-ink-500">
                      换了 {rerolls} 次都不合意？可能这个方向不对，再转一次试试别的类别。
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-sm text-ink-600">这个类别下暂时没有可选的食物。</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-400">
              点中间开始。转到哪一类，就从那一类里出具体的菜。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
