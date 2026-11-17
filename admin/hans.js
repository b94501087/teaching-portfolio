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
  '程式',
  '核心',
  '進階', '高階',
  '通道'
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

// 連結 that means "connect" (spaces, people, industries) becomes 連接, phrase by phrase; every other
// 連結 is a hyperlink and keeps the OpenCC reading. Each entry is checked against the site's text.
// 建立連結 keeps OpenCC's existing 建立 reading so that only the 連結 part changes in this pass.
// 業界連結 and 校友連結 mean industry and alumni relations, so they read 联系.
const LINK_CONNECT = [
  '連結起來', '連結成一', '相互連結', '間的連結', '情感連結', '重新連結', '生態連結',
  '步行連結', '彼此連結', '連結到一', '連結岩塊', '動態連結', '連結、無', '緊密連結', '連結流動',
  '連結與流', '道的連結', '也能連結', '連結這些', '遇與連結', '線條連結', '成為連結', '斷與連結',
  '連結畢業', '連結產業', '連結到伺', '少有連結', '道路連結', '在於連結', '連結薄弱', '連結。這',
  '不是連結', '連結個人', '連結空間', '連結當代', '連結職涯', '人們連結', '連結你的', '聚與連結',
  '厚的連結', '移動連結', '連結在中', '界的連結', '空間連結', '連結鄰里', '影與連結', '城市連結',
  '連結人類', '連結被同', '集與連結', '明的連結', '連結各自', '連結身體', '連結各個', '產生連結',
  '連結為一', '連結它們', '連結成邊', '扣的連結', '連結能產', '互相連結', '連結的泡', '連結與植',
  '連結兩座', '連結能在', '連結而生', '連結並上', '連結路徑', '連結人們', '連結塔與', '連結移動',
  '連結的連', '連結的空', '連結魚與', '內在連結', '連結弱化', '連結尺度', '連結有助', '來與連結',
  '連結與風', '連結在一', '室內連結', '直接連結', '連結轉為', '內部連結', '連結方法', '連結轉化',
  '層級連結與動態連結', '交通連結', '連結讓師', '好的連結', '連結廠房', '連結樓下', '覺的連結', '以及連結',
  '連結入口', '連結建築', '連結生者', '連結為新', '連結一點', '連結街區', '屋的連結', '市的連結',
  '連結到城', '各層連結', '路的連結', '間中連結'
];

// 介面 in this portfolio is a UI, so 界面 rather than OpenCC's 接口.
// 官方資料, 以上資料, 舊資料 and 申請資料 mean "information" here, so they stay 资料; listed in the
// phrase group so they win over 資料. 機率 is 概率 (OpenCC twp gives the less standard form).
const PHRASES = [...filteredFrom(), '官方資料 官方资料', '以上資料 以上资料', '舊資料 旧资料', '申請資料 申请资料', '機率 概率', '業界連結 业界联系', '校友連結 校友联系', ...LINK_CONNECT.map(k => k + ' ' + k.split('連結').join('連接')),
  '建立連結 創建連接'];
const convert = ConverterFactory(PHRASES, ['介面 界面'], Locale.to.cn);

// Legal pages (/privacy/, /terms/) only: keep Taiwan's statute name and the statutory wording of the
// Personal Data Protection Act (個人資料, 查詢或閱覽, 製給複製本) and 申請文件, which the general table would turn
// into 个人数据 / 查找 / 拷贝本 / 申请文档. Scoped to those pages so blog posts and other pages convert exactly as before.
// 資料 stays 资料 on these pages (資料庫 still becomes 数据库).
export const LEGAL_PHRASES = ['個人資料保護法 个人资料保护法', '個人資料 个人资料', '查詢或閱覽 查询或阅览', '製給複製本 制给复制本', '複製本 复制本', '申請文件 申请文件', '資料 资料', '資料庫 数据库', '資料中心 数据中心', '查詢字串 查询字符串'];
const convertLegal = ConverterFactory([...PHRASES, ...LEGAL_PHRASES], ['介面 界面'], Locale.to.cn);

// opts.legal: use the legal-page phrase table (see LEGAL_PHRASES).
export function toHans(text, opts) {
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
  t = (opts && opts.legal ? convertLegal : convert)(t);
  for (const [token, word] of held) t = t.split(token).join(word);
  return t;
}

// Clone every Traditional span into a Simplified sibling. Used for the static CV, which is
// not produced by the renderers. Idempotent: a page that already has zh-Hans spans is left alone.
export function injectHans(html, opts) {
  if (!html.includes('<span data-l="zh-Hant"') || html.includes('<span data-l="zh-Hans"')) return html;
  return html.replace(/<span data-l="zh-Hant" lang="zh-Hant">([\s\S]*?)<\/span>/g, (m, inner) =>
    m + '<span data-l="zh-Hans" lang="zh-Hans">' + toHans(inner, opts) + '</span>');
}
