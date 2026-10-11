import { lazy, Suspense, useCallback, useState } from 'react';
import { useBoot } from './app/boot.ts';
import { useNow } from './app/use-now.ts';
import { type View } from './app/view.ts';
import { usePlatform } from './platform/index.ts';
import { useSession, type StartInput } from './features/focus/use-session.ts';
import { usePet } from './features/pet/use-pet.ts';
import { PetPanel } from './features/pet/PetPanels.tsx';
import { levelInfoOf } from './features/pet/usecases.ts';
import { HomePage } from './pages/HomePage.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Button } from './components/Button.tsx';

/**
 * 按需加载的页面。
 *
 * 为什么要懒加载（体积预算 350 KB，见技术设计第 9 节）：
 * - 商城、统计、饮食、健身、记账都只有用户主动点进去才需要
 * - 专注会话页是全屏接管层，只有真的开始专注时才用得上
 *
 * ⚠️ 两个必须守住的约束（都真实踩过，见 AGENTS.md §0.0）：
 * 1. 懒加载的模块不能被**静态** import，否则拆不出块
 * 2. 会拉进大数据的 hook（如 useDiet 背后的 500 条食物库）必须写在页面内部，
 *    **不要提到 App 里**
 */
const ShopPanel = lazy(() =>
  import('./features/pet/ShopPanel.tsx').then((m) => ({ default: m.ShopPanel })),
);
const SessionPage = lazy(() =>
  import('./features/focus/SessionPage.tsx').then((m) => ({ default: m.SessionPage })),
);
const StatsPage = lazy(() =>
  import('./pages/StatsPage.tsx').then((m) => ({ default: m.StatsPage })),
);
const DietPage = lazy(() => import('./pages/DietPage.tsx').then((m) => ({ default: m.DietPage })));
const FitnessPage = lazy(() =>
  import('./pages/FitnessPage.tsx').then((m) => ({ default: m.FitnessPage })),
);
const FinancePage = lazy(() =>
  import('./pages/FinancePage.tsx').then((m) => ({ default: m.FinancePage })),
);
const DataPage = lazy(() => import('./pages/DataPage.tsx').then((m) => ({ default: m.DataPage })));

/** 懒加载期间的占位：不遮挡、不跳动，只说清在做什么 */
function LoadingView({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-ink-500" role="status">
        {label}
      </p>
    </div>
  );
}

/**
 * 应用外壳：负责启动、降级提示、左侧导航与页面切换，
 * 以及**会话与宠物的唯一持有者**。
 *
 * 为什么集中持有：专注会话是全屏接管层，要能覆盖在首页之上；
 * 宠物的金币余额同时被首页、商城与侧边栏使用，分开持有会出现数字不一致。
 * 这也符合 E19 的单主原则（同一时刻只有一处推进状态）。
 *
 * 用词约束（AGENTS.md 原则 1 / ADR-010）：不出现「账号/登录」，不承诺「防作弊」；
 * 也不得声称宠物是 Live2D（当前是 SVG 表现，见 features/pet/renderer.ts）。
 */
