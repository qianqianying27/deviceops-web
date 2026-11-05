import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

export interface KbDoc {
  id: string;
  title: string;
  content: string;
}

export interface KbHit {
  id: string;
  title: string;
  snippet: string;
  score: number;
}

const STOPWORDS = new Set(['的', '了', '和', '与', '在', '是', '我', '你', '们', '有', '为', '请', '帮', '怎', '么', '吗', '呢']);

/** 中文没有空格，用「单字 + 相邻双字」切分即可获得可用的召回，避免引入分词依赖。 */
export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens: string[] = [];
  let ascii = '';

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    const isCjk = /[\u4e00-\u9fa5]/.test(ch);
    if (isCjk) {
      if (ascii) {
        tokens.push(ascii);
        ascii = '';
      }
      if (!STOPWORDS.has(ch)) tokens.push(ch);
      const prev = normalized[i - 1] ?? '';
      if (/[\u4e00-\u9fa5]/.test(prev)) {
        const bigram = prev + ch;
        if (!STOPWORDS.has(bigram)) tokens.push(bigram);
      }
    } else if (/[a-z0-9-]/.test(ch)) {
      ascii += ch;
    } else if (ascii) {
      tokens.push(ascii);
      ascii = '';
    }
  }
  if (ascii) tokens.push(ascii);
  return tokens;
}

export function loadDocs(): KbDoc[] {
  return db
    .select({ id: schema.kbDocs.id, title: schema.kbDocs.title, content: schema.kbDocs.content })
    .from(schema.kbDocs)
    .all();
}

export function searchKnowledge(query: string, topK = 3, docs: KbDoc[] = loadDocs()): KbHit[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0 || docs.length === 0) return [];

  const docTokens = docs.map((d) => tokenize(`${d.title} ${d.content}`));
  const avgLen = docTokens.reduce((sum, t) => sum + t.length, 0) / docs.length;
  const k1 = 1.5;
  const b = 0.75;
  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    const unique = new Set(tokens);
    for (const t of unique) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const queryTokenCount = new Set(qTokens).size;
  const scored = docs.map((doc, idx) => {
    const tokens = docTokens[idx]!;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    const matchedSet = new Set<string>();
    for (const q of qTokens) {
      const freq = tf.get(q) ?? 0;
      if (!freq) continue;
      matchedSet.add(q);
      const n = df.get(q) ?? 0;
      const idf = Math.log((docs.length - n + 0.5) / (n + 0.5) + 1);
      score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + (b * tokens.length) / avgLen)));
    }
    const coverage = matchedSet.size / Math.max(1, queryTokenCount);
    // 覆盖率太低说明只是撞上了单个常见字，视为无关，上层据此明确拒答
    return { doc, score: Number(score.toFixed(3)), coverage };
  });

  return scored
    .filter((s) => s.score > 0 && s.coverage >= 0.3)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, topK)
    .map(({ doc, score }) => ({ id: doc.id, title: doc.title, snippet: buildSnippet(doc.content, qTokens), score }));
}

function buildSnippet(content: string, qTokens: string[]): string {
  const lines = content.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith('#'));
  const hit = lines.find((l) => qTokens.some((t) => l.includes(t)));
  const text = (hit ?? lines[0] ?? '').trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
