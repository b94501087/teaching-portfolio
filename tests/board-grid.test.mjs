// /board/ reads left to right. CSS grid (not columns) places cards in DOM order,
// which is whatever sort or filter last wrote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeBoard, renderBoard } from '../admin/render.js';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('board is a row-major grid: 4, 3, then 2 equal columns', () => {
  assert.match(css, /\.board\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);grid-auto-flow:row;/);
  assert.match(css, /@media\(max-width:1100px\)\{\.board\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}\}/);
  assert.match(css, /@media\(max-width:700px\)\{\.board\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
  assert.match(css, /\.teach-wall \.board\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.doesNotMatch(css, /column-count/);
  assert.match(css, /\.pin\.big\{grid-column:span 2\}/);
  assert.match(css, /\.pin\[hidden\]\{display:none\}/);
});

test('board HTML does not ship the column-packing masonry script', () => {
  const board = mergeBoard(JSON.parse(readFileSync(new URL('../content/board.json', import.meta.url), 'utf8')), f => JSON.parse(readFileSync(new URL('../content/' + f, import.meta.url), 'utf8')));
  const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));
  const h = renderBoard(site, board);
  assert.doesNotMatch(h, /columnCount|classList\.add\('masonry'\)|masonry/);
  const big = renderBoard(site, { pins: [{ title: 'Wide', slug: 'wide', big: true, images: ['assets/board/chimera-haven/01-original-evolution.webp'], description: 'A | B | 2020 | Student Project' }] });
  assert.match(big, /class="pin big /);
  assert.doesNotMatch(big, /columnCount|masonry/);
});
