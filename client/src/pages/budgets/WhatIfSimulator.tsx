import { useState } from 'react';
import ApplyScenario from './ApplyScenario';
import CompareScenarios from './CompareScenarios';
import SavedScenarios from './SavedScenarios';
import ScenarioEditor from './ScenarioEditor';
import {
  CURRENT_LIMITS, CURRENT_PACE_PROJECTED_LEFT_CENTS, MAX_COMPARE_SELECTION, MAX_SAVED_SCENARIOS,
  initialScenarios, initialSelectedIds, nextDraftName, projectedLeftCents,
  type CategoryKey, type CategoryLimits, type Scenario,
} from './simulator';

type Screen = 'editor' | 'saved' | 'compare' | 'apply';

export default function WhatIfSimulator({ onBack, onRootChange }: { onBack?: () => void; onRootChange?: (atRoot: boolean) => void }) {
  const [currentLimits, setCurrentLimits] = useState<CategoryLimits>(CURRENT_LIMITS);
  const [basePaceCents, setBasePaceCents] = useState(CURRENT_PACE_PROJECTED_LEFT_CENTS);
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(initialScenarios[0]!.id);
  const [draftLimits, setDraftLimits] = useState<CategoryLimits>(initialScenarios[0]!.limits);
  const [applyTarget, setApplyTarget] = useState<Scenario | null>(null);
  const [screen, setScreen] = useState<Screen>('editor');
  const [stack, setStack] = useState<Screen[]>([]);
  const [notice, setNotice] = useState('');

  const enter = (next: Screen) => { setScreen(next); onRootChange?.(next === 'editor'); };
  const go = (next: Screen) => { setStack(previous => [...previous, screen]); enter(next); setNotice(''); };
  const back = () => {
    if (!stack.length) { onBack?.(); return; }
    const previous = stack[stack.length - 1]!;
    setStack(rest => rest.slice(0, -1));
    enter(previous);
    setNotice('');
  };

  const changeCategory = (key: CategoryKey, cents: number) => setDraftLimits(previous => ({ ...previous, [key]: cents }));
  const resetCategory = (key: CategoryKey) => setDraftLimits(previous => ({ ...previous, [key]: currentLimits[key] }));

  const loadScenario = (scenario: Scenario) => { setDraftLimits(scenario.limits); setEditingScenarioId(scenario.id); go('editor'); };
  const createNewScenario = () => { setDraftLimits(currentLimits); setEditingScenarioId(null); go('editor'); };

  const saveScenario = (name: string) => {
    const existingIndex = editingScenarioId ? scenarios.findIndex(scenario => scenario.id === editingScenarioId) : -1;
    if (existingIndex >= 0) {
      setScenarios(previous => previous.map((scenario, index) => index === existingIndex ? { ...scenario, name, limits: draftLimits, savedAt: Date.now() } : scenario));
      setNotice(`Updated "${name}".`);
      return;
    }
    if (scenarios.length >= MAX_SAVED_SCENARIOS) { setNotice(`You already have ${MAX_SAVED_SCENARIOS} saved scenarios. Delete one before saving another.`); return; }
    const scenario: Scenario = { id: `scenario-${Date.now()}`, name, limits: draftLimits, savedAt: Date.now() };
    setScenarios(previous => [scenario, ...previous]);
    setEditingScenarioId(scenario.id);
    setNotice(`Saved "${name}".`);
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

  const confirmApply = () => {
    if (!applyTarget) return;
    const applied = projectedLeftCents(currentLimits, applyTarget.limits, basePaceCents);
    setBasePaceCents(applied);
    setCurrentLimits(applyTarget.limits);
    setDraftLimits(applyTarget.limits);
    setEditingScenarioId(applyTarget.id === 'draft' ? null : applyTarget.id);
    setNotice(`Applied "${applyTarget.name}" to your active budget for this preview session. Budgets are not connected to a backend yet — reloading will reset this.`);
    setApplyTarget(null);
    setStack([]);
    enter('editor');
  };

  const selectedScenarios = scenarios.filter(scenario => selectedIds.includes(scenario.id));

  if (screen === 'saved') return <SavedScenarios scenarios={scenarios} selectedIds={selectedIds} currentLimits={currentLimits} basePaceCents={basePaceCents}
    notice={notice} onToggleSelect={toggleSelect} onOpenScenario={loadScenario} onCompare={() => go('compare')} onCreateNew={createNewScenario} onBack={back} />;

  if (screen === 'compare') return <CompareScenarios scenarios={selectedScenarios} currentLimits={currentLimits} basePaceCents={basePaceCents}
    onBack={back} onEdit={loadScenario} onApply={openApplyForScenario} />;

  if (screen === 'apply' && applyTarget) return <ApplyScenario scenario={applyTarget} currentLimits={currentLimits} basePaceCents={basePaceCents}
    onBack={back} onCancel={() => loadScenario(applyTarget)} onApply={confirmApply} />;

  return <ScenarioEditor currentLimits={currentLimits} draftLimits={draftLimits} basePaceCents={basePaceCents} scenarioCount={scenarios.length}
    defaultSaveName={editingScenarioId ? scenarios.find(scenario => scenario.id === editingScenarioId)?.name ?? nextDraftName(scenarios) : nextDraftName(scenarios)}
    notice={notice} onChangeCategory={changeCategory} onResetCategory={resetCategory} onOpenSaved={() => go('saved')} onBack={back}
    onSave={saveScenario} onApply={openApplyForDraft} />;
}
