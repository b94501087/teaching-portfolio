// /board/ cards are in the first HTML response. With build thumbnails they use a small
// sized WebP (eager above the fold, lazy further down) so the column grid does not reflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBoard, renderBoard, listedPins, pinLevel, BOARD_EAGER, BOARD_HIGH, SCALES } from '../admin/render.js';

const read = f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url), 'utf8'));
const board = mergeBoard(read('board.json'), f => read(f));
const site = read('site.json');
const categories = read('categories.json');
const scales = read('scale.json');
const pins = listedPins(board);

function thumbsFor(list) {
  const thumbs = {};
  for (const p of list) thumbs[p.slug] = { src: 'assets/board-thumbs/' + p.slug + '.webp', w: 480, h: 320 };
  return thumbs;
}

test('every listed project is a card in the initial board HTML', () => {
  const h = renderBoard(site, board, { thumbs: thumbsFor(pins), categories, scales });
  assert.equal((h.match(/<a class="pin\b/g) || []).length, pins.length);
  pins.forEach((p, i) => assert.ok(h.includes('data-i="' + i + '" data-slug="' + p.slug + '"'), p.slug));
  assert.equal((h.match(/assets\/board-thumbs\/[a-z0-9-]+\.webp/g) || []).length, pins.length + Math.min(BOARD_HIGH, pins.length));
  assert.equal((h.match(/assets\/board\/[a-z0-9-]+\//g) || []).length, 0);
});

test('thumbs have width and height; the first rows are eager and high priority; the rest are lazy', () => {
  const h = renderBoard(site, board, { thumbs: thumbsFor(pins) });
  const imgs = h.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgs.length, pins.length);
  imgs.forEach(tag => {
    assert.match(tag, /\bwidth="480" height="320"/);
    assert.match(tag, /\bdraggable="false"/);
    assert.match(tag, /\bdecoding="async"/);
  });
  const eager = imgs.filter(t => /loading="eager"/.test(t));
  const lazy = imgs.filter(t => /loading="lazy"/.test(t));
  assert.equal(eager.length, Math.min(BOARD_EAGER, pins.length));
  assert.equal(lazy.length, Math.max(0, pins.length - BOARD_EAGER));
  eager.slice(0, BOARD_HIGH).forEach(t => assert.match(t, /fetchpriority="high"/));
  eager.slice(BOARD_HIGH).forEach(t => assert.doesNotMatch(t, /fetchpriority=/));
  lazy.forEach(t => assert.match(t, /fetchpriority="low"/));
  const first = pins[0].slug;
  assert.match(h, new RegExp('<link rel="preload" as="image" href="\\.\\./assets/board-thumbs/' + first + '\\.webp" fetchpriority="high">'));
  assert.equal((h.match(/<link rel="preload" as="image"/g) || []).length, Math.min(BOARD_HIGH, pins.length));
});

test('category, scale, sort and language controls stay, and cat/scale are in the card HTML', () => {
  const h = renderBoard(site, board, { thumbs: thumbsFor(pins), categories, scales });
  assert.ok(h.includes('fetch("../content/categories.json"'));
  assert.ok(h.includes('fetch("../content/scale.json"'));
  assert.ok(h.includes('data-filter="master"') && h.includes('碩士申請') && h.includes('大學部申請'));
  assert.ok(h.includes('data-sort="az"') && h.includes('data-sort="newest"'));
  for (const l of ['en', 'zh-Hant', 'zh-Hans']) assert.ok(h.includes('data-set-lang="' + l + '"'), l);
  assert.ok(h.includes('b.children[i]!==a[i].p'), 'default order must not reparent every card');
  const slug = pins.find(p => Array.isArray(categories[p.slug]) && categories[p.slug].length > 1).slug;
  assert.ok(h.includes('data-slug="' + slug + '"') && h.includes('data-cat="' + categories[slug].join(' ') + '"'));
  const master = pins.find(p => pinLevel(p) === 'master' && SCALES.includes(scales[p.slug]));
  assert.match(h, new RegExp('data-slug="' + master.slug + '"[^>]*data-scale="' + scales[master.slug] + '"'));
  for (const s of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(s[1]));
});

test('without thumbnails the card still points at the original cover and is not lazy', () => {
  const h = renderBoard(site, board);
  const p = pins[0];
  assert.ok(h.includes(p.images[0].replace(/^assets\//, '../assets/')));
  assert.ok(!h.includes('board-thumbs'));
  assert.ok(!h.includes('loading="lazy"'));
  assert.ok(!h.includes('data-cat='));
});
