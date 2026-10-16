import { formatCents } from '../expenses/split';
import { MAX_COMPARE_SELECTION, MAX_SAVED_SCENARIOS, initials, projectedLeftCents, relativeTime, type Scenario, type SimModel } from './simulator';
import './simulator.css';

type Props = {
  model: SimModel;
  scenarios: Scenario[];
  selectedIds: string[];
  notice?: string;
  onToggleSelect: (id: string) => void;
  onOpenScenario: (scenario: Scenario) => void;
  onDeleteScenario: (scenario: Scenario) => void;
  onCompare: () => void;
  onCreateNew: () => void;
  onBack: () => void;
};

export default function SavedScenarios({
  model, scenarios, selectedIds, notice,
  onToggleSelect, onOpenScenario, onDeleteScenario, onCompare, onCreateNew, onBack,
}: Props) {
  return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back to what-if simulator" onClick={onBack}>‹</button>
      <div><h1>Saved scenarios</h1><p>Compare saved what-if scenarios and jump back into the editor when you need to update one.</p></div>
      <span className="sim-header-badge">{selectedIds.length} selected</span></header>

    <h2 className="sim-library-heading">Saved scenarios library</h2>
    <p className="sim-library-sub">You can store up to {MAX_SAVED_SCENARIOS} scenarios. {selectedIds.length} {selectedIds.length === 1 ? 'is' : 'are'} selected for comparison.</p>
    <div className="sim-library-card">
      <div className="sim-capacity-row"><strong>Library capacity</strong><span>{scenarios.length} of {MAX_SAVED_SCENARIOS} used</span></div>
      <p className="sim-capacity-sub">Scenarios are kept for this session only. Apply one to make it your real budget.</p>
      <div className="sim-capacity-dots" role="presentation">{Array.from({ length: MAX_SAVED_SCENARIOS }, (_, index) =>
        <div key={index} className={`sim-capacity-dot${index < scenarios.length ? ' filled' : ''}`} />)}</div>
    </div>

    <div className="sim-list-meta"><h2>Your scenarios</h2><small>Compare {selectedIds.length} of {MAX_COMPARE_SELECTION}</small></div>
    {notice && <p className="form-notice" role="status">{notice}</p>}
    {scenarios.length === 0 && <p className="sim-caption">No saved scenarios yet. Create one to compare options side by side.</p>}
    {scenarios.map((scenario, index) => {
      const selected = selectedIds.includes(scenario.id);
      const projected = projectedLeftCents(model, scenario.limits);
      return <div className="sim-scenario-row" key={scenario.id}>
        <button type="button" className="sim-scenario-main" onClick={() => onOpenScenario(scenario)}>
          <span className={`sim-avatar tone-${index % 4}`} aria-hidden="true">{initials(scenario.name)}</span>
          <span><strong>{scenario.name}</strong><small>Last edited {relativeTime(scenario.savedAt)}</small>
            <b>Projected left {formatCents(projected)}</b></span>
        </button>
        <button type="button" className="sim-select" aria-label={`Delete ${scenario.name}`} onClick={() => onDeleteScenario(scenario)}>🗑</button>
        <button type="button" className={`sim-select${selected ? ' selected' : ''}`} aria-pressed={selected}
          aria-label={selected ? `Remove ${scenario.name} from comparison` : `Add ${scenario.name} to comparison`}
          onClick={() => onToggleSelect(scenario.id)}>{selected ? '✓' : '›'}</button>
      </div>;
    })}

    <footer className="sim-footer">
      <button className="primary-button" type="button" disabled={selectedIds.length !== MAX_COMPARE_SELECTION} onClick={onCompare}>Compare selected</button>
      <button className="sim-secondary-button" type="button" onClick={onCreateNew}>Create new scenario</button>
      <small>Selected scenarios stay here until you delete them.</small>
    </footer>
  </main>;
}
