import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
