// Master scales on /board/: content/scale.json (S / M / L / XL, one per master pin) and the scale row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBoard, SCALES, SCALE_FILTER, pinShown, renderBoard, listedPins, pinLevel, parseBoardHash, boardHash } from '../admin/render.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url)));
const scale = read('scale.json');
const board = mergeBoard(read('board.json'), f => read(f));
const site = read('site.json');

test('every listed master pin has exactly one valid scale; only master pins are listed', () => {
  const pins = listedPins(board), master = pins.filter(p => pinLevel(p) === 'master').map(p => p.slug);
  const bad = master.filter(s => !SCALES.includes(scale[s]));
  assert.deepEqual(bad, [], 'master pins without a valid scale: ' + bad.join(', '));
  const extra = Object.keys(scale).filter(s => !master.includes(s));
  assert.deepEqual(extra, [], 'scale.json names non-master or unknown pins: ' + extra.join(', '));
  assert.ok(Object.values(scale).every(v => typeof v === 'string'));
});

const st = (f, scale = 'all', cat = 'all') => ({ f, cat, scale, sort: 'default' });
test('scale filtering combines with level and category', () => {
  const m = { level: 'master', cat: ['architecture', 'urban'], scale: 'L' }, m2 = { level: 'master', cat: 'landscape', scale: 'XL' }, ug = { level: 'undergrad', cat: 'interior' };
  assert.ok(pinShown(m, st('master', 'L')) && !pinShown(m, st('master', 'S')) && pinShown(m, st('master')));
  assert.ok(pinShown(m, st('master', 'L', 'urban')) && !pinShown(m, st('master', 'L', 'landscape')) && !pinShown(m2, st('master', 'L', 'landscape')));
  assert.ok(pinShown(m2, st('master', 'XL', 'landscape')));
  assert.ok(pinShown(ug, st('undergrad')) && !pinShown(ug, st('master', 'S')));
});

test('scale lives in the URL hash only with 碩士申請', () => {
  assert.deepEqual(parseBoardHash('#master&cat=urban&scale=L'), { f: 'master', cat: 'urban', scale: 'L', sort: 'default' });
  assert.equal(boardHash(st('master', 'XL', 'landscape')), '#master&cat=landscape&scale=XL');
  assert.equal(parseBoardHash('#undergrad&scale=L').scale, 'all');
  assert.equal(parseBoardHash('#scale=M').scale, 'all');
  assert.equal(parseBoardHash('#master&scale=XXL').scale, 'all');
  assert.equal(boardHash(st('undergrad', 'L')), '#undergrad');
  for (const s of [st('master', 'S'), st('master', 'M', 'interior'), st('master')]) assert.deepEqual(parseBoardHash(boardHash(s)), s);
});

test('board renders the scale row (hidden until 碩士申請) in both languages, scripts parse', () => {
  const h = renderBoard(site, board);
  assert.match(h, /class="board-tools sub scalefilters" hidden/);
  for (const z of ['all', ...SCALES]) {
    assert.match(h, new RegExp('data-scale-filter="' + z + '"'));
    assert.ok(h.includes(SCALE_FILTER[z].en.replace(/&/g, '&amp;')) && h.includes(SCALE_FILTER[z]['zh-Hant']), z);
  }
  assert.ok(h.includes('fetch("../content/scale.json"'));
  for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
});
