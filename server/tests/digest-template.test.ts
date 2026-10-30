import { describe, expect, it } from 'vitest';
import { sampleDigest } from '../src/modules/digest/digest.sample.js';
import { isDigestEmpty, weekWindow, type Digest } from '../src/modules/digest/digest.service.js';
import { digestSubject, dollars, money, renderDigestHtml, renderDigestText } from '../src/modules/digest/digest.template.js';

const options = { appOrigin: 'https://divvy.example' };
const empty: Digest = { firstName: 'Sam', period: { start: '2026-10-23', end: '2026-10-29' }, alerts: [], spending: null, splitting: null, settling: null, comingUp: [] };

describe('weekly email template', () => {
  it('renders every wireframe section from the sample numbers', () => {
    const html = renderDigestHtml(sampleDigest, options);
    for (const text of [
      'Hi Sidhya,', 'Oct 20 – Oct 26', 'Alerts &amp; attention', 'Bank connection needs re-authentication', '6 transactions pending review',
      'Dining is over limit', '$412 of $365 budget used', 'Shopping near limit', '86% of budget ($258 of $300)',
      '$182.40', 'October budget', '58% used', '$410 left of $980 · 9 days to go', 'Where it went (top 3)', '$74.10', '$52.00', '$21.30',
      '4 expenses split ($215.00 total)', 'You paid $140.00 · your share $52.50', 'You are owed', '$38.00', 'in 2 groups', 'You owe', '$12.50', 'in 1 group',
      '1 payment waiting for your confirmation', 'Coming up (next 7 days)', 'Rent', 'Oct 31', '$850.00', 'Open Divvy', 'Divvy records payments but never moves money.',
    ]) expect(html, text).toContain(text);
  });

  it('uses the app palette, links to the app, and needs no images or scripts', () => {
    const html = renderDigestHtml(sampleDigest, options);
    expect(html).toContain('#1f6e52');
    expect(html).toContain('#f6f4ed');
    expect(html).toContain('href="https://divvy.example"');
    expect(html).not.toMatch(/<img|<script|<link|url\(/i);
  });

  it('escapes names and bill titles', () => {
    const html = renderDigestHtml({ ...empty, firstName: '<b>Sam</b>', comingUp: [{ title: '"Rent" & <i>bills</i>', date: '2026-10-31', shareCents: 100 }] }, options);
    expect(html).toContain('Hi &lt;b&gt;Sam&lt;/b&gt;,');
    expect(html).toContain('&quot;Rent&quot; &amp; &lt;i&gt;bills&lt;/i&gt;');
    expect(html).not.toContain('<b>Sam</b>');
  });

  it('leaves out sections that have nothing to show', () => {
    const html = renderDigestHtml({ ...empty, alerts: [{ tone: 'over', title: 'Dining is over limit', detail: '$412 of $365 budget used' }] }, options);
    expect(html).toContain('Dining is over limit');
    for (const text of ['Spent this week', 'Where it went', 'Splitting &amp; settling up', 'Coming up']) expect(html).not.toContain(text);
  });

  it('shows only the balance that applies', () => {
    const html = renderDigestHtml({ ...empty, settling: { owedCents: 0, owedGroups: 0, oweCents: 1250, oweGroups: 1, awaitingConfirmation: 0 } }, options);
    expect(html).toContain('You owe');
    expect(html).not.toContain('You are owed');
    expect(html).not.toContain('waiting for your confirmation');
  });

  it('reports spending over the monthly budget, and spending with no limits set', () => {
    const over = renderDigestHtml({ ...empty, spending: { weekCents: 5000, topCategories: [], month: { label: 'October', plannedCents: 10000, spentCents: 12000, daysLeft: 1 } } }, options);
    expect(over).toContain('120% used');
    expect(over).toContain('$20 over $100 · 1 day to go');
    const noLimits = renderDigestHtml({ ...empty, spending: { weekCents: 5000, topCategories: [], month: null } }, options);
    expect(noLimits).toContain('$50.00');
    expect(noLimits).not.toContain('budget</span>');
  });

  it('renders a plain-text version with the same content', () => {
    const text = renderDigestText(sampleDigest, options);
    for (const line of [
      'Hi Sidhya,', '- Dining is over limit: $412 of $365 budget used', 'Spent this week: $182.40', 'October budget: 58% used, $410 left of $980, 9 days to go',
      '- Dining: $74.10', '4 expenses split ($215.00 total). You paid $140.00, your share $52.50.', 'You are owed $38.00 in 2 groups.', 'You owe $12.50 in 1 group.',
      '1 payment waiting for your confirmation.', '- Rent, Oct 31: $850.00 (your share)', 'Open Divvy: https://divvy.example',
    ]) expect(text, line).toContain(line);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('writes a subject line, with or without spending', () => {
    expect(digestSubject(sampleDigest)).toBe('Your week in Divvy: $182.40 spent');
    expect(digestSubject(empty)).toBe('Your week in Divvy');
  });

  it('formats money', () => {
    expect(money(123456)).toBe('$1,234.56');
    expect(money(5)).toBe('$0.05');
    expect(money(-2000)).toBe('-$20.00');
    expect(dollars(98000)).toBe('$980');
    expect(dollars(98050)).toBe('$980.50');
  });
});

describe('weekly email rules', () => {
  it('skips users with nothing to show', () => {
    expect(isDigestEmpty(empty)).toBe(true);
    expect(isDigestEmpty(sampleDigest)).toBe(false);
    expect(isDigestEmpty({ ...empty, alerts: [{ tone: 'attention', title: '1 transaction to review' }] })).toBe(false);
    expect(isDigestEmpty({ ...empty, comingUp: [{ title: 'Rent', date: '2026-10-31', shareCents: 100 }] })).toBe(false);
  });

  it('covers the seven full UTC days before today, across month and year ends', () => {
    expect(weekWindow(new Date('2026-10-30T14:00:00Z'))).toMatchObject({ startDate: '2026-10-23', endDate: '2026-10-29' });
    expect(weekWindow(new Date('2026-11-03T00:00:00Z'))).toMatchObject({ startDate: '2026-10-27', endDate: '2026-11-02' });
    expect(weekWindow(new Date('2027-01-02T23:59:59Z'))).toMatchObject({ startDate: '2026-12-26', endDate: '2027-01-01' });
  });
});
