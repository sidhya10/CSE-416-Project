import { formatCents } from '../expenses/split';
import { changedCategories, initials, limitFor, projectedLeftCents, relativeTime, type Scenario, type SimModel } from './simulator';
import './simulator.css';

type Props = {
  model: SimModel;
  scenario: Scenario;
  notice?: string;
  busy?: boolean;
  onBack: () => void;
  onCancel: () => void;
  onApply: () => void;
};

export default function ApplyScenario({ model, scenario, notice, busy = false, onBack, onCancel, onApply }: Props) {
  const projected = projectedLeftCents(model, scenario.limits);
  const changed = changedCategories(model, scenario.limits);

  return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>Apply scenario</h1><p>Confirm the changes before they update your budget.</p></div></header>

    <h2 className="sim-comparison-heading">Scenario details</h2>
    <div className="sim-scenario-card">
      <div className="sim-scenario-card-head">
        <span className="sim-avatar tone-0" aria-hidden="true">{initials(scenario.name)}</span>
        <span><strong>{scenario.name}</strong><small>Scenario · Last edited {relativeTime(scenario.savedAt)}</small></span>
      </div>
      <div className="sim-detail-row projected"><small>Projected left</small><b>{formatCents(projected)}</b></div>
      <div className="sim-detail-row"><small>Category changes</small><b>{changed.length} limit{changed.length === 1 ? '' : 's'} updated</b></div>
    </div>

    <h2 className="sim-comparison-heading">What will change</h2>
    {changed.length === 0 ? <p className="sim-caption">No category limits differ from your current budget.</p> :
      changed.map(category => {
        const next = limitFor(category, scenario.limits);
        const deltaCents = category.limitCents - next;
        return <div className="sim-change-row" key={category.key}>
          <span className="sim-change-icon" aria-hidden="true">{category.icon}</span>
          <span className="sim-change-copy"><strong>{category.label}</strong>
            <small>Current {formatCents(category.limitCents)} → Scenario {formatCents(next)}</small></span>
          <b className={`sim-change-delta ${deltaCents >= 0 ? 'savings' : 'increase'}`}>{deltaCents >= 0 ? '-' : '+'}{formatCents(Math.abs(deltaCents))}</b>
        </div>;
      })}

    <h2 className="sim-next-heading">What happens next</h2>
    <div className="sim-next-card">Applying saves these limits to your real budget, so the Budget tab shows them right away. Saving a scenario alone keeps it for later without changing your limits.</div>

    {notice && <p className="form-notice" role="status">{notice}</p>}

    <footer className="sim-footer">
      <button className="primary-button" type="button" disabled={busy || changed.length === 0} onClick={onApply}>{busy ? 'Applying…' : 'Apply to budget'}</button>
      <button className="sim-secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel / Keep editing</button>
      <small>You can still edit this scenario later without affecting your budget.</small>
    </footer>
  </main>;
}
