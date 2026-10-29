import { useState } from 'react';
import { formatCents } from '../expenses/split';
import {
  MAX_SAVED_SCENARIOS, SLIDER_STEP_CENTS, baselineLeftCents, categoryResults, projectedLeftCents, scenarioDeltaCents,
  summarizeScenario, totalPlanCents,
  type CategoryKey, type CategoryLimits, type CategoryResult, type ResultStatus, type SimCategory, type SimModel,
} from './simulator';
import './simulator.css';

function CategorySlider({ category, value, onChange, onReset }: {
  category: SimCategory; value: number; onChange: (cents: number) => void; onReset: () => void;
}) {
  const current = category.limitCents;
  const pct = current ? Math.min(100, Math.max(0, (value / current) * 100)) : 0;
  return <div className="sim-category">
    <div className="sim-category-head"><strong>{category.label}</strong>
      <button type="button" className="sim-reset" disabled={value === current} onClick={onReset}>↺ Reset</button></div>
    <div className="sim-category-values"><span>{formatCents(current)}</span><span aria-hidden="true">→</span><b>{formatCents(value)}</b></div>
    <input className="sim-slider" type="range" min={Math.min(SLIDER_STEP_CENTS, current)} max={current} step={SLIDER_STEP_CENTS} value={value}
      style={{ background: `linear-gradient(to right, var(--primary) ${pct}%, var(--track) ${pct}%)` }}
      aria-label={`${category.label} scenario limit, currently ${formatCents(value)}`} onChange={event => onChange(Number(event.target.value))} />
  </div>;
}

const STATUS_LABEL: Record<ResultStatus, string> = { 'on-track': 'On track', 'needs-cuts': 'Needs cuts', 'over-limit': 'Over limit' };

function ResultRow({ result }: { result: CategoryResult }) {
  const { category, limitCents, status } = result;
  const scale = Math.max(limitCents, result.paceCents, category.spentCents) || 1;
  const pct = (cents: number) => `${Math.min(100, Math.max(0, (cents / scale) * 100))}%`;
  const note = result.changed && result.savedCents !== 0
    ? `${result.savedCents > 0 ? 'Saves' : 'Adds'} ${formatCents(Math.abs(result.savedCents))} vs your current limit.`
    : result.dailyAllowanceCents !== null ? `Keep to ${formatCents(result.dailyAllowanceCents)} a day to stay inside the limit.` : '';
  return <div className={`sim-result${result.changed ? ' changed' : ''}`}>
    <div className="sim-result-head">
      <span className="sim-result-icon" aria-hidden="true">{category.icon}</span><strong>{category.label}</strong>
      <span className={`sim-chip ${status}`}>{STATUS_LABEL[status]}</span>
    </div>
    <div className="sim-result-bar" role="img" aria-label={`${category.label}: ${formatCents(category.spentCents)} spent, ${formatCents(result.projectedCents)} projected, limit ${formatCents(limitCents)}`}>
      <div className="projected" style={{ width: pct(result.projectedCents) }} />
      <div className="spent" style={{ width: pct(category.spentCents) }} />
      <i className="limit" style={{ left: pct(limitCents) }} />
    </div>
    <dl className="sim-result-stats">
      <div><dt>Spent</dt><dd>{formatCents(category.spentCents)}</dd></div>
      <div><dt>Limit</dt><dd>{formatCents(limitCents)}</dd></div>
      <div><dt>Projected</dt><dd>{formatCents(result.projectedCents)}</dd></div>
    </dl>
    {note && <p className="sim-result-note">{note}</p>}
  </div>;
}

function SaveDialog({ defaultName, onCancel, onSave }: { defaultName: string; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(defaultName);
  return <div className="sim-dialog-backdrop" onKeyDown={event => { if (event.key === 'Escape') onCancel(); }}>
    <div className="sim-dialog" role="dialog" aria-modal="true" aria-labelledby="save-scenario-title">
      <h2 id="save-scenario-title">Save scenario</h2>
      <label>SCENARIO NAME<input autoFocus maxLength={40} value={name} placeholder="e.g. Weekend cutback" onChange={event => setName(event.target.value)} /></label>
      <div><button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</button></div>
    </div>
  </div>;
}

type Props = {
  model: SimModel;
  draftLimits: CategoryLimits;
  scenarioCount: number;
  defaultSaveName: string;
  notice?: string;
  loadError?: string;
  onChangeCategory: (key: CategoryKey, cents: number) => void;
  onResetCategory: (key: CategoryKey) => void;
  onOpenSaved: () => void;
  onBack: () => void;
  onSave: (name: string) => void;
  onApply: () => void;
};

export default function ScenarioEditor({
  model, draftLimits, scenarioCount, defaultSaveName, notice, loadError,
  onChangeCategory, onResetCategory, onOpenSaved, onBack, onSave, onApply,
}: Props) {
  const [saving, setSaving] = useState(false);
  const projected = projectedLeftCents(model, draftLimits);
  const delta = scenarioDeltaCents(model, draftLimits);
  const plan = totalPlanCents(model);
  const barPct = plan ? Math.min(100, Math.max(0, (projected / plan) * 100)) : 0;
  const results = categoryResults(model, draftLimits);
  const hasChanges = results.some(result => result.changed);

  return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>What-if simulator</h1><p>See how choices change your month</p></div></header>

    <section className="sim-hero" aria-label="Projected balance">
      <div className="sim-hero-top"><span>PROJECTED LEFT</span>
        <span><small>OF YOUR PLAN</small><b>{formatCents(plan)}</b></span></div>
      <strong className="sim-hero-amount">{formatCents(projected)}</strong>
      <div className="sim-hero-bar" role="presentation"><div style={{ width: `${barPct}%` }} /></div>
      <p className="sim-hero-delta" aria-live="polite">{delta === 0 ? 'Same as your current limits' : `${delta > 0 ? '↑' : '↓'} ${formatCents(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} than your current limits`}</p>
    </section>
    <p className="sim-note">Based on your spending so far in {model.monthLabel}, continued at the same daily pace for the {model.daysLeft} days left.</p>
    <p className="sim-subnote">Today's plan leaves {formatCents(baselineLeftCents(model))} unspent by month end.</p>

    <div className="sim-section-line"><h2>Adjust categories</h2>
      <button type="button" className="sim-pill" onClick={onOpenSaved}>Saved scenarios <b>{scenarioCount}/{MAX_SAVED_SCENARIOS}</b></button></div>
    {model.categories.map(category => <CategorySlider key={category.key} category={category} value={draftLimits[category.key] ?? category.limitCents}
      onChange={cents => onChangeCategory(category.key, cents)} onReset={() => onResetCategory(category.key)} />)}

    <section aria-label="Projected results">
      <div className="sim-section-line"><h2>Projected results</h2></div>
      <p className={`sim-summary${hasChanges ? ' active' : ''}`} aria-live="polite">{summarizeScenario(model, draftLimits)}</p>
      {results.map(result => <ResultRow key={result.category.key} result={result} />)}
    </section>

    {loadError && <p className="form-notice" role="alert">Couldn't refresh your budget: {loadError}</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}

    <footer className="sim-footer">
      <button className="primary-button" type="button" onClick={() => setSaving(true)}>Save scenario</button>
      <button className="sim-secondary-button" type="button" disabled={!hasChanges} onClick={onApply}>Apply to budget</button>
      <small>Saving keeps a scenario on your account. Apply to budget updates your real limits.</small>
    </footer>
    {saving && <SaveDialog defaultName={defaultSaveName} onCancel={() => setSaving(false)} onSave={name => { setSaving(false); onSave(name); }} />}
  </main>;
}
