import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { budgetsApi, type ApiPersonalBudget } from '../../api/budgets.api';
import { ApiError } from '../../api/client';
import ApplyScenario from './ApplyScenario';
import CompareScenarios from './CompareScenarios';
import SavedScenarios from './SavedScenarios';
import ScenarioEditor from './ScenarioEditor';
import {
  MAX_COMPARE_SELECTION, MAX_SAVED_SCENARIOS, SLIDER_STEP_CENTS, changedCategories, limitFor, nextDraftName, toSimModel,
  type CategoryKey, type CategoryLimits, type Scenario,
} from './simulator';
import './simulator.css';

type Screen = 'editor' | 'saved' | 'compare' | 'apply';

const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Unable to reach the server. Try again.';

// `active` is false while the simulator is hidden; opening it reloads the latest limits and spending.
export default function WhatIfSimulator({ onBack, onRootChange, active = true }: { onBack?: () => void; onRootChange?: (atRoot: boolean) => void; active?: boolean }) {
  const [data, setData] = useState<ApiPersonalBudget | null>(null);
  const [loadError, setLoadError] = useState('');
  // Only the most recent request may update state, so a slow load cannot overwrite a newer apply.
  const latest = useRef(0);
  // Edits are kept as overrides of the live limits, so they stay valid when fresh limits arrive.
  const [overrides, setOverrides] = useState<CategoryLimits>({});
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [applyTarget, setApplyTarget] = useState<Scenario | null>(null);
  const [applying, setApplying] = useState(false);
  const [screen, setScreen] = useState<Screen>('editor');
  const [stack, setStack] = useState<Screen[]>([]);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const id = ++latest.current;
    try { const next = await budgetsApi.personal(); if (id === latest.current) { setData(next); setLoadError(''); } }
    catch (error) { if (id === latest.current) setLoadError(errorMessage(error)); }
  }, []);
  // Saved scenarios live on the account; a newer save or delete invalidates a slower list request.
  const latestScenarios = useRef(0);
  const loadScenarios = useCallback(async () => {
    const id = ++latestScenarios.current;
    try { const { scenarios: saved } = await budgetsApi.scenarios(); if (id === latestScenarios.current) setScenarios(saved); }
    catch (error) { if (id === latestScenarios.current) setNotice(`Couldn't load your saved scenarios: ${errorMessage(error)}`); }
  }, []);
  useEffect(() => { if (active) { void load(); void loadScenarios(); } }, [active, load, loadScenarios]);

  const model = useMemo(() => data ? toSimModel(data) : null, [data]);

  const enter = (next: Screen) => { setScreen(next); onRootChange?.(next === 'editor'); };
  const go = (next: Screen) => { setStack(previous => [...previous, screen]); enter(next); setNotice(''); };
  const back = () => {
    if (!stack.length) { onBack?.(); return; }
    const previous = stack[stack.length - 1]!;
    setStack(rest => rest.slice(0, -1));
    enter(previous);
    setNotice('');
  };

  if (!data || !model) return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>What-if simulator</h1><p>See how choices change your month</p></div></header>
    {loadError
      ? <><p className="form-notice" role="alert">{loadError}</p><button type="button" className="sim-secondary-button" onClick={() => void load()}>Try again</button></>
      : <p className="sim-caption" role="status">Loading your budget…</p>}
  </main>;

  if (model.categories.length === 0) return <main className="budgets-workspace">
    <header className="sim-header"><button type="button" aria-label="Back" onClick={onBack}>‹</button>
      <div><h1>What-if simulator</h1><p>See how choices change your month</p></div></header>
    <section className="sim-category"><strong>No limits to simulate yet</strong>
      <p className="sim-caption">Set a monthly limit for at least one category in the Budget tab, then come back to try changes before committing to them.</p></section>
  </main>;

  // The effective limits for the scenario being edited: the live limit unless the user moved a slider.
  const draftLimits: CategoryLimits = Object.fromEntries(model.categories.map(category => [category.key, Math.min(category.limitCents, limitFor(category, overrides))]));
  const sliderMin = (limitCents: number) => Math.min(SLIDER_STEP_CENTS, limitCents);

  const changeCategory = (key: CategoryKey, cents: number) => setOverrides(previous => ({ ...previous, [key]: cents }));
  const resetCategory = (key: CategoryKey) => setOverrides(previous => { const { [key]: _removed, ...rest } = previous; void _removed; return rest; });

  const loadScenario = (scenario: Scenario) => {
    setOverrides(Object.fromEntries(changedCategories(model, scenario.limits).map(category => [category.key, Math.max(sliderMin(category.limitCents), limitFor(category, scenario.limits))])));
    setEditingScenarioId(scenario.id); go('editor');
  };
  const createNewScenario = () => { setOverrides({}); setEditingScenarioId(null); go('editor'); };

  const saveScenario = async (name: string) => {
    const existing = editingScenarioId ? scenarios.find(scenario => scenario.id === editingScenarioId) : undefined;
    if (!existing && scenarios.length >= MAX_SAVED_SCENARIOS) { setNotice(`You already have ${MAX_SAVED_SCENARIOS} saved scenarios. Delete one before saving another.`); return; }
    setNotice('');
    try {
      latestScenarios.current++;
      if (existing) {
        const { scenario } = await budgetsApi.updateScenario(existing.id, name, draftLimits);
        setScenarios(previous => [scenario, ...previous.filter(item => item.id !== scenario.id)]);
        setNotice(`Updated "${name}".`);
        return;
      }
      const { scenario } = await budgetsApi.createScenario(name, draftLimits);
      setScenarios(previous => [scenario, ...previous]);
      setEditingScenarioId(scenario.id);
      setNotice(`Saved "${name}" to your account.`);
    } catch (error) { setNotice(errorMessage(error)); }
  };

  const deleteScenario = async (scenario: Scenario) => {
    try {
      latestScenarios.current++;
      await budgetsApi.deleteScenario(scenario.id);
    } catch (error) {
      // A scenario already removed elsewhere (404) is gone either way.
      if (!(error instanceof ApiError && error.status === 404)) { setNotice(errorMessage(error)); return; }
    }
    setScenarios(previous => previous.filter(item => item.id !== scenario.id));
    setSelectedIds(previous => previous.filter(id => id !== scenario.id));
    if (editingScenarioId === scenario.id) setEditingScenarioId(null);
    setNotice(`Deleted "${scenario.name}".`);
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) { setSelectedIds(selectedIds.filter(value => value !== id)); return; }
    if (selectedIds.length >= MAX_COMPARE_SELECTION) { setNotice(`You can compare up to ${MAX_COMPARE_SELECTION} scenarios at a time. Remove one first.`); return; }
    setSelectedIds([...selectedIds, id]);
  };

  const openApplyForScenario = (scenario: Scenario) => { setApplyTarget(scenario); go('apply'); };
  const openApplyForDraft = () => {
    const editing = editingScenarioId ? scenarios.find(scenario => scenario.id === editingScenarioId) : undefined;
    openApplyForScenario({ id: editing?.id ?? 'draft', name: editing?.name ?? 'Current changes', limits: draftLimits, savedAt: Date.now() });
  };

  const confirmApply = async () => {
    if (!applyTarget || applying) return;
    // A limit of 0 would mean "no limit" to the budgets API, so only real, changed limits are written.
    const changes = Object.fromEntries(changedCategories(model, applyTarget.limits).map(category => [category.key, limitFor(category, applyTarget.limits)]).filter(([, cents]) => (cents as number) > 0));
    if (Object.keys(changes).length === 0) { setNotice('No category limits differ from your current budget.'); return; }
    setApplying(true); setNotice('');
    try {
      const saved = await budgetsApi.saveLimits(changes);
      latest.current++;
      setData(saved); setLoadError('');
      setOverrides({});
      setEditingScenarioId(applyTarget.id === 'draft' ? null : applyTarget.id);
      setNotice(`Applied "${applyTarget.name}" to your budget.`);
      setApplyTarget(null);
      setStack([]);
      enter('editor');
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setApplying(false); }
  };

  const selectedScenarios = scenarios.filter(scenario => selectedIds.includes(scenario.id));

  if (screen === 'saved') return <SavedScenarios model={model} scenarios={scenarios} selectedIds={selectedIds}
    notice={notice} onToggleSelect={toggleSelect} onOpenScenario={loadScenario} onDeleteScenario={deleteScenario} onCompare={() => go('compare')} onCreateNew={createNewScenario} onBack={back} />;

  if (screen === 'compare') return <CompareScenarios model={model} scenarios={selectedScenarios}
    onBack={back} onEdit={loadScenario} onApply={openApplyForScenario} />;

  if (screen === 'apply' && applyTarget) return <ApplyScenario model={model} scenario={applyTarget} notice={notice} busy={applying}
    onBack={back} onCancel={() => loadScenario(applyTarget)} onApply={() => void confirmApply()} />;

  return <ScenarioEditor model={model} draftLimits={draftLimits} scenarioCount={scenarios.length}
    defaultSaveName={editingScenarioId ? scenarios.find(scenario => scenario.id === editingScenarioId)?.name ?? nextDraftName(scenarios) : nextDraftName(scenarios)}
    notice={notice} loadError={loadError} onChangeCategory={changeCategory} onResetCategory={resetCategory} onOpenSaved={() => go('saved')} onBack={back}
    onSave={saveScenario} onApply={openApplyForDraft} />;
}
