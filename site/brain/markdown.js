// Small, escaping-first Markdown renderer for Brain files.
//
// Covers what Brain actually uses: YAML-ish frontmatter, headings, paragraphs, nested
// and ordered lists, task boxes, tables, fenced code, blockquotes, rules, and inline code,
// emphasis and links. All source text is HTML-escaped before any markup is added, and
// only http(s)/mailto/relative link targets survive, so a Brain file can never inject
// script into the page.

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "---\nkey: value\nlist: [a, b]\n---\nbody" → { meta: { key, list }, body }.
export function parseFrontmatter(text) {
  const src = String(text).replace(/\r\n?/g, '\n');
  const match = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { meta: null, body: src };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^\[.*\]$/.test(value)) {
      value = value.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
    } else {
      value = unquote(value);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: src.slice(match[0].length) };
}

function unquote(v) {
  return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v;
}

// Resolve a relative link against the directory of the file it appears in.
export function resolvePath(fromFile, href) {
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export function slugify(text) {
  return String(text).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

const SAFE_URL = /^(https?:|mailto:)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function defaultLink(href) {
  return { href, external: SAFE_URL.test(href) };
}

function emphasis(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
}

// Inline spans. Code spans are lifted out first so their contents stay literal.
export function renderInline(text, linkFor = defaultLink) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);

  // Links are lifted out as well, so emphasis markers inside an href stay untouched.
  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, rawHref) => {
    const href = rawHref.replace(/&amp;/g, '&');
    const link = HAS_SCHEME.test(href) && !SAFE_URL.test(href) ? null : linkFor(href);
    if (!link) return emphasis(label);
    const ext = link.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    links.push(`<a href="${escapeHtml(link.href)}"${ext}>${emphasis(label)}</a>`);
    return `\u0001${links.length - 1}\u0001`;
  });
  s = emphasis(s).replace(/\u0001(\d+)\u0001/g, (_, i) => links[Number(i)]);

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const code = codes[Number(i)];
    // Queue cards carry fields as `key: value` code spans; render those as chips.
    const field = code.match(/^([a-z][a-z-]*):\s+(.+)$/);
    if (field) {
      return `<code class="field" data-key="${escapeHtml(field[1])}" data-value="${escapeHtml(field[2].toLowerCase())}">` +
        `<span>${escapeHtml(field[1])}</span> ${escapeHtml(field[2])}</code>`;
    }
    return `<code>${escapeHtml(code)}</code>`;
  });
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)\s*([\w-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function isBlockStart(line, next) {
  return HEADING.test(line) || FENCE.test(line) || LIST_ITEM.test(line) || RULE.test(line) ||
    /^\s*>/.test(line) || (line.includes('|') && next !== undefined && TABLE_SEP.test(next));
}

function renderList(items, start, linkFor) {
  const indent = items[start].indent;
  const ordered = items[start].ordered;
  const first = ordered ? parseInt(items[start].marker, 10) : 1;
  let html = ordered ? (first !== 1 ? `<ol start="${first}">` : '<ol>') : '<ul>';
  let i = start;
  while (i < items.length && items[i].indent >= indent) {
    if (i > start && items[i].indent === indent && items[i].ordered !== ordered) break; // new list type
    const item = items[i++];
    let text = item.text;
    let cls = '';
    const task = text.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      cls = task[1] === ' ' ? ' class="task"' : ' class="task done"';
      text = task[2];
    }
    let inner = renderInline(text, linkFor);
    if (i < items.length && items[i].indent > indent) {
      const child = renderList(items, i, linkFor);
      inner += child.html;
      i = child.next;
    }
    html += `<li${cls}>${inner}</li>`;
  }
  return { html: html + (ordered ? '</ol>' : '</ul>'), next: i };
}

// Block-level render. `linkFor(href)` maps a Markdown href to { href, external } (or null
// to drop the link and keep its label).
export function renderMarkdown(body, { linkFor = defaultLink } = {}) {
  const lines = String(body).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const usedIds = new Map();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(FENCE);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) buf.push(lines[i++]);
      i++;
      const lang = fence[2] ? ` data-lang="${escapeHtml(fence[2])}"` : '';
      out.push(`<pre${lang}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      const html = renderInline(heading[2], linkFor);
      let id = slugify(html) || 'section';
      const n = usedIds.get(id) || 0;
      usedIds.set(id, n + 1);
      if (n) id += `-${n}`;
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++;
      continue;
    }

    if (RULE.test(line)) { out.push('<hr>'); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) =>
        c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : '');
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      const cell = (tag, text, col) => {
        const align = aligns[col] ? ` style="text-align:${aligns[col]}"` : '';
        return `<${tag}${align}>${renderInline(text, linkFor)}</${tag}>`;
      };
      out.push('<div class="table-wrap"><table><thead><tr>' +
        head.map((h, c) => cell('th', h, c)).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + head.map((_, c) => cell('td', r[c] ?? '', c)).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'), { linkFor })}</blockquote>`);
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (m) {
          items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), marker: m[2], text: m[3] });
          i++;
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          items[items.length - 1].text += ' ' + lines[i].trim(); // lazy continuation
          i++;
        } else if (!lines[i].trim() && i + 1 < lines.length && LIST_ITEM.test(lines[i + 1])) {
          i++; // loose list: blank line between items
        } else {
          break;
        }
      }
      let k = 0;
      while (k < items.length) {
        const list = renderList(items, k, linkFor);
        out.push(list.html);
        k = list.next;
      }
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) buf.push(lines[i++]);
    // Brain hard-wraps prose, so newlines are spaces — except before a `Label:` line, which
    // is how queue cards lay out Outcome / Acceptance / Context.
    const para = renderInline(buf.join('\n').trim(), linkFor)
      .replace(/(^|\n)([A-Z][A-Za-z -]{1,24}):(?=\s)/g, (_, nl, label) =>
        `${nl ? '<br>' : ''}<b class="label">${label}:</b>`)
      .replace(/\n/g, ' ');
    out.push(`<p>${para}</p>`);
  }

  return out.join('\n');
}
