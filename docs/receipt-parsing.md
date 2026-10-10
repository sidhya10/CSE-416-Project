# Azure receipt parsing

## Setup

1. Create a **single-service Azure Document Intelligence** resource. Select **Free F0**; upgrading the Azure account to pay-as-you-go does not require changing this resource to Standard S0.
2. In the resource's **Keys and Endpoint** page, copy the endpoint and one key into the repository root `.env` (not the client env). Never commit or paste the key into chat:

   ```dotenv
   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://YOUR-RESOURCE.cognitiveservices.azure.com/
   AZURE_DOCUMENT_INTELLIGENCE_KEY=YOUR-KEY
   RECEIPT_MONTHLY_PAGE_LIMIT=450
   RECEIPT_DAILY_USER_LIMIT=20
   ```

   Use the actual endpoint supplied by Azure. Current endpoint validation supports public Azure `*.cognitiveservices.azure.com` resources. Keep credentials out of `VITE_` variables, which are exposed to browsers.
3. From the repository root, run:

   ```sh
   npm run prisma:generate
   npx prisma migrate deploy
   npm run dev
   ```

   The new migration adds `ReceiptScan` and `ReceiptUsage`; it does not reset users, groups, or expenses. Restart the backend after changing environment variables. Production needs the same server environment variables and migration.
4. Sign in, open a group, and choose **Add expense** (or edit an existing editable expense). Choose **Take photo** or **Upload receipt**, select HEIC/HEIF up to 12 MB or JPEG/PNG/PDF up to 4 MB, then click **Scan receipt with Azure**.
5. Review the extracted item names, quantities, prices, tax, tip, and receipt total. Click **Replace entries with scanned items** to apply. This replaces items, fees, and item assignments; the existing title (if present), payer, and expense date are preserved. Continue through the existing split/save flow to persist the expense.

Only page 1 is analyzed, including PDFs. HEIC/HEIF photos are decoded on the backend using `heic-convert`, then resized/compressed with `sharp` to JPEG within 4 MB (maximum long edge 3200 pixels). Only the main image is used. The decoder is bundled, so no system HEVC/libvips installation is required. Conversion runs in a worker with a 25-second timeout. Corrupt/unsupported photos receive a manual-export error; no Azure call is made when conversion fails. Conversion failures still reserve an app attempt conservatively. Other image formats and JPEG/PNG/PDF files over 4 MB must be converted/resized before uploading. Known non-USD receipts are rejected because expenses currently use USD; unknown currency generates a review warning. Fractional quantities may be represented as a quantity-one line total. Missing prices stay blank for manual entry. Fees/discounts are not invented to force totals to balance.

## API and cache

`POST /api/receipts/parse` requires the existing signed session cookie. JSON body: `{ "base64": "...", "mimeType": "image/jpeg" }`. Response: `{ "receipt": { "merchant": "...", "items": [{ "name": "...", "unitPriceCents": 250, "quantity": 2 }], "taxCents": 40, "tipCents": 100, "totalCents": 640, "warnings": [] }, "cached": false }`.

The server validates file size/type signatures, calls Azure's `prebuilt-receipt` REST API version `2024-11-30` with `pages=1`, polls the operation, and normalizes amounts to integer cents. No Azure credential reaches the browser.

- `ReceiptScan` stores a SHA-256 fingerprint (original file bytes + parser version, before HEIC conversion), user ID, status, and normalized result in PostgreSQL. The same user uploading the exact same bytes receives a cached result, even after restarting the app. Renaming the file does not invalidate the cache; retaking or recompressing a photo does. Different users have separate caches to avoid exposing another user's receipt data.
- The cache stores extracted data, not original images or the full OCR response. Entries currently remain until the user is deleted or an administrator removes them; there is no automatic expiration. Removing a receipt from the form only removes the local selection, not its cached scan.
- `ReceiptUsage` holds an app-wide UTC-month attempt count and a short processing lease. A PostgreSQL advisory lock makes cache checks and usage reservations atomic across servers sharing this database. Only one new scan runs at a time, with a cooldown compatible with F0; busy callers get a retry message. Cache hits bypass usage limits.
- The default limit is **450 new first-page attempts/month across all users**, plus **20 attempts/day/user**. Set the monthly limit lower to reserve more capacity, or to `0` to disable new scans while allowing cached results. Failed/uncertain submissions also consume an app attempt conservatively. No automatic POST retries occur.
- A scan has a 90-second provider timeout. Failed records block automatic resubmission of that exact file; interrupted processes can leave a PENDING record. An administrator should inspect Azure and the record before deleting that individual `ReceiptScan` to allow an intentional retry. Never reset `ReceiptUsage` as part of retry/cleanup: it protects the monthly allowance. Retrying can consume another Azure page.
- Browser cancellation/removing the selection discards late results; an already submitted Azure scan can still complete, use quota, and populate the cache.

These are **app controls, not an Azure billing guarantee**. Use one dedicated F0 resource and a shared database for every deployment using it. Azure Studio, another app/database, other users' tools, or paid Azure resources are outside these counters. Limits reset on the first request in each UTC calendar month; leave headroom for any difference from Azure's quota reporting. Keep F0 selected and review Azure Cost Management. Budget alerts do not cap spending.

## Testing without Azure charges

Automated tests mock all Azure calls; they require no Azure key. Database integration tests must use a dedicated PostgreSQL database whose name contains `test` or `integration` because they exercise/reset the test scan counter. Never point these tests at the app's real database. Set `DATABASE_URL` to that test database before running:

```sh
npx prisma migrate deploy
npm test
npm run lint
npm run typecheck
npm run build
```

New tests cover authentication, content validation, user-scoped durable cache reuse, concurrent requests, failed-call deduplication, monthly/daily limits, month reset, quantity/price normalization, safe operation polling, and add/edit review and draft preservation. Existing GitHub Actions already provisions a test database, migrates, and runs these tests through `npm test`.

For a real smoke test (uses an Azure page): upload one clear USD receipt, scan, review and apply, split/save, then reload the group. Scan the exact same file again under the same account; the UI should say **Loaded saved scan — no new Azure scan was used**. In Prisma Studio, verify one COMPLETE `ReceiptScan` and one attempt in `ReceiptUsage` (assuming no other scans). Test errors manually using `RECEIPT_MONTHLY_PAGE_LIMIT=0`, restarting the server, and choosing a different file; existing cached files should still work. Restore the limit afterward.

Receipt images/filenames are not persisted as expense attachments. Saving an expense persists the applied fields through the existing expense API; scanning alone does not create an expense or payment.

References: [Azure REST API](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20(2024-11-30)), [receipt schema](https://github.com/Azure-Samples/document-intelligence-code-samples/blob/main/schema/2024-11-30-ga/receipt.md), [pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/).
