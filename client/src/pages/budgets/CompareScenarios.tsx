import { formatCents } from '../expenses/split';
import { baselineLeftCents, changedCategories, limitFor, projectedLeftCents, relativeTime, scenarioDeltaCents, type Scenario, type SimModel } from './simulator';
import './simulator.css';

function CompareCard({ model, scenario, index, onEdit }: { model: SimModel; scenario: Scenario; index: number; onEdit: (scenario: Scenario) => void }) {
  const projected = projectedLeftCents(model, scenario.limits);
  const delta = scenarioDeltaCents(model, scenario.limits);
  const changed = changedCategories(model, scenario.limits);
  const describe = (category: SimModel['categories'][number]) => `${formatCents(category.limitCents)} → ${formatCents(limitFor(category, scenario.limits))}`;
  const rows = changed.slice(0, 2).map(category => ({ left: category.label, right: describe(category) }));
  if (changed.length > 2) {
    const rest = changed.slice(2);
    rows.push({ left: `+${rest.length} more change${rest.length > 1 ? 's' : ''}`, right: `${rest[rest.length - 1]!.label} · ${describe(rest[rest.length - 1]!)}` });
  }
  return <section className="sim-compare-card">
    <div className="sim-compare-head">
      <span className={`sim-avatar tone-${index % 4}`} aria-hidden="true">{index === 0 ? 'A' : 'B'}</span>
      <span><strong>{scenario.name}</strong><small>Saved · {relativeTime(scenario.savedAt)}</small></span>
      <span className="sim-compare-tools"><b className="sim-delta-pill">{delta >= 0 ? '+' : '-'}{formatCents(Math.abs(delta))}</b>
        <button type="button" className="sim-edit-link" onClick={() => onEdit(scenario)}>Edit</button></span>
    </div>
    <div className="sim-compare-projected"><small>Projected left</small><strong>{formatCents(projected)}</strong></div>
    {rows.length === 0 ? <p className="sim-compare-row"><span>No category changes yet</span></p> :
      rows.map(row => <div className="sim-compare-row" key={row.left}><span>{row.left}</span><small>{row.right}</small></div>)}
  </section>;
}

type Props = {
  model: SimModel;
  scenarios: Scenario[];
  onBack: () => void;
  onEdit: (scenario: Scenario) => void;
  onApply: (scenario: Scenario) => void;
};

export default function CompareScenarios({ model, scenarios, onBack, onEdit, onApply }: Props) {
  const [first, second] = scenarios;
  return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back to saved scenarios" onClick={onBack}>‹</button>
      <div><h1>Compare scenarios</h1><p>Review two saved scenarios side by side and choose which one to apply.</p></div></header>

    <div className="sim-baseline-card"><div><small>Current budget</small><span className="sim-tag">Baseline</span></div>
      <strong>{formatCents(baselineLeftCents(model))}</strong><p>Projected left at month end under your current limits</p></div>

    {!first || !second ? <p className="form-notice" role="status">Select two saved scenarios to compare.</p> : <>
      <CompareCard model={model} scenario={first} index={0} onEdit={onEdit} />
      <CompareCard model={model} scenario={second} index={1} onEdit={onEdit} />
    </>}

    <h2 className="sim-comparison-heading">Comparison only</h2>
    <p className="sim-caption">Choose a scenario to apply it to your budget. Your current limits stay unchanged until you apply.</p>

    {first && second && <footer className="sim-footer">
      <button className="primary-button" type="button" onClick={() => onApply(first)}>Apply {first.name}</button>
      <button className="sim-secondary-button" type="button" onClick={() => onApply(second)}>Apply {second.name}</button>
      <small>This screen only compares saved scenarios. Your budget remains unchanged until you apply one.</small>
    </footer>}
  </main>;
}
