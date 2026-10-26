import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { settlementsApi } from '../../api/settlements.api';
import NotificationsNavButton from './NotificationsNavButton';
afterEach(() => vi.restoreAllMocks());
it('opens notifications and refreshes the unread badge after reading', async () => {
  const load = vi.spyOn(settlementsApi, 'notifications').mockResolvedValue({ notices: [{ id: 'n', groupId: 'g', kind: 'REMINDER', message: 'Reminder', createdAt: '', readAt: null }] });
  const open = vi.fn();
  render(<NotificationsNavButton selected onClick={open} />);
  const button = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
  expect(button).toHaveAttribute('aria-current', 'page');
  fireEvent.click(button); expect(open).toHaveBeenCalledOnce();
  load.mockResolvedValue({ notices: [] });
  await act(async () => { window.dispatchEvent(new Event('cse416:settlements')); });
  expect(await screen.findByRole('button', { name: 'Notifications' })).toBeVisible();
  expect(screen.queryByText('1')).not.toBeInTheDocument();
});
