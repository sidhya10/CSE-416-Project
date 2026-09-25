import { useState } from 'react';
import { formatCents } from '../expenses/split';
import {
  CATEGORIES, MAX_SAVED_SCENARIOS, SCALE_MAX_CENTS, SLIDER_STEP_CENTS,
  projectedLeftCents, scenarioDeltaCents,
  type CategoryKey, type CategoryLimits,
} from './simulator';
import './simulator.css';

function CategorySlider({ label, current, value, onChange, onReset }: {
  label: string; current: number; value: number; onChange: (cents: number) => void; onReset: () => void;
}) {
  const pct = current ? Math.min(100, Math.max(0, (value / current) * 100)) : 0;
  return <div className="sim-category">
    <div className="sim-category-head"><strong>{label}</strong>
      <button type="button" className="sim-reset" disabled={value === current} onClick={onReset}>↺ Reset</button></div>
    <div className="sim-category-values"><span>{formatCents(current)}</span><span aria-hidden="true">→</span><b>{formatCents(value)}</b></div>
    <input className="sim-slider" type="range" min={0} max={current} step={SLIDER_STEP_CENTS} value={value}
      style={{ background: `linear-gradient(to right, #1f6e52 ${pct}%, #eeeee5 ${pct}%)` }}
      aria-label={`${label} scenario limit, currently ${formatCents(value)}`} onChange={event => onChange(Number(event.target.value))} />
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
  currentLimits: CategoryLimits;
  draftLimits: CategoryLimits;
  basePaceCents: number;
  scenarioCount: number;
  defaultSaveName: string;
  notice?: string;
  onChangeCategory: (key: CategoryKey, cents: number) => void;
  onResetCategory: (key: CategoryKey) => void;
  onOpenSaved: () => void;
  onBack: () => void;
  onSave: (name: string) => void;
  onApply: () => void;
};

export default function ScenarioEditor({
  currentLimits, draftLimits, basePaceCents, scenarioCount, defaultSaveName, notice,
  onChangeCategory, onResetCategory, onOpenSaved, onBack, onSave, onApply,
}: Props) {
  const [saving, setSaving] = useState(false);
  const projected = projectedLeftCents(currentLimits, draftLimits, basePaceCents);
  const delta = scenarioDeltaCents(currentLimits, draftLimits);
  const barPct = Math.min(100, Math.max(0, (projected / SCALE_MAX_CENTS) * 100));

  return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>What-if simulator</h1><p>See how choices change your month</p></div></header>

    <section className="sim-hero" aria-label="Projected balance">
      <div className="sim-hero-top"><span>PROJECTED LEFT</span>
        <span><small>SCALE</small><b>{formatCents(0)} → {formatCents(SCALE_MAX_CENTS)}</b></span></div>
      <strong className="sim-hero-amount">{formatCents(projected)}</strong>
      <div className="sim-hero-bar" role="presentation"><div style={{ width: `${barPct}%` }} /></div>
      <p className="sim-hero-delta" aria-live="polite">{delta >= 0 ? '↑' : '↓'} {formatCents(Math.abs(delta))} {delta >= 0 ? 'more' : 'less'} than current pace</p>
    </section>
    <p className="sim-note">This projection compares against your current monthly pace over the last 3 months.</p>
    <p className="sim-subnote">Computed from your real spending history and category limits.</p>

    <div className="sim-section-line"><h2>Adjust categories</h2>
      <button type="button" className="sim-pill" onClick={onOpenSaved}>Saved scenarios <b>{scenarioCount}/{MAX_SAVED_SCENARIOS}</b></button></div>
    {CATEGORIES.map(category => <CategorySlider key={category.key} label={category.label} current={currentLimits[category.key]}
      value={draftLimits[category.key]} onChange={cents => onChangeCategory(category.key, cents)} onReset={() => onResetCategory(category.key)} />)}

    {notice && <p className="form-notice" role="status">{notice}</p>}

    <footer className="sim-footer">
      <button className="primary-button" type="button" onClick={() => setSaving(true)}>Save scenario</button>
      <button className="sim-secondary-button" type="button" onClick={onApply}>Apply to budget</button>
      <small>Saving creates a reusable scenario. Apply to budget updates your active limits.</small>
    </footer>
    {saving && <SaveDialog defaultName={defaultSaveName} onCancel={() => setSaving(false)} onSave={name => { setSaving(false); onSave(name); }} />}
  </main>;
}
