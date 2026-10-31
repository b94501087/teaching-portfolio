// A–Z page (/A-Z/): az.json entries plus every listed board pin and every teaching workshop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBoard, renderAZ, listedPins, teachingStudios } from '../admin/render.js';

const read = n => JSON.parse(readFileSync(new URL('../content/' + n + '.json', import.meta.url)));
const board = mergeBoard(read('board'), f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url))));
const site = read('site'), az = read('az'), teaching = read('teaching');
const h = renderAZ(site, az, {}, board, teaching);

test('A–Z lists every listed board pin and every workshop, plus the hand-written entries', () => {
  const pins = listedPins(board), studios = teachingStudios(teaching);
  assert.ok(pins.length > 700 && studios.length >= 8);
  for (const p of pins) assert.ok(h.includes('<a href="../board/' + p.slug + '/">'), p.slug);
  for (const s of studios) assert.ok(h.includes('<a href="../teaching/' + s.slug + '/">'), s.slug);
  for (const e of az.entries) {
    const t = '>' + e.title.replace(/&/g, '&amp;');
    if (!e.link || e.link === '#') assert.ok(h.includes('<span class="az-plain">' + t.slice(1) + '</span>'), e.title);
    else assert.ok(h.includes(t + '</a>'), e.title);
  }
  assert.equal((h.match(/href="#"/g) || []).length, 0);
  assert.equal((h.match(/<li>/g) || []).length, pins.length + studios.length + az.entries.length);
  assert.ok(!listedPins(board).some(p => p.draft) && !/class="az-k">(?!board|workshop)/.test(h));
});

test('entries are sorted within each letter', () => {
  for (const sec of h.split('<section>').slice(1)) {
    const t = [...sec.matchAll(/<(?:a href="[^"]+"|span class="az-plain")>([^<]*)</g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/^[^\p{L}\p{N}]+/u, ''));
    assert.deepEqual(t, t.slice().sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base', numeric: true })));
  }
});

test('A–Z without board/teaching still renders the az.json entries only', () => {
  assert.equal((renderAZ(site, az, {}).match(/<li>/g) || []).length, az.entries.length);
});
