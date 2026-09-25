import { formatCents } from '../expenses/split';
import { CATEGORIES, changedCategories, initials, projectedLeftCents, relativeTime, type CategoryLimits, type Scenario } from './simulator';
import './simulator.css';

type Props = {
  scenario: Scenario;
  currentLimits: CategoryLimits;
  basePaceCents: number;
  onBack: () => void;
  onCancel: () => void;
  onApply: () => void;
};

export default function ApplyScenario({ scenario, currentLimits, basePaceCents, onBack, onCancel, onApply }: Props) {
  const projected = projectedLeftCents(currentLimits, scenario.limits, basePaceCents);
  const changed = changedCategories(currentLimits, scenario.limits);

  return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>Apply scenario</h1><p>Confirm the changes before they update your active budget.</p></div></header>

    <h2 className="sim-comparison-heading">Scenario details</h2>
    <div className="sim-scenario-card">
      <div className="sim-scenario-card-head">
        <span className="sim-avatar tone-0" aria-hidden="true">{initials(scenario.name)}</span>
        <span><strong>{scenario.name}</strong><small>Saved scenario · Last edited {relativeTime(scenario.savedAt)}</small></span>
      </div>
      <div className="sim-detail-row projected"><small>Projected left</small><b>{formatCents(projected)}</b></div>
      <div className="sim-detail-row"><small>Category changes</small><b>{changed.length} limit{changed.length === 1 ? '' : 's'} updated</b></div>
    </div>

    <h2 className="sim-comparison-heading">What will change</h2>
    {changed.length === 0 ? <p className="sim-caption">No category limits differ from your current budget.</p> :
      changed.map(category => {
        const definition = CATEGORIES.find(item => item.key === category.key)!;
        const deltaCents = currentLimits[category.key] - scenario.limits[category.key];
        return <div className="sim-change-row" key={category.key}>
          <span className="sim-change-icon" aria-hidden="true">{definition.icon}</span>
          <span className="sim-change-copy"><strong>{definition.label}</strong>
            <small>Current {formatCents(currentLimits[category.key])} → Scenario {formatCents(scenario.limits[category.key])}</small></span>
          <b className={`sim-change-delta ${deltaCents >= 0 ? 'savings' : 'increase'}`}>{deltaCents >= 0 ? '-' : '+'}{formatCents(Math.abs(deltaCents))}</b>
        </div>;
      })}

    <h2 className="sim-next-heading">What happens next</h2>
    <div className="sim-next-card">Applying updates your active budget. Saving alone keeps this scenario for later without changing your current limits.</div>

    <footer className="sim-footer">
      <button className="primary-button" type="button" onClick={onApply}>Apply to active budget</button>
      <button className="sim-secondary-button" type="button" onClick={onCancel}>Cancel / Keep editing</button>
      <small>You can still edit this scenario later without affecting your active budget.</small>
    </footer>
  </main>;
}
