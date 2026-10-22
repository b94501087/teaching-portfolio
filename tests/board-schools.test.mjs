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
