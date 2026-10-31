// A–Z page (/A-Z/): az.json entries plus every listed board pin and every teaching workshop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  for (const e of az.entries) assert.ok(h.includes('>' + e.title.replace(/&/g, '&amp;') + '</a>'), e.title);
  assert.equal((h.match(/<li>/g) || []).length, pins.length + studios.length + az.entries.length);
  assert.ok(!listedPins(board).some(p => p.draft) && !/class="az-k">(?!board|workshop)/.test(h));
});

test('entries are sorted within each letter', () => {
  for (const sec of h.split('<section>').slice(1)) {
    const t = [...sec.matchAll(/">([^<]*)<\/a>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/^[^\p{L}\p{N}]+/u, ''));
    assert.deepEqual(t, t.slice().sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base', numeric: true })));
  }
});

test('A–Z without board/teaching still renders the az.json entries only', () => {
  assert.equal((renderAZ(site, az, {}).match(/<li>/g) || []).length, az.entries.length);
});

test('hand-written links resolve, and the old EMI / portfolio URLs refresh to those pages', () => {
  const sections = new Set(['teaching', 'consulting', 'board', 'cv', 'blog']);
  for (const e of az.entries) {
    if (!e.link || e.link === '#') continue;
    if (e.link.endsWith('.html')) {
      assert.ok(existsSync(new URL('../A-Z/' + e.link, import.meta.url)), e.title + ' → ' + e.link);
    } else {
      const m = /^\.\.\/([a-z0-9-]+)\/$/.exec(e.link);
      assert.ok(m && sections.has(m[1]), e.title + ' → ' + e.link);
    }
  }
  assert.match(h, /<a href="\.\.\/teaching\/">EMI design studio<\/a>/);
  assert.match(h, /<a href="\.\.\/consulting\/">Portfolio mentoring<\/a>/);
  const stub = (name, to, canon) => {
    const src = readFileSync(new URL('../A-Z/' + name, import.meta.url), 'utf8');
    assert.match(src, new RegExp('http-equiv="refresh" content="0; url=\\.\\./' + to + '/"'));
    assert.match(src, new RegExp('rel="canonical" href="https://yuchuntsai\\.com/' + canon + '/"'));
  };
  stub('emi.html', 'teaching', 'teaching');
  stub('portfolio.html', 'consulting', 'consulting');
});
