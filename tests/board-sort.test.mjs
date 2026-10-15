// Sorting on /board/: project dates from the meta line, sort order, and the rendered sort control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBoard, pinDate, sortItems, renderBoard, listedPins, SORTS, parseBoardHash, boardHash } from '../admin/render.js';

const meta = m => ({ title: 't', slug: 's', description: 'Intro.\n\n' + m });
const board = mergeBoard(JSON.parse(readFileSync(new URL('../content/board.json', import.meta.url))), f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url))));
const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url)));

test('pinDate reads month, range start, season, term and bare year from the meta line', () => {
  assert.equal(pinDate(meta('Guangzhou | Campus | Nov–Dec 2022 | Student Project | X')), 202211);
  assert.equal(pinDate(meta('A | B | Sep 2021–Jan 2022 | Student Project | X')), 202109);
  assert.equal(pinDate(meta('A | B | Jul–Aug and Nov–Dec 2023 | Student Project | X')), 202307);
  assert.equal(pinDate(meta('A | Summer 2023 | Student Project | X')), 202306);
  assert.equal(pinDate(meta('A | Fall 2020 | Student Project | X')), 202009);
  assert.equal(pinDate(meta('A | Spring term 2023–2024 | Student Project | X')), 202402);
  assert.equal(pinDate(meta('A | December 2021 | Competition | Student Project | X')), 202112);
  assert.equal(pinDate(meta('A | B | 2020–2021 | Student Project | X')), 202000);
  assert.equal(pinDate(meta('A | B | 2018 | Student Project | X')), 201800);
});

test('pinDate ignores areas, durations and years outside the meta line', () => {
  assert.equal(pinDate(meta('Lyon | Urban renewal | 163.5 ha | Student Project | X')), null);
  assert.equal(pinDate(meta('A | B | 6 weeks | Student Project | X')), null);
  assert.equal(pinDate({ description: 'The 2020 explosion.\n\nBeirut | Urban design | Student Project | X' }), null);
  assert.equal(pinDate({ description: '' }), null);
});

const items = [
  { i: 0, date: 202211, title: 'Chimera' }, { i: 1, date: null, title: 'beta' },
  { i: 2, date: 201800, title: 'Alpha' }, { i: 3, date: null, title: 'Zeta' }, { i: 4, date: 202211, title: 'delta' }
];
const ids = a => a.map(x => x.i);

test('default keeps board order', () => assert.deepEqual(ids(sortItems(items, 'default')), [0, 1, 2, 3, 4]));
test('oldest: dated ascending (ties in board order), then undated in board order', () =>
  assert.deepEqual(ids(sortItems(items, 'oldest')), [2, 0, 4, 1, 3]));
test('newest: dated descending, then undated newest-published first', () =>
  assert.deepEqual(ids(sortItems(items, 'newest')), [0, 4, 2, 3, 1]));
test('A–Z and Z–A are case-insensitive', () => {
  assert.deepEqual(ids(sortItems(items, 'az')), [2, 1, 0, 4, 3]);
  assert.deepEqual(ids(sortItems(items, 'za')), [3, 4, 0, 1, 2]);
});
test('sortItems does not mutate its input', () => { const c = items.slice(); sortItems(items, 'az'); assert.deepEqual(items, c); });

test('hash state round-trips and the bare level hash still works', () => {
  assert.deepEqual(parseBoardHash('#master'), { f: 'master', cat: 'all', sort: 'default' });
  assert.deepEqual(parseBoardHash('#undergrad&sort=za'), { f: 'undergrad', cat: 'all', sort: 'za' });
  assert.deepEqual(parseBoardHash('#sort=bogus&cat=nope'), { f: 'all', cat: 'all', sort: 'default' });
  for (const st of [{ f: 'all', cat: 'all', sort: 'newest' }, { f: 'master', cat: 'stage', sort: 'az' }, { f: 'undergrad', cat: 'all', sort: 'default' }])
    assert.deepEqual(parseBoardHash(boardHash(st)), st);
  assert.equal(boardHash({ f: 'all', cat: 'all', sort: 'default' }), '');
  assert.equal(parseBoardHash('#undergrad&cat=stage').cat, 'stage');
  assert.deepEqual(parseBoardHash('#cat=urban'), { f: 'all', cat: 'urban', sort: 'default' });
  assert.equal(boardHash({ f: 'undergrad', cat: 'interior', sort: 'default' }), '#undergrad&cat=interior');
});

test('board renders one sort button per option in both languages, default on', () => {
  const h = renderBoard(site, board);
  for (const s of SORTS) assert.match(h, new RegExp('data-sort="' + s + '"'));
  for (const l of ['時間新→舊', '時間舊→新', '字母 A→Z', '字母 Z→A', 'Newest', 'Oldest', 'A–Z', 'Z–A']) assert.ok(h.includes(l), l);
  assert.match(h, /data-sort="default" class="on" aria-pressed="true"/);
  assert.ok(!h.includes('範例'));
});

test('every pin carries its board index, slug and title; dated pins carry data-date', () => {
  const h = renderBoard(site, board), pins = listedPins(board);
  pins.forEach((p, i) => assert.ok(h.includes('data-i="' + i + '" data-slug="' + p.slug + '"'), p.slug));
  assert.equal((h.match(/data-date="\d{6}"/g) || []).length, pins.filter(p => pinDate(p)).length);
});
