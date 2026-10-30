import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GroupsWorkspace, { type FriendFixture, type GroupFixture } from './GroupsWorkspace';
import type { AppUser } from '../../api/types';
const owner: AppUser = { id: 'owner', name: 'Owner', username: 'owner', email: 'owner@example.com', phone: null, birthday: '', bio: '', photoUrl: null, hasGoogle: false, hasPassword: true, createdAt: '2026-01-01' };
const friend: FriendFixture = { ...owner, id: 'alex', name: 'Alex', username: 'alex', email: 'alex@example.com', isFriend: true, handle: '@alex', color: 'green' };
const archive: GroupFixture = { id: 'old', name: 'Old trip', description: 'Last year', members: ['alex'], type: 'Trip', color: 'gold', photo: null, startDate: '', endDate: '', balance: 0, privateBudget: null, plans: [], bills: [], archived: true };
const renderGroups = () => render(<GroupsWorkspace currentUser={owner} onRootChange={() => {}} initialFriendsData={[friend]} initialGroupsData={[archive]} />);

describe('group creation and archive navigation', () => {
  it('requires a friend and cancels member editing back to the preserved customization draft', () => {
    renderGroups();
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    const next = () => screen.getByRole('button', { name: /next: customize group/i });
    expect(next()).toBeDisabled();
    fireEvent.click(next());
    expect(screen.queryByRole('heading', { name: 'Customize group' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alex.*@alex/ }));
    expect(next()).toBeEnabled();
    fireEvent.click(next());
    fireEvent.change(screen.getByLabelText('GROUP NAME'), { target: { value: 'Our apartment' } });
    fireEvent.change(screen.getByLabelText('DESCRIPTION · OPTIONAL'), { target: { value: 'Shared costs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit members' }));
    fireEvent.click(screen.getByRole('button', { name: /Alex.*@alex/ }));
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Customize group' })).toBeInTheDocument();
    expect(screen.getByLabelText('GROUP NAME')).toHaveValue('Our apartment');
    expect(screen.getByLabelText('DESCRIPTION · OPTIONAL')).toHaveValue('Shared costs');
    expect(screen.getByText('MEMBERS · 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByRole('heading', { name: 'Our apartment' })).toBeInTheDocument();
  });
  it('shows all archives even with active filters and only a back button and archived list', () => {
    renderGroups();
    fireEvent.change(screen.getByLabelText('Search groups'), { target: { value: 'does not match' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter and sort groups' }));
    fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'owe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Archived groups (1)' }));
    expect(screen.getByRole('heading', { name: 'Archived groups' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Old trip' })).toBeInTheDocument();
    expect(document.querySelector('.archive-workspace')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /find friends|new group/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Balance overview')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter and sort groups' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByLabelText('Payment status')).toHaveValue('owe');
  });
});

it('exits creation with Back then Cancel even after editing members', () => {
  renderGroups();
  fireEvent.click(screen.getByRole('button', { name: /new group/i }));
  fireEvent.click(screen.getByRole('button', { name: /Alex.*@alex/ }));
  fireEvent.click(screen.getByRole('button', { name: /next: customize group/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit members' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /new group/i }));
  expect(screen.getByRole('button', { name: /next: customize group/i })).toBeDisabled();
});
it('shows every selected member in customization, beyond four', () => {
  const people = Array.from({ length: 7 }, (_, i) => ({ ...friend, id: `friend-${i}`, name: `Person ${i}`, username: `person${i}`, handle: `@person${i}` }));
  render(<GroupsWorkspace currentUser={owner} onRootChange={() => {}} initialFriendsData={people} initialGroupsData={[]} />);
  fireEvent.click(screen.getByRole('button', { name: /new group/i }));
  people.forEach(person => fireEvent.click(screen.getByRole('button', { name: new RegExp(`${person.name}.*${person.handle}`) })));
  fireEvent.click(screen.getByRole('button', { name: /next: customize group/i }));
  expect(screen.getByText('MEMBERS · 8')).toBeInTheDocument();
  people.forEach(person => expect(screen.getByText(person.name)).toBeInTheDocument());
  expect(document.querySelectorAll('.member-preview-card > div')).toHaveLength(8);
});
