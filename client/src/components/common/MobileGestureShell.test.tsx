import { useState } from 'react';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MobileGestureShell from './MobileGestureShell';

const touch = (clientX: number, clientY: number) => ({ clientX, clientY });

describe('mobile gestures', () => {
  it('refreshes after a downward pull from the top', async () => {
    const refresh = vi.fn();
    render(<MobileGestureShell onRefresh={refresh}><main>Current screen</main></MobileGestureShell>);
    const root = screen.getByText('Current screen').parentElement!;
    fireEvent.touchStart(root, { touches: [touch(100, 20)] });
    fireEvent.touchMove(root, { touches: [touch(102, 160)] });
    fireEvent.touchEnd(root, { changedTouches: [touch(102, 160)] });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it('uses the visible back action after a right edge swipe', () => {
    const visibleBack = vi.fn();
    const hiddenBack = vi.fn();
    render(<MobileGestureShell onRefresh={() => {}}>
      <section hidden><button type="button" aria-label="Back to hidden screen" onClick={hiddenBack}>‹</button></section>
      <main><button type="button" aria-label="Back to Budget" onClick={visibleBack}>‹</button></main>
    </MobileGestureShell>);
    const root = screen.getByRole('button', { name: 'Back to Budget' }).closest('.device')!;
    fireEvent.touchStart(root, { touches: [touch(18, 100)] });
    fireEvent.touchEnd(root, { changedTouches: [touch(120, 106)] });
    expect(visibleBack).toHaveBeenCalledOnce();
    expect(hiddenBack).not.toHaveBeenCalled();
  });

  it('ignores horizontal swipes that do not begin at the left edge', () => {
    const back = vi.fn();
    render(<MobileGestureShell onRefresh={() => {}}><button type="button" aria-label="Back" onClick={back}>‹</button></MobileGestureShell>);
    const root = screen.getByRole('button', { name: 'Back' }).closest('.device')!;
    fireEvent.touchStart(root, { touches: [touch(90, 100)] });
    fireEvent.touchEnd(root, { changedTouches: [touch(190, 104)] });
    expect(back).not.toHaveBeenCalled();
  });
});

it('keeps the spinner visible while refreshing and dismisses it on completion', async () => {
  let finish!: () => void;
  const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<MobileGestureShell onRefresh={refresh}><main>Refresh content</main></MobileGestureShell>);
  const root = screen.getByText('Refresh content').parentElement!;
  fireEvent.touchStart(root, { touches: [touch(100, 20)] });
  fireEvent.touchMove(root, { touches: [touch(100, 160)] });
  fireEvent.touchEnd(root, { changedTouches: [touch(100, 160)] });
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(root.querySelector('.pull-refresh')).toHaveClass('visible', 'refreshing');
  expect(screen.getByRole('status')).toHaveTextContent('Refreshing');
  await act(async () => { finish(); });
  expect(root.querySelector('.pull-refresh')).not.toHaveClass('visible');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('does not add an idle status alongside the current screen notification', () => {
  render(<MobileGestureShell><p role="status">Expense saved.</p></MobileGestureShell>);
  expect(screen.getByRole('status')).toHaveTextContent('Expense saved.');
});


it('refreshes data in place without resetting the selected page or draft', async () => {
  let complete!: (value: string) => void;
  const load = vi.fn(() => new Promise<string>(resolve => { complete = resolve; }));
  const hiddenLoad = vi.fn();
  function Page() {
    const [page, setPage] = useState('Home');
    const [data, setData] = useState('Old balance');
    const [draft, setDraft] = useState('');
    usePullRefresh(async () => setData(await load()), page === 'Group details');
    usePullRefresh(hiddenLoad, page === 'Home');
    return <MobileGestureShell><main>
      <button onClick={() => setPage('Group details')}>Open group</button>
      <h1>{page}</h1><p>{data}</p>
      <input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} />
    </main></MobileGestureShell>;
  }
  render(<Page />);
  fireEvent.click(screen.getByText('Open group'));
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Keep this' } });
  const root = screen.getByRole('heading').closest('.device')!;
  fireEvent.touchStart(root, { touches: [touch(100, 20)] });
  fireEvent.touchMove(root, { touches: [touch(100, 160)] });
  fireEvent.touchEnd(root, { changedTouches: [touch(100, 160)] });
  await waitFor(() => expect(load).toHaveBeenCalledOnce());
  expect(screen.getByRole('status')).toHaveTextContent('Refreshing');
  await act(async () => complete('Updated balance'));
  expect(screen.getByRole('heading')).toHaveTextContent('Group details');
  expect(screen.getByText('Updated balance')).toBeInTheDocument();
  expect(screen.getByLabelText('Draft')).toHaveValue('Keep this');
  expect(hiddenLoad).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
