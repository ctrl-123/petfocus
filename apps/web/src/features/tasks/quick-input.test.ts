/**
 * 自然语言速记解析单测（PRD AC-2.2.6）。
 * 这层必须确定性：解析错一个时间，用户的整个计划就错了。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseQuickInput, parseSmallNumber, resolveStartAt } from './quick-input.ts';

const HOUR = 3_600_000;
const MIN = 60_000;

describe('parseSmallNumber：中文/阿拉伯数字', () => {
  it('阿拉伯数字', () => {
    assert.equal(parseSmallNumber('9'), 9);
    assert.equal(parseSmallNumber('23'), 23);
    assert.equal(parseSmallNumber('0'), 0);
  });

  it('单个中文数字', () => {
    assert.equal(parseSmallNumber('九'), 9);
    assert.equal(parseSmallNumber('两'), 2);
    assert.equal(parseSmallNumber('零'), 0);
  });

  it('十 / X十 / 十Y / X十Y', () => {
    assert.equal(parseSmallNumber('十'), 10);
    assert.equal(parseSmallNumber('二十'), 20);
    assert.equal(parseSmallNumber('十五'), 15);
    assert.equal(parseSmallNumber('二十三'), 23);
  });

  it('非法输入返回 undefined（不返回 NaN）', () => {
    assert.equal(parseSmallNumber(''), undefined);
    assert.equal(parseSmallNumber('abc'), undefined);
    assert.equal(parseSmallNumber('一百'), undefined, '不支持的汉字量词应识别不了而不是瞎猜');
  });

  it('两位数支持到 99（上限由调用方按场景判断）', () => {
    assert.equal(parseSmallNumber('99'), 99);
    assert.equal(parseSmallNumber('59'), 59);
  });
});

describe('parseQuickInput：PRD 里的示例', () => {
  it('「9点 写实验报告 1小时」→ 09:00 / 写实验报告 / 60 分钟', () => {
    const r = parseQuickInput('9点 写实验报告 1小时');
    assert.equal(r.hour, 9);
    assert.equal(r.minute, 0);
    assert.equal(r.title, '写实验报告');
    assert.equal(r.plannedMs, HOUR);
    assert.equal(r.parsed, true);
  });

  it('只输入标题时不做任何解析', () => {
    const r = parseQuickInput('写实验报告');
    assert.equal(r.title, '写实验报告');
    assert.equal(r.hour, undefined);
    assert.equal(r.plannedMs, undefined);
    assert.equal(r.parsed, false);
  });

  it('空输入保持为空', () => {
    const r = parseQuickInput('   ');
    assert.equal(r.title, '');
    assert.equal(r.parsed, false);
  });
});

describe('parseQuickInput：时间表达', () => {
  it('冒号形式', () => {
    assert.equal(parseQuickInput('9:30 开会').hour, 9);
    assert.equal(parseQuickInput('9:30 开会').minute, 30);
    assert.equal(parseQuickInput('14：45 复盘').hour, 14);
  });

  it('半 / 分', () => {
    assert.equal(parseQuickInput('9点半 开会').minute, 30);
    assert.equal(parseQuickInput('9点15分 开会').minute, 15);
  });

  it('午后标记换算成 24 小时制', () => {
    assert.equal(parseQuickInput('下午3点 开会').hour, 15);
    assert.equal(parseQuickInput('晚上8点 跑步').hour, 20);
    assert.equal(parseQuickInput('中午12点 吃饭').hour, 12);
    assert.equal(parseQuickInput('早上7点 起床').hour, 7);
  });

  it('中午 12 点不加 12（避免变成 24 点）', () => {
    assert.equal(parseQuickInput('中午12点 吃饭').hour, 12);
  });
});

describe('parseQuickInput：时长表达', () => {
  it('小时', () => {
    assert.equal(parseQuickInput('写报告 2小时').plannedMs, 2 * HOUR);
    assert.equal(parseQuickInput('写报告 两小时').plannedMs, 2 * HOUR);
  });

  it('半小时 / 一个半小时（回归：后者含子串「半小时」，必须先匹配更具体的）', () => {
    assert.equal(parseQuickInput('看视频 半小时').plannedMs, 30 * MIN);
    assert.equal(parseQuickInput('看视频 半个小时').plannedMs, 30 * MIN);
    assert.equal(parseQuickInput('看视频 一个半小时').plannedMs, 90 * MIN);
    assert.equal(parseQuickInput('看视频 一个小时').plannedMs, 60 * MIN);
  });

  it('分钟', () => {
    assert.equal(parseQuickInput('背单词 25分钟').plannedMs, 25 * MIN);
    assert.equal(parseQuickInput('背单词 45分钟').plannedMs, 45 * MIN);
    assert.equal(parseQuickInput('背单词 四十五分钟').plannedMs, 45 * MIN);
  });
});

describe('parseQuickInput：优先级表达', () => {
  it('重要 / 紧急 → HIGH', () => {
    assert.equal(parseQuickInput('重要 交周报').priority, 'HIGH');
    assert.equal(parseQuickInput('紧急 修 bug').priority, 'HIGH');
  });

  it('不急 / 随便 → LOW', () => {
    assert.equal(parseQuickInput('不急 整理桌面').priority, 'LOW');
  });
});

describe('parseQuickInput：标题清扫与边界', () => {
  it('组合输入：时间 + 标题 + 时长 + 优先级', () => {
    const r = parseQuickInput('下午2点 写论文 3小时 重要');
    assert.equal(r.hour, 14);
    assert.equal(r.title, '写论文');
    assert.equal(r.plannedMs, 3 * HOUR);
    assert.equal(r.priority, 'HIGH');
  });

  it('解析后标题为空时退回原始输入（不产生空待办）', () => {
    const r = parseQuickInput('9点');
    assert.equal(r.title, '9点');
    assert.equal(r.parsed, false, '退回原串时不应声称已解析');
  });

  it('全角字符被归一化', () => {
    const r = parseQuickInput('９点 写实验报告　１小时');
    assert.equal(r.hour, 9);
    assert.equal(r.plannedMs, HOUR);
    assert.equal(r.title, '写实验报告');
  });

  it('保留原始输入供 UI 展示', () => {
    const raw = '9点 写实验报告 1小时';
    assert.equal(parseQuickInput(raw).raw, raw);
  });
});

describe('resolveStartAt：把小时落到归属日内的正确时间戳', () => {
  const boundary = 4;

  it('白天时刻落在归属日当天', () => {
    const dayStart = new Date(2026, 1, 14, 4, 0, 0, 0).getTime(); // 2026-02-14 04:00
    const ts = resolveStartAt(dayStart, 9, 0, boundary);
    const d = new Date(ts);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 1);
    assert.equal(d.getDate(), 14);
    assert.equal(d.getHours(), 9);
  });

  it('凌晨时刻落在归属日的「次日凌晨」（04:00 边界语义）', () => {
    const dayStart = new Date(2026, 1, 14, 4, 0, 0, 0).getTime();
    const ts = resolveStartAt(dayStart, 2, 0, boundary);
    const d = new Date(ts);
    assert.equal(d.getDate(), 15, '凌晨 2 点属于 2/14 这个归属日，实际发生在 2/15 02:00');
    assert.equal(d.getHours(), 2);
  });

  it('恰好等于边界小时落在当天', () => {
    const dayStart = new Date(2026, 1, 14, 4, 0, 0, 0).getTime();
    const ts = resolveStartAt(dayStart, 4, 0, boundary);
    assert.equal(new Date(ts).getDate(), 14);
  });
});
