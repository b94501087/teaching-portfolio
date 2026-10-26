// Traditional → Simplified at render time (opencc-js t2cn, Taiwan phrases + characters).
// Phrase conversion is OpenCC twp→cn, minus a few entries that change the meaning of this
// site's architecture writing (使用者 is a building's occupant, 喬治亞理工 is Georgia Tech,
// 重新整理 is "reorganise", 簡報 is a crit, 預設 often means "assume", 裝置 is an installation).
// 投影片 is held back so the 影片→视频 entry cannot eat the 片 inside it.
import { ConverterFactory, Locale } from './vendor/opencc-t2cn.js';

const SKIP = new Set([
  '使用者', '使用者名稱',
  '重新整理',
  '簡報',
  '喬治亞',
  '預設',
  '尼日',
  '新增',
  '裝置',
  '互動', '互動式',
  '介面',
  '程式'
]);

const GUARDS = ['投影片'];

function filteredFrom() {
  return Locale.from.twp.map(dict => {
    if (typeof dict !== 'string') return dict;
    return dict.split('|').filter(line => {
      const key = line.split(' ')[0];
      return key && !SKIP.has(key);
    }).join('|');
  }).filter(Boolean);
}

// 介面 in this portfolio is a UI, so 界面 rather than OpenCC's 接口.
const convert = ConverterFactory(filteredFrom(), ['介面 界面'], Locale.to.cn);

export function toHans(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s || !/[\u3400-\u9fff]/.test(s)) return s;
  let t = s;
  const held = [];
  GUARDS.forEach((word, i) => {
    if (!t.includes(word)) return;
    const token = '\uE000' + i + '\uE001';
    held.push([token, word]);
    t = t.split(word).join(token);
  });
  t = convert(t);
  for (const [token, word] of held) t = t.split(token).join(word);
  return t;
}

// Clone every Traditional span into a Simplified sibling. Used for the static CV, which is
// not produced by the renderers. Idempotent: a page that already has zh-Hans spans is left alone.
export function injectHans(html) {
  if (!html.includes('<span data-l="zh-Hant"') || html.includes('<span data-l="zh-Hans"')) return html;
  return html.replace(/<span data-l="zh-Hant" lang="zh-Hant">([\s\S]*?)<\/span>/g, (m, inner) =>
    m + '<span data-l="zh-Hans" lang="zh-Hans">' + toHans(inner) + '</span>');
}