export function App(): JSX.Element {
  const boot = useBoot();
  const now = useNow(1_000);
  const { platform, report } = usePlatform();
  const session = useSession(platform, now);
  const pet = usePet();
  const [view, setView] = useState<View>('HOME');
  const [mode, setMode] = useState<'FOCUS' | 'LOCK'>('FOCUS');

  const startSession = useCallback(
    (input: StartInput): void => {
      setMode(input.kind === 'LOCK' ? 'LOCK' : 'FOCUS');
      void session.start(input);
    },
    [session],
  );

  const closeSession = useCallback((): void => {
    setMode('FOCUS');
    // 会话结束可能刚发了币，刷新余额让侧边栏与宠物面板显示最新数字
    void pet.refreshBalance();
  }, [pet]);

  if (boot.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-500" role="status">
          正在准备工作台…
        </p>
      </main>
    );
  }

  if (boot.status === 'failed') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink-900">启动失败</h1>
        <p className="text-sm text-ink-600">{boot.message ?? '未知错误'}</p>
        <Button onClick={boot.retry}>重试</Button>
      </main>
    );
  }

  const showSession = session.state !== undefined;

  /** 宠物面板：首页的内容之一，所以直接在这里组织，而不是通过 HomePage 的插槽 */
  const petPanel = pet.loadError ? (
    <p
      role="alert"
      className="rounded-card bg-clay-soft/25 p-4 text-sm text-clay-deep ring-1 ring-clay-base/40"
    >
      宠物数据读取失败：{pet.loadError}
    </p>
  ) : pet.pet ? (
    <PetPanel
      vitals={pet.pet.vitals}
      name={pet.pet.name}
      mood={pet.mood}
      level={levelInfoOf(pet.pet).level}
      expToNext={levelInfoOf(pet.pet).expToNext}
      balance={pet.balance}
      equipped={pet.pet.equipped}
      feedback={pet.feedback}
      onPet={pet.petIt}
      onOpenShop={() => setView('SHOP')}
    />
  ) : (
    <p className="rounded-card bg-white/60 p-4 text-sm text-ink-400 ring-1 ring-ink-200">
      正在唤醒宠物…
    </p>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar current={view} onNavigate={setView} balance={pet.balance} />

      <main className="min-w-0 flex-1">
        {boot.status === 'degraded' ? (
          <div role="alert" className="bg-clay-soft/30 px-4 py-2.5 text-center text-sm text-clay-deep">
            {boot.message}
            <button
              type="button"
              onClick={boot.retry}
              className="ml-2 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
            >
              重试
            </button>
          </div>
        ) : null}

        {/* 演示模式常驻提示：用户必须随时知道自己看的是演示数据，而不是自己的记录 */}
        {boot.demo ? (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-soft/40 px-4 py-2 text-sm text-amber-deep">
            <span>正在查看演示数据（与你自己的记录完全隔离）</span>
            <a
              href="?demo=0"
              className="rounded-lg border border-amber-deep/40 px-2 py-0.5 text-xs transition hover:bg-white/50"
            >
              退出演示
            </a>
          </div>
        ) : null}

        {view === 'SHOP' ? (
          <Suspense fallback={<LoadingView label="正在打开商城…" />}>
            <ShopPanel
              balance={pet.balance}
              inventory={pet.inventory}
              equipped={pet.pet?.equipped ?? {}}
              vitals={pet.pet?.vitals ?? { mood: 70, satiety: 80, energy: 80 }}
              petName={pet.pet?.name ?? '豆豆'}
              mood={pet.mood}
              feedback={pet.feedback}
              onPurchase={pet.purchase}
              onFeed={pet.feed}
              onEquip={pet.equip}
              onClose={() => setView('HOME')}
            />
          </Suspense>
        ) : view === 'STATS' ? (
          <Suspense fallback={<LoadingView label="正在统计…" />}>
            <StatsPage now={now} />
          </Suspense>
        ) : view === 'DIET' ? (
          <Suspense fallback={<LoadingView label="正在打开饮食记录…" />}>
            {/* useDiet 在 DietPage 内部调用：它链式依赖 500 条食物数据，不能提到 App 里 */}
            <DietPage now={now} />
          </Suspense>
        ) : view === 'FITNESS' ? (
          <Suspense fallback={<LoadingView label="正在打开健身打卡…" />}>
            <FitnessPage now={now} />
          </Suspense>
        ) : view === 'FINANCE' ? (
          <Suspense fallback={<LoadingView label="正在打开记账…" />}>
            <FinancePage now={now} />
          </Suspense>
        ) : view === 'DATA' ? (
          <Suspense fallback={<LoadingView label="正在打开数据管理…" />}>
            <DataPage now={now} demo={boot.demo === true} />
          </Suspense>
        ) : (
          <HomePage
            now={now}
            capabilityDescription={report.description}
            onStartSession={startSession}
            petSlot={petPanel}
          />
        )}
      </main>

      {showSession ? (
        <Suspense fallback={<LoadingView label="正在进入专注…" />}>
          <SessionPage session={session} mode={mode} onClosed={closeSession} />
        </Suspense>
      ) : null}
    </div>
  );
}
