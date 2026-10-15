// Board categories (all levels) on /board/: content/categories.json and the sub-filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBoard, CATEGORIES, CATEGORY_FILTER, pinShown, renderBoard, listedPins, pinLevel } from '../admin/render.js';

const cats = JSON.parse(readFileSync(new URL('../content/categories.json', import.meta.url)));
const board = mergeBoard(JSON.parse(readFileSync(new URL('../content/board.json', import.meta.url))), f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url))));
const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url)));

test('categories.json only uses the five categories', () => {
  for (const [slug, c] of Object.entries(cats)) {
    const l = Array.isArray(c) ? c : [c];
    assert.ok(l.length >= 1 && l.length <= 3 && new Set(l).size === l.length && l.every(x => CATEGORIES.includes(x)), slug + ': ' + c);
  }
});
test('categories.json only names pins that exist on the board', () => {
  const slugs = new Set((board.pins || []).map(p => p.slug));
  for (const slug of Object.keys(cats)) assert.ok(slugs.has(slug), slug);
});
test('every listed pin (master and undergrad) has 2-3 categories', () => {
  const few = listedPins(board).filter(p => pinLevel(p)).filter(p => { const c = cats[p.slug]; return !Array.isArray(c) || c.length < 2 || c.length > 3; }).map(p => p.slug);
  assert.deepEqual(few, [], 'pins without 2-3 categories: ' + few.join(', '));
});

const st = (f, cat = 'all') => ({ f, cat, sort: 'default' });
test('sub-category filtering', () => {
  const arch = { level: 'master', cat: 'architecture' }, none = { level: 'master', cat: undefined }, ug = { level: 'undergrad' }, own = { level: '' };
  assert.ok([arch, none, ug, own].every(p => pinShown(p, st('all'))));
  assert.ok(pinShown(arch, st('master')) && pinShown(none, st('master')));
  assert.ok(pinShown(arch, st('master', 'architecture')));
  assert.ok(!pinShown(arch, st('master', 'stage')));
  const multi = { level: 'master', cat: ['architecture', 'urban'] };
  assert.ok(pinShown(multi, st('master', 'architecture')) && pinShown(multi, st('master', 'urban')) && !pinShown(multi, st('master', 'stage')));
  assert.ok(!pinShown(none, st('master', 'architecture')), 'unmapped master pin shows under All only');
  assert.ok(!pinShown(ug, st('master')) && pinShown(ug, st('undergrad')) && !pinShown(own, st('undergrad')));
  const ug2 = { level: 'undergrad', cat: ['interior', 'stage'] };
  assert.ok(pinShown(ug2, st('undergrad', 'stage')) && !pinShown(ug2, st('undergrad', 'urban')) && !pinShown(ug2, st('master', 'stage')));
  assert.ok(pinShown(ug2, st('all', 'interior')) && pinShown(multi, st('all', 'urban')) && !pinShown(ug2, st('all', 'urban')), 'category filter also works under All');
});

test('board renders the category row (shown by the script for every level) in both languages', () => {
  const h = renderBoard(site, board);
  assert.match(h, /class="filters subfilters"[^>]*hidden/);
  for (const c of ['all', ...CATEGORIES]) {
    assert.match(h, new RegExp('data-cat-filter="' + c + '"'));
    assert.ok(h.includes(CATEGORY_FILTER[c].en) && h.includes(CATEGORY_FILTER[c]['zh-Hant']), c);
  }
  assert.ok(h.includes('fetch("../content/categories.json"'));
  for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]), 'inline board script must parse');
});
