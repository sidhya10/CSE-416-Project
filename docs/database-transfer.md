# Database transfer and refresh behavior

The client shares in-memory GET results for 15 seconds and deduplicates simultaneous requests for the same URL. Writes (including login/logout) invalidate cached reads before and after the request; failed reads are never cached. Old in-flight reads cannot repopulate the cache after an invalidation. Nothing is stored in localStorage.

Automatic refresh runs once per minute on visible screens and pauses when the browser document is hidden. The Groups timer also pauses when another app tab is selected. Group-list refreshes no longer fetch every group's expenses: expense details load only for the selected group.

`GET /api/groups/:groupId/expenses` accepts:

- `scope=all` (default): a page of expenses, newest first.
- `scope=open`: all expenses with an unpaid non-payer share, including pending confirmation. This is intentionally not truncated, so current-period totals remain complete.
- `scope=history`: expenses whose non-payer shares are all confirmed or zero.
- `limit`: 1–100, default 30, for all/history.
- `cursor`: the last expense ID from the previous page; responses include `nextCursor` or null. Membership checks run before reading a cursor or expense.

The group UI loads all open obligations plus the first history page. Load older expenses fetches another page. A fresh group refresh reloads the first history page; history remains stored in the database. The authoritative settlement API continues to validate the complete ledger, independently of loaded history.

Group lists use narrow user and ledger projections. Uploaded group/profile images are fetched through authenticated photo routes with private browser caching, cookie variation, and ETags instead of embedding base64 photos repeatedly in group metadata. Group photo access requires membership. Profile photos remain available to signed-in users, as in existing friend discovery. Changing a group without uploading a replacement photo preserves its stored image.

`GET /api/settlement-notices/unread-count` returns only `{ unread }`, using the same recipient, deletion, and membership rules as the notification list. The navigation badge uses this endpoint. Group-budget balances and pending-payment totals are aggregated in PostgreSQL rather than downloading full expense/payment histories for those calculations.

These changes require no schema migration and do not alter which expenses count toward personal budgets or when a payment becomes confirmed. Backend integration tests cover financial totals and authorization; transfer regression tests cover bounded history, private photo delivery, and unread counts. Client regression tests cover cache expiry, mutation/logout invalidation, and hidden Groups refreshes.

Production byte reduction has not been measured while Neon is quota-blocked. Local tests can verify fewer requests and smaller payloads; they cannot establish a percentage reduction for production traffic.
