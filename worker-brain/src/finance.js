// The Finance tab's data (Brain DEV-61115.01, D-147 A, D-148 A).
//
// The figures never touch a git repository. Each monthly close publishes one JSON document
// into the private Workers KV namespace bound as FINANCE (key `finance`), and this route
// serves it back behind Cloudflare Access. The page draws it; nothing is cached anywhere.
//
// Access: Leon's Brain application (ACCESS_AUD) reaches Finance as it reaches the rest of
// Brain. A second application for the Finance tab alone (FINANCE_ACCESS_AUD, optionally
// narrowed by FINANCE_ALLOWED_EMAILS) lets someone see Finance and nothing else: its tokens
// are accepted on this route only, never on Brain's own reads and writes.

export const FINANCE_KEY = 'finance';
export const FINANCE_SCHEMA = 'brain-finance/1';
export const FINANCE_PARTS = ['transactions', 'budget', 'accounts', 'loans'];

function configured(value) {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== 'REPLACE_ME';
}

// The Access configurations whose tokens may read Finance: Brain's own, then Finance's own.
export function financeConfigs(brainCfg, env) {
  const out = brainCfg ? [brainCfg] : [];
  if (brainCfg && configured(env.FINANCE_ACCESS_AUD)) {
    const allowed = (env.FINANCE_ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    out.push({ teamDomain: brainCfg.teamDomain, aud: env.FINANCE_ACCESS_AUD.trim(), allowed });
  }
  return out;
}

// A published document is served only if it has the expected shape, so a bad publish
// shows as an error on the page rather than as a half-drawn tab.
export function validFinance(doc) {
  return Boolean(doc) && doc.schema === FINANCE_SCHEMA && typeof doc.published === 'string'
    && FINANCE_PARTS.every((p) => doc[p] && Array.isArray(doc[p].rows));
}
