import { formatCents } from '../expenses/split';
import { changedCategories, projectedLeftCents, relativeTime, scenarioDeltaCents, type CategoryLimits, type Scenario } from './simulator';
import './simulator.css';

function CompareCard({ scenario, index, currentLimits, basePaceCents, onEdit }: {
  scenario: Scenario; index: number; currentLimits: CategoryLimits; basePaceCents: number; onEdit: (scenario: Scenario) => void;
}) {
  const projected = projectedLeftCents(currentLimits, scenario.limits, basePaceCents);
  const delta = scenarioDeltaCents(currentLimits, scenario.limits);
  const changed = changedCategories(currentLimits, scenario.limits);
  const rows = changed.slice(0, 2).map(category => ({ left: category.label, right: `${formatCents(currentLimits[category.key])} → ${formatCents(scenario.limits[category.key])}` }));
  if (changed.length > 2) {
    const rest = changed.slice(2);
    const last = rest[rest.length - 1]!;
    rows.push({ left: `+${rest.length} more change${rest.length > 1 ? 's' : ''}`, right: `${last.label} · ${formatCents(currentLimits[last.key])} → ${formatCents(scenario.limits[last.key])}` });
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
  scenarios: Scenario[];
  currentLimits: CategoryLimits;
  basePaceCents: number;
  onBack: () => void;
  onEdit: (scenario: Scenario) => void;
  onApply: (scenario: Scenario) => void;
};

export default function CompareScenarios({ scenarios, currentLimits, basePaceCents, onBack, onEdit, onApply }: Props) {
  const [first, second] = scenarios;
  return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back to saved scenarios" onClick={onBack}>‹</button>
      <div><h1>Compare scenarios</h1><p>Review two saved scenarios side by side and choose which one to apply.</p></div></header>

    <div className="sim-baseline-card"><div><small>Current budget</small><span className="sim-tag">Baseline</span></div>
      <strong>{formatCents(basePaceCents)}</strong><p>Projected left after current month spending</p></div>

    {!first || !second ? <p className="form-notice" role="status">Select two saved scenarios to compare.</p> : <>
      <CompareCard scenario={first} index={0} currentLimits={currentLimits} basePaceCents={basePaceCents} onEdit={onEdit} />
      <CompareCard scenario={second} index={1} currentLimits={currentLimits} basePaceCents={basePaceCents} onEdit={onEdit} />
    </>}

    <h2 className="sim-comparison-heading">Comparison only</h2>
    <p className="sim-caption">Choose a scenario to apply it to your active budget. Your current budget stays unchanged until you apply.</p>

    {first && second && <footer className="sim-footer">
      <button className="primary-button" type="button" onClick={() => onApply(first)}>Apply {first.name}</button>
      <button className="sim-secondary-button" type="button" onClick={() => onApply(second)}>Apply {second.name}</button>
      <small>This screen only compares saved scenarios. Your active budget remains unchanged until you apply one.</small>
    </footer>}
  </main>;
}
