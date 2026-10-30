// The key details Leon gives an inbox item on its categorisation card (Brain D-100 B).
// Pure validation, no I/O. queue.js writes them onto an Inbox line for the scheduled
// groom (Brain D-102) to turn into a card; register.js sets them on a new register item
// as it is confirmed.

import { QueueError } from './queue.js';

const FAMILY = /^(?:\?|[A-Z]+(?:-[A-Z]+)?)$/;
const PRIORITY = /^P[0-3]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OWNER = /^(?:unknown|[a-z][a-z0-9-]{0,39})$/;

// One line of plain text for a code span or a labelled line: no backticks or pipes.
function cleanText(raw, max, label, required = false) {
  if (raw == null || raw === '') {
    if (required) throw new QueueError('invalid-text', `${label} is required`);
    return '';
  }
  if (typeof raw !== 'string') throw new QueueError('invalid-text', `${label} must be text`);
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[`|]/g, "'").replace(/\s+/g, ' ').trim();
  if (required && !text) throw new QueueError('invalid-text', `${label} is required`);
  if ([...text].length > max) throw new QueueError('invalid-text', `${label} is over ${max} characters`);
  return text;
}

export function cleanDetails(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new QueueError('invalid-text', 'details are required');
  const d = {
    title: cleanText(raw.title, 200, 'what it is'),
    next: cleanText(raw.next, 300, 'the next step', true),
    family: String(raw.family || ''),
    priority: String(raw.priority || ''),
    minutes: raw.minutes === '' || raw.minutes == null ? null : Number(raw.minutes),
    due: String(raw.due || ''),
    owner: String(raw.owner || 'leon').trim().toLowerCase(),
    // From the Inbox tab's question walk (Brain DEV-61026.33): several actions make a
    // project with an Outcome (D-108 A); a hand-over to Claude or a person (D-105 C).
    kind: String(raw.kind || 'action'),
    outcome: cleanText(raw.outcome, 300, 'the outcome'),
    ai: String(raw.ai || ''),
    handover: cleanText(raw.handover, 200, 'the handover'),
  };
  if (!['action', 'project'].includes(d.kind)) throw new QueueError('invalid-text', 'kind must be action or project');
  if (d.kind === 'project' && !d.outcome) throw new QueueError('invalid-text', 'a project needs an outcome');
  if (d.ai && !['prepare', 'complete'].includes(d.ai)) throw new QueueError('invalid-text', 'ai must be prepare or complete');
  if (!FAMILY.test(d.family)) throw new QueueError('invalid-text', 'family must be one from context/families.md, or ?');
  if (d.priority && !PRIORITY.test(d.priority)) throw new QueueError('invalid-text', 'priority must be P0 to P3');
  if (d.minutes !== null && (!Number.isInteger(d.minutes) || d.minutes < 30 || d.minutes > 9990 || d.minutes % 30)) {
    throw new QueueError('invalid-text', 'the estimate is in half hours, from 30 minutes');
  }
  if (d.due && !DATE.test(d.due)) throw new QueueError('invalid-text', 'due must be YYYY-MM-DD');
  if (!OWNER.test(d.owner)) throw new QueueError('invalid-text', 'owner must be a lowercase name or unknown');
  return d;
}

// The code spans an Inbox line carries once categorised; the groom reads them.
export function lineAttrs(d, today) {
  return [`categorised: ${today}`, `family: ${d.family}`, d.priority && `priority: ${d.priority}`,
    d.minutes && `minutes: ${d.minutes}`, d.due && `due: ${d.due}`, `owner: ${d.owner}`,
    d.kind === 'project' && 'kind: project', d.outcome && `outcome: ${d.outcome}`, d.ai && `ai: ${d.ai}`,
    d.handover && `handover: ${d.handover}`, `next: ${d.next}`]
    .filter(Boolean).map((a) => `\`${a}\``).join(' ');
}
