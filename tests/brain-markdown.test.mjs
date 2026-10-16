// Run: node --test tests/brain-markdown.test.mjs
// Loaded via a data URL for the same reason as the Life Admin tests (no root package.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../site/brain/markdown.js', import.meta.url), 'utf8');
const md = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('frontmatter parses scalars and inline lists', () => {
  const { meta, body } = md.parseFrontmatter('---\nproject: brain\npeople: []\nrepositories: [https://x.test/a, "b"]\n---\n\n# Hi\n');
  assert.deepEqual(meta, { project: 'brain', people: [], repositories: ['https://x.test/a', 'b'] });
  assert.equal(body.trim(), '# Hi');
  assert.equal(md.parseFrontmatter('# none').meta, null);
});

test('raw HTML and script URLs in Brain files never become markup', () => {
  const html = md.renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](data:text/html,hi)\n\n`<b>`');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('data:'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<code>&lt;b&gt;</code>'));
});

test('link targets are mapped by the caller and emphasis never touches hrefs', () => {
  const html = md.renderInline('[State](../a_b_c/STATE.md) and _em_', (href) => ({ href: '#/' + href, external: false }));
  assert.equal(html, '<a href="#/../a_b_c/STATE.md">State</a> and <em>em</em>');
  const ext = md.renderInline('[site](https://staldex.com)');
  assert.ok(ext.includes('target="_blank" rel="noopener noreferrer"'));
});

test('relative paths resolve against the linking file', () => {
  assert.equal(md.resolvePath('INDEX.md', 'projects/brain/STATE.md'), 'projects/brain/STATE.md');
  assert.equal(md.resolvePath('graph/nodes/root-brain.md', '../../projects/brain/STATE.md'), 'projects/brain/STATE.md');
  assert.equal(md.resolvePath('projects/brain/STATE.md', './QUEUE.md'), 'projects/brain/QUEUE.md');
});

test('tables, nested lists, task boxes and fences render', () => {
  const html = md.renderMarkdown([
    '| A | B |', '|---|---:|', '| 1 | 2 |', '',
    '1. one', '2. two', '   - nested', '- [x] done', '',
    '```text', '# not a heading', '```',
  ].join('\n'));
  assert.ok(html.includes('<th>A</th><th style="text-align:right">B</th>'));
  assert.ok(html.includes('<ol><li>one</li><li>two<ul><li>nested</li></ul></li></ol>'));
  assert.ok(html.includes('<li class="task done">done</li>'));
  assert.ok(html.includes('<pre data-lang="text"><code># not a heading</code></pre>'));
});

test('queue cards: field chips and labelled lines', () => {
  const html = md.renderMarkdown('`id: brain-001` `burnable: yes`\n\nOutcome: it works,\nwrapped.\nAcceptance: tested.');
  assert.ok(html.includes('<code class="field" data-key="burnable" data-value="yes"><span>burnable</span> yes</code>'));
  assert.ok(html.includes('<b class="label">Outcome:</b> it works, wrapped.<br><b class="label">Acceptance:</b> tested.'));
});
