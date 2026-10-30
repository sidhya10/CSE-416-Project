import type { Digest, DigestAlert } from './digest.service.js';

// Light palette from client/src/theme.css. Email clients cannot read CSS variables, so the values are repeated here.
const C = {
  page: '#f6f4ed', surface: '#ffffff', border: '#dedbcc', primary: '#1f6e52', text: '#1a2421', muted: '#6b7870', track: '#eeeee5',
  softGreen: '#e8f0e3', softGreenBorder: '#cfe0cb', danger: '#b74d3b', dangerSoft: '#fbe6e1', dangerBorder: '#f0c9c1',
  warningSoft: '#fff0d0', warningText: '#644711', warningBorder: '#f1d9a2',
};
const FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const group = (cents: number) => (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** $1,234.50 */
export const money = (cents: number) => `${cents < 0 ? '-' : ''}$${group(cents)}`;
/** Whole dollars when there are no cents, as in "$410 left of $980". */
export const dollars = (cents: number) => cents % 100 === 0 ? `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US')}` : money(cents);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const periodLabel = (digest: Digest) => `${day(digest.period.start)} – ${day(digest.period.end)}`;
const percent = (part: number, whole: number) => whole > 0 ? Math.min(100, Math.max(0, part / whole * 100)) : 0;

export const digestSubject = (digest: Digest) => digest.spending ? `Your week in Divvy: ${money(digest.spending.weekCents)} spent` : 'Your week in Divvy';

const label = (text: string) => `<p style="margin:28px 0 8px;font-family:${FONT};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted}">${esc(text)}</p>`;
const gap = (px = 8) => `<div style="height:${px}px;line-height:${px}px;font-size:0">&nbsp;</div>`;
const card = (inner: string, background = C.surface, border = C.border) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${background};border:1px solid ${border};border-radius:12px"><tr><td style="padding:14px 16px;font-family:${FONT};font-size:15px;line-height:1.4;color:${C.text}">${inner}</td></tr></table>`;
const split = (left: string, right: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="left" valign="middle">${left}</td><td align="right" valign="middle" style="padding-left:12px">${right}</td></tr></table>`;
const small = (text: string, color = C.muted) => `<span style="font-size:13px;color:${color}">${text}</span>`;

/** A thin progress bar drawn with table cells, so it renders without images or CSS support. */
function bar(pct: number) {
  const filled = Math.round(pct);
  const cells = filled >= 100 ? `<td style="background:${C.primary};height:8px;font-size:0;line-height:0">&nbsp;</td>`
    : filled <= 0 ? `<td style="background:${C.track};height:8px;font-size:0;line-height:0">&nbsp;</td>`
    : `<td width="${filled}%" style="background:${C.primary};height:8px;font-size:0;line-height:0">&nbsp;</td><td style="background:${C.track};height:8px;font-size:0;line-height:0">&nbsp;</td>`;
  return `<div style="margin:6px 0;border-radius:4px;overflow:hidden"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table></div>`;
}

const TONES = {
  attention: { background: C.surface, border: C.border, dot: C.primary, text: C.text, detail: C.muted },
  over: { background: C.dangerSoft, border: C.dangerBorder, dot: C.danger, text: C.danger, detail: C.danger },
  near: { background: C.warningSoft, border: C.warningBorder, dot: C.warningText, text: C.warningText, detail: C.warningText },
} as const;

function alertCard(alert: DigestAlert) {
  const tone = TONES[alert.tone];
  const body = alert.tone === 'attention'
    ? `<strong style="font-size:14px">${esc(alert.title)}</strong>${alert.detail ? `<div style="font-size:13px;color:${tone.detail}">${esc(alert.detail)}</div>` : ''}`
    : `<strong style="color:${tone.text}">${esc(alert.title)}</strong>${alert.detail ? `<span style="color:${tone.detail}">: ${esc(alert.detail)}</span>` : ''}`;
  return `${card(`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="20" valign="top" style="color:${tone.dot};font-size:14px;line-height:1.4">&#9679;</td><td style="font-family:${FONT};font-size:14px;line-height:1.4;color:${tone.text}">${body}</td></tr></table>`, tone.background, tone.border)}${gap()}`;
}

function spendingCards(spending: NonNullable<Digest['spending']>) {
  const { month } = spending;
  const monthPart = month ? (() => {
    const left = month.plannedCents - month.spentCents;
    const used = Math.round(month.spentCents / month.plannedCents * 100);
    const days = `${plural(month.daysLeft, 'day')} to go`;
    return `${gap(10)}${split(`<span style="font-size:14px;color:${C.muted}">${esc(month.label)} budget</span>`, `<strong style="font-size:14px">${used}% used</strong>`)}`
      + bar(percent(month.spentCents, month.plannedCents))
      + `<div style="text-align:right">${small(left >= 0 ? `${dollars(left)} left of ${dollars(month.plannedCents)} · ${days}` : `${dollars(-left)} over ${dollars(month.plannedCents)} · ${days}`)}</div>`;
  })() : '';
  const top = spending.topCategories.map(category =>
    `${split(`<strong style="font-size:14px">${esc(category.label)}</strong>`, `<span style="font-size:14px">${money(category.cents)}</span>`)}${bar(percent(category.cents, spending.weekCents))}`).join(gap(6));
  return `<div style="height:20px;line-height:20px;font-size:0">&nbsp;</div>`
    + `${card(`${split(`<span style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted}">Spent this week</span>`, `<strong style="font-size:24px">${money(spending.weekCents)}</strong>`)}${monthPart}`)}${gap(12)}`
    + (top ? `${card(`<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};margin-bottom:8px">Where it went (top ${spending.topCategories.length})</div>${top}`)}` : '');
}

function splittingCards(digest: Digest, appOrigin: string) {
  const { splitting, settling } = digest;
  if (!splitting && !settling) return '';
  const parts: string[] = [label('Splitting & settling up')];
  if (splitting) {
    parts.push(card(`<strong>${plural(splitting.count, 'expense')} split (${money(splitting.totalCents)} total)</strong><div style="font-size:13px;color:${C.muted}">You paid ${money(splitting.paidCents)} · your share ${money(splitting.shareCents)}</div>`), gap());
  }
  if (settling) {
    const balances: string[] = [];
    if (settling.owedCents > 0) balances.push(card(`${small('You are owed', C.primary)}<div style="font-size:20px;font-weight:700;color:${C.primary};margin:4px 0">${money(settling.owedCents)}</div>${small(`in ${plural(settling.owedGroups, 'group')}`, C.primary)}`, C.softGreen, C.softGreenBorder));
    if (settling.oweCents > 0) balances.push(card(`${small('You owe')}<div style="font-size:20px;font-weight:700;margin:4px 0">${money(settling.oweCents)}</div>${small(`in ${plural(settling.oweGroups, 'group')}`, C.primary)}`));
    if (balances.length === 2) {
      parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="top">${balances[0]}</td><td width="8" style="font-size:0">&nbsp;</td><td width="50%" valign="top">${balances[1]}</td></tr></table>`, gap());
    } else if (balances[0]) parts.push(balances[0], gap());
    if (settling.awaitingConfirmation > 0) {
      parts.push(card(split(`<span style="font-size:14px">${plural(settling.awaitingConfirmation, 'payment')} waiting for your confirmation</span>`, `<a href="${esc(appOrigin)}" style="font-size:14px;color:${C.primary};text-decoration:none">Review</a>`)), gap());
    }
  }
  return parts.join('');
}

function comingUpCards(digest: Digest) {
  if (!digest.comingUp.length) return '';
  return label('Coming up (next 7 days)') + digest.comingUp.map(bill =>
    card(split(`<strong style="font-size:14px">${esc(bill.title)}</strong><div style="font-size:13px;color:${C.muted}">${day(bill.date)}</div>`, `<strong style="font-size:14px">${money(bill.shareCents)}</strong><div style="font-size:13px;color:${C.muted}">your share</div>`)) + gap()).join('');
}

/** The weekly email as a single-column HTML document: tables and inline styles only, so it renders in mail clients. */
export function renderDigestHtml(digest: Digest, options: { appOrigin: string }) {
  const initial = esc((digest.firstName.charAt(0) || '?').toUpperCase());
  const preheader = digest.spending ? `You spent ${money(digest.spending.weekCents)} this week.` : 'Your alerts and shared activity from the past week.';
  const alerts = digest.alerts.length ? label('Alerts & attention') + digest.alerts.map(alertCard).join('') : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Your week in Divvy</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;color:${C.page}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="font-family:${FONT};color:${C.text}">
${split(`<span style="font-size:22px;font-weight:700;color:${C.primary}">Divvy</span> <span style="display:inline-block;margin-left:6px;padding:2px 10px;border:1px solid ${C.border};border-radius:999px;background:${C.track};font-size:12px;color:${C.muted}">${esc(periodLabel(digest))}</span>`, `<div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:${C.track};border:1px solid ${C.border};text-align:center;font-size:13px;color:${C.muted}">${initial}</div>`)}
<h1 style="margin:28px 0 4px;font-size:22px;line-height:1.2;color:${C.text}">Hi ${esc(digest.firstName)},</h1>
<p style="margin:0;font-size:15px;line-height:1.4;color:${C.muted}">Here is a snapshot of your spending, alerts, and shared activity from the past week.</p>
${alerts}
${digest.spending ? spendingCards(digest.spending) : ''}
${splittingCards(digest, options.appOrigin)}
${comingUpCards(digest)}
${gap(16)}
<a href="${esc(options.appOrigin)}" style="display:block;background:${C.primary};color:#ffffff;text-align:center;padding:14px 16px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none">Open Divvy</a>
<p style="margin:14px 0 0;text-align:center;font-size:12px;color:${C.muted}">Divvy records payments but never moves money.</p>
</td></tr></table>
</td></tr></table>
</body></html>
`;
}

/** The same content as plain text, for mail clients that do not show HTML. */
export function renderDigestText(digest: Digest, options: { appOrigin: string }) {
  const lines: string[] = [`Divvy · ${periodLabel(digest)}`, '', `Hi ${digest.firstName},`, 'Here is a snapshot of your spending, alerts, and shared activity from the past week.'];
  const section = (title: string, body: string[]) => { if (body.length) lines.push('', title.toUpperCase(), ...body); };
  section('Alerts & attention', digest.alerts.map(alert => `- ${alert.title}${alert.detail ? `: ${alert.detail}` : ''}`));
  if (digest.spending) {
    const { month } = digest.spending;
    const body = [`Spent this week: ${money(digest.spending.weekCents)}`];
    if (month) {
      const left = month.plannedCents - month.spentCents;
      body.push(`${month.label} budget: ${Math.round(month.spentCents / month.plannedCents * 100)}% used, ${left >= 0 ? `${dollars(left)} left of ${dollars(month.plannedCents)}` : `${dollars(-left)} over ${dollars(month.plannedCents)}`}, ${plural(month.daysLeft, 'day')} to go`);
    }
    section('Spending', body);
    section(`Where it went (top ${digest.spending.topCategories.length})`, digest.spending.topCategories.map(category => `- ${category.label}: ${money(category.cents)}`));
  }
  const settle: string[] = [];
  if (digest.splitting) settle.push(`${plural(digest.splitting.count, 'expense')} split (${money(digest.splitting.totalCents)} total). You paid ${money(digest.splitting.paidCents)}, your share ${money(digest.splitting.shareCents)}.`);
  if (digest.settling) {
    if (digest.settling.owedCents > 0) settle.push(`You are owed ${money(digest.settling.owedCents)} in ${plural(digest.settling.owedGroups, 'group')}.`);
    if (digest.settling.oweCents > 0) settle.push(`You owe ${money(digest.settling.oweCents)} in ${plural(digest.settling.oweGroups, 'group')}.`);
    if (digest.settling.awaitingConfirmation > 0) settle.push(`${plural(digest.settling.awaitingConfirmation, 'payment')} waiting for your confirmation.`);
  }
  section('Splitting & settling up', settle);
  section('Coming up (next 7 days)', digest.comingUp.map(bill => `- ${bill.title}, ${day(bill.date)}: ${money(bill.shareCents)} (your share)`));
  lines.push('', `Open Divvy: ${options.appOrigin}`, '', 'Divvy records payments but never moves money.');
  return `${lines.join('\n')}\n`;
}
