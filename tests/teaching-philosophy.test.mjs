// Bilingual teaching philosophy (type "philosophy" in content/teaching.json) on /teaching/, and the
// matching static section on /cv/: both languages present, placed after the stats, switchable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderTeaching, validate, mergeBoard, LANGS } from '../admin/render.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url)));
const teaching = read('teaching.json'), site = read('site.json');
const cv = readFileSync(new URL('../cv/index.html', import.meta.url), 'utf8');

test('teaching philosophy section validates and sits right after the stats', () => {
  const all = { site, board: mergeBoard(read('board.json'), f => read(f)), az: read('az.json'), teaching, consulting: read('consulting.json') };
  assert.deepEqual(validate(all), []);
  assert.equal(teaching.sections[1].type, 'philosophy');
  assert.match(teaching.sections[0].title, /12,000\+/);
  const p = teaching.sections[1];
  assert.equal(p.groups.length, 2);
  assert.ok(p.groups.every(g => g.items.length === 4));
});

test('/teaching/ renders the bilingual block with a working language switch', () => {
  const h = renderTeaching(site, teaching, {});
  const i = h.indexOf('class="t-text t-philo"');
  assert.ok(i > 0 && i < h.indexOf('設計工作營與競賽工作坊'), 'philosophy before the workshop intro');
  assert.ok(h.indexOf('12,000+') < i, 'after the stats');
  for (const l of LANGS) assert.ok(h.includes('data-set-lang="' + l + '"') && h.includes('data-l="' + l + '"'));
  assert.ok(h.includes('Teaching Philosophy') && h.includes('教學理念') && h.includes('Socratic mentoring'));
  assert.match(h, /html:not\(\[data-lang="en"\]\) \[data-l="en"\]/);
  for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]), 'inline teaching script must parse');
});

test('/cv/ no longer carries the Teaching Philosophy line (it lives only on /teaching/)', () => {
  const p = teaching.sections[1];
  assert.ok(!cv.includes('cv-philo') && !cv.includes('教學理念') && !cv.includes('Teaching Philosophy'));
  for (const l of LANGS) assert.ok(!cv.includes(p.lead[l]), 'CV must not carry the philosophy lead (' + l + ')');
  assert.ok(cv.indexOf('cv-stats') < cv.indexOf('教學經歷'));
  for (const m of cv.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
});
