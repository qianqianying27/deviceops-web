import { describe, expect, it } from 'vitest';
import { searchKnowledge, tokenize } from '../ai/kb.js';

const docs = [
  {
    id: 'plc',
    title: 'PLC 故障代码对照表',
    content: 'E-102 温度传感器断线，处理建议：断电后测量热电偶阻值，紧固端子或更换传感器。',
  },
  {
    id: 'air',
    title: '螺杆空压机点检规程',
    content: '排气温度正常 75–95℃，超过 105℃ 触发高温报警并停机，检查冷却风扇与油位。',
  },
];

describe('知识库检索（BM25）', () => {
  it('中文按单字与双字切分', () => {
    const tokens = tokenize('故障代码');
    expect(tokens).toContain('故障');
    expect(tokens).toContain('代码');
  });

  it('问故障代码能召回 PLC 文档且带出处', () => {
    const hits = searchKnowledge('E-102 报警怎么处理', 2, docs);
    expect(hits[0]?.id).toBe('plc');
    expect(hits[0]?.snippet).toContain('热电偶');
  });

  it('无关问题返回空结果，供上层明确拒答', () => {
    expect(searchKnowledge('今天天气怎么样', 2, docs)).toHaveLength(0);
  });
});
