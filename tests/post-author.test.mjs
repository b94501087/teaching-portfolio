import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AUTHOR_NAME, renderBlogPost, postJsonLd, renderFeed } from '../admin/blog.js';

const blog = JSON.parse(fs.readFileSync(new URL('../content/blog.json', import.meta.url)));
const site = JSON.parse(fs.readFileSync(new URL('../content/site.json', import.meta.url)));
const slug = 'portfolio-preparation-direction-theme-scale-skills-goal';
const post = blog.posts.find(p => p.slug === slug);
const personalName = /yu chun tsai|蔡宇鈞/i;

test('w856 scoped author: byline, author box, JSON-LD and feed entry', () => {
  assert.equal(post.author, '主線輔導');
  const html = renderBlogPost(site, blog, post);
  const byline = html.match(/<p class="post-meta">([\s\S]*?)<\/p>/)[1];
  const box = html.match(/<section class="author-box">([\s\S]*?)<\/section>/)[1];
  for (const part of [byline, box]) {
    assert.match(part, /主線輔導/);
    assert.match(part, /lang="zh-Hans">主线辅导/);
    assert.match(part, /lang="en">主線輔導/);
    assert.doesNotMatch(part, personalName);
  }
  const article = postJsonLd(post)['@graph'].find(n => n['@type'] === 'BlogPosting');
  assert.deepEqual(article.author, { '@type': 'Organization', name: '主線輔導' });
  assert.doesNotMatch(JSON.stringify(article.author), personalName);
  assert.doesNotMatch(html, /property="article:author"[^>]*\/cv\//);
  const entry = renderFeed(blog, '2026-11-17').match(/<entry>[\s\S]*?<\/entry>/g).find(e => e.includes('/' + slug + '/'));
  assert.match(entry, /<author><name>主線輔導<\/name><\/author>/);
  assert.doesNotMatch(entry, personalName);
});

test('other post keeps AUTHOR_NAME and personal author links', () => {
  const other = blog.posts.find(p => p.slug !== slug && !p.author);
  const html = renderBlogPost(site, blog, other);
  assert.ok(html.match(/<p class="post-meta">([\s\S]*?)<\/p>/)[1].includes(AUTHOR_NAME));
  assert.ok(html.match(/<section class="author-box">([\s\S]*?)<\/section>/)[1].includes(AUTHOR_NAME));
  const article = postJsonLd(other)['@graph'].find(n => n['@type'] === 'BlogPosting');
  assert.equal(article.author.name, AUTHOR_NAME);
  assert.equal(article.author['@type'], 'Person');
  assert.equal(article.author.url, 'https://yuchuntsai.com/cv/');
  const feed = renderFeed({ posts: [other] }, '2026-11-17');
  assert.ok(feed.includes('<author><name>' + AUTHOR_NAME + '</name><uri>https://yuchuntsai.com/cv/</uri></author>'));
});
