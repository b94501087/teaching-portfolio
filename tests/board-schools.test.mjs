// Admitted-school tags: the board card shows up to 4 schools then 「等 N 校」/"+N more"; the detail page lists every school.
import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolTags, CARD_SCHOOLS } from '../admin/render.js';

const sch = n => Array.from({ length: n }, (_, i) => ({ en: 'S' + i, 'zh-Hant': '校' + i }));
test('card truncates after 4 schools with a bilingual more tag', () => {
  assert.equal(CARD_SCHOOLS, 4);
  const h = schoolTags({ admitted_schools: sch(7) }, 'span', CARD_SCHOOLS);
  assert.equal((h.match(/class="school"/g) || []).length, 4);
  assert.ok(h.includes('等 3 校') && h.includes('+3 more') && !h.includes('S4'));
});
test('card with 4 or fewer schools has no more tag; detail lists all', () => {
  const four = schoolTags({ admitted_schools: sch(4) }, 'span', CARD_SCHOOLS);
  assert.ok(!four.includes('more') && four.includes('S3'));
  const all = schoolTags({ admitted_schools: sch(16) }, 'span');
  assert.equal((all.match(/class="school"/g) || []).length, 16);
  assert.ok(!all.includes('more'));
});

// 繁中 school labels: every admitted school in the board data has a Chinese zh-Hant label
// (except SCAD / UCLA, intentionally English), duplicates are unified, and English labels stay as-is.
import { readFileSync } from 'node:fs';
import { pinSchools, SCHOOL_ZH, SCHOOL_KEEP_EN } from '../admin/render.js';
const boards = ['board', 'board-2', 'board-3'].map(f => JSON.parse(readFileSync(new URL('../content/' + f + '.json', import.meta.url), 'utf8')));
const allSchools = boards.flatMap(b => (b.pins || []).flatMap(p => (Array.isArray(p.admitted_schools) ? p.admitted_schools : [])));
test('board data: zh-Hant school labels are Chinese except SCAD/UCLA', () => {
  const bad = allSchools.filter(x => typeof x === 'object' && !SCHOOL_KEEP_EN.includes(x.en) && !/[\u4e00-\u9fff]/.test(x['zh-Hant'] || ''));
  assert.deepEqual(bad.map(x => x.en), []);
});
test('board data: duplicate zh labels unified to the short form', () => {
  for (const x of allSchools) if (SCHOOL_ZH[x.en]) assert.equal(x['zh-Hant'], SCHOOL_ZH[x.en], x.en);
  const zh = JSON.stringify(allSchools);
  for (const s of ['羅德島設計學院', '南加州大學', '加州大學爾灣分校', '加州大學聖地牙哥分校', '謝菲爾德', '"愛丁堡大學"', '"曼徹斯特大學"', '"雪城大學"']) assert.ok(!zh.includes(s), s);
});
test('pinSchools falls back to SCHOOL_ZH; English kept; SCAD/UCLA stay English', () => {
  const s = pinSchools({ admitted_schools: ['UIUC', { en: 'RISD', 'zh-Hant': 'RISD' }, { en: 'HKU', 'zh-Hant': '港大' }, 'SCAD', 'UCLA'] });
  assert.deepEqual(s.map(x => x.en), ['UIUC', 'RISD', 'HKU', 'SCAD', 'UCLA']);
  assert.deepEqual(s.map(x => x['zh-Hant']), ['伊利諾香檳', '羅德島設計', '港大', undefined, undefined]);
  const h = schoolTags({ admitted_schools: ['UAL', 'SCAD'] }, 'span');
  assert.ok(h.includes('倫敦藝大') && h.includes('UAL') && h.includes('SCAD'));
});
