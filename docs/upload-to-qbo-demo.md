# Upload → QuickBooks: feature summary & demo dry-run

Living summary of the end-to-end document-to-QuickBooks flow currently shipping
in Sling, plus the exact steps to run a sandbox demo. Update this file as the
flow evolves.

## What the flow does

A bookkeeper drops a document anywhere in the app. Sling classifies it,
shows the candidate QuickBooks entities, lets the bookkeeper review and edit
the proposed field mapping, posts it to QuickBooks Online, attaches the source
file to the created entity, and links back to the entity in QBO.

## Supported QuickBooks entities

End-to-end (classify → translate → review → resolve refs → create → attach):

| Entity         | QBO endpoint   | Typical source            |
| -------------- | -------------- | ------------------------- |
| `Bill`         | `/v3/.../bill` | Vendor invoice / receipt  |
| `Invoice`      | `/v3/.../invoice` | Customer invoice       |
| `SalesReceipt` | `/v3/.../salesreceipt` | POS / cash sale    |
| `Customer`     | `/v3/.../customer` | New customer card      |
| `Vendor`       | `/v3/.../vendor` | New vendor card / W-9    |

The classifier still surfaces other entity kinds (JournalEntry, Deposit,
BillPayment, CreditMemo, RefundReceipt, Payment, Estimate, PurchaseOrder,
VendorCredit) when the document matches; those land in the database as
`recorded_no_post` until their translators ship.

## Feature highlights

### 1. Global drag-and-drop
- Window-level drop listeners mounted in the `(app)` segment layout via
  `DropZoneProvider`.
- Active only when the URL has a client in scope (`/clients/[clientId]/...`).
- Supported MIME types: PDF, PNG/JPG/HEIC/WebP, CSV, XLS, XLSX. Max 25 MB.
- Visual overlay during drag; Sheet-based wizard for the rest of the flow.

### 2. Claude-powered classifier
- Model: `claude-sonnet-4-6` via `@ai-sdk/anthropic`, temperature 0.1.
- Returns up to 3 ranked candidate entity kinds per document.
- Each candidate includes a confidence score, a one-line reasoning string,
  and an `extractedFields` block (vendor, customer, dates, lines, amounts).
- Spreadsheet rows are parsed and summarized server-side before classification.

### 3. Translators
- Pure-function mappers from the classifier's loose `ExtractedFields` to the
  strict QuickBooks v3 draft shapes.
- Throw `TranslatorInputError` with a `missing[]` list when a required field
  can't be synthesized — those uploads land as `drafted_pending_review`.
- One translator per supported entity (Bill, Invoice, SalesReceipt, Customer,
  Vendor, Estimate); Estimate has no creator yet so it stays unposted.

### 4. Review & edit step
- New "Review the mapping" stage in the wizard between candidate selection
  and posting.
- Per-kind controlled form:
  - **Bill** — VendorRef, dates, doc#, memo, total, line editor (amount,
    description, add/remove rows). Each line's expense **account** is a
    required dropdown populated live from the client's QuickBooks chart of
    accounts (`Classification = 'Expense'`); the selected account's QBO id is
    posted as `AccountRef.value`. QBO rejects any Bill line without one
    (fault 2020), so "Post to QuickBooks" stays disabled until every line has
    an account.
  - **Invoice / SalesReceipt** — CustomerRef, dates, doc#, memo, line editor
    (amount, qty, description).
  - **Customer / Vendor** — display + company name, email, phone, billing
    address.
- Validation reuses the server's Zod draft schemas so the post payload is
  guaranteed to parse server-side.

### 5. Reference resolution
- After review, Sling searches QuickBooks for matching `CustomerRef` /
  `VendorRef` names.
- Single confident match → applied automatically.
- Ambiguous or missing → "Match to QuickBooks" prompt: pick an existing
  record, or create a new one inline.

### 6. Direct Intuit v3 writes
- All entity creates happen in-process via `makeIntuitClient` against the
  Intuit v3 API. No MCP child process.
- Per-client encrypted refresh tokens (`AES-256-GCM`) auto-refresh on each
  call. Sandbox vs production is keyed off the `clients.environment` column.
- After the entity create, Sling uploads the source file as an `Attachable`
  bound to the new entity. If the attach step fails, the entity is still
  committed; the upload row records a warning.

### 7. Confirmation surface
- "Filed" panel inside the wizard shows the created entity id, attachable id,
  any warning, and a deep link into QBO (sandbox or production host as
  appropriate).
- Toast notification fires on success with the same "View in QuickBooks"
  action.

### 8. Audit trail (lightweight)
- Every upload writes a `documentUploads` row capturing: filename, MIME,
  status, chosen entity kind, classification JSON, created entity id,
  attachable id, posted-at, last error.
- The `uploads.listForClient` tRPC query exposes the audit trail per client;
  the dev smoke page uses it as a live "recent writes" log.

### 9. Dev smoke surface
- Page: `/clients/[clientId]/dev-smoke`.
- One-click synthetic vendor-bill PDF fixture (rendered on the fly by
  `@react-pdf/renderer`).
- Manual file picker for arbitrary docs.
- Sandbox/Production environment badge — fail-loud signal before posting to
  prod by accident.
- Client switcher to flip between sandbox clients in the same org.
- "Recent writes" log with status, entity id, attachable id, and a working
  QBO deep link per row.

## Demo dry-run (sandbox)

**Prerequisites**
- A signed-in user with an active organization.
- At least one client in that org with `environment = "sandbox"` and a
  connected QuickBooks Online OAuth refresh token (use `clients.createStub`
  or the OAuth callback flow).
- `ANTHROPIC_API_KEY` set in `sling/.env.local`.

**1. Start the app**
```sh
cd sling
bun dev
```
Navigate to `http://localhost:3000`.

**2. Open the smoke page**
Go to `/clients/<sandbox-client-id>/dev-smoke`. Confirm the badge in the
header reads `sandbox`. If the org has multiple sandbox clients, the
"Switch client" row lets you flip between them.

**3. Trigger the synthetic Bill demo**
Click **"Drop synthetic vendor bill"**. Sling will:
1. Render a synthetic vendor-invoice PDF from
   `scripts/fixtures/synthetic-pdfs.ts`.
2. Feed it into the global dropzone as if you had dropped it manually.
3. Show the **Classifying…** state in the Sheet.
4. Surface the top-3 candidates. `Bill` should be first with high confidence.

**4. Pick the entity**
Click the `Bill` card. Sling translates the extracted fields into a
`BillDraft` and routes to **"Review the mapping"**.

**5. Verify and edit the mapping**
Confirm the prefilled fields look right: `VendorRef`, `TxnDate`, `DueDate`,
`DocNumber`, total, and at least one expense line. Edit something visibly
(e.g., bump the amount by $0.01 or change the memo) so we have a clean way
to prove the edit step is wired through.

Pick an expense **Account** for each line from the dropdown — it's loaded
live from the sandbox chart of accounts (e.g., `Office Supplies`). This is
required: QBO rejects any Bill line without an `AccountRef`, so the
"Post to QuickBooks" button won't submit until every line has one.

**6. Post to QuickBooks**
Click **"Post to QuickBooks"**.

- If the synthetic vendor doesn't already exist in the sandbox, Sling will
  pause on **"Match to QuickBooks"** with prompts. Click
  **"Create new \"Acme Supply Co.\""** to mint a new vendor in the same
  transaction.
- Otherwise the post proceeds directly.

**7. Confirm the write landed**
The wizard switches to **"Filed"**:
- Entity id (the newly-created Bill's QBO id).
- Attachable id (the source PDF, attached to the Bill).
- "View in QuickBooks" — opens the sandbox URL
  `https://app.sandbox.qbo.intuit.com/app/bill?txnId=<id>` in a new tab.

Open the QBO link. Verify in the sandbox UI that the bill shows the **edited**
amount/memo from step 5 — that's the proof the review step modified the
payload before posting.

**8. Confirm the audit trail**
Close the wizard. The **"Recent writes"** section on the smoke page now lists
the new row with status `created`, the entity id, attachable id, and a
direct QBO link.

**9. Optional: repeat with an Invoice**
Click **"Choose a file…"** and pick any customer-invoice PDF or image to
exercise the Sales side. The same wizard flow runs; the review step renders
the SalesReceipt/Invoice form variant (CustomerRef + sales-item lines).

## Verification (engineering)

Use these to gate a release of this flow:

```sh
cd sling
bun biome check .                                       # zero errors
bun run test                                            # 75+ passing
bun run test src/server/qbo/intuit-client.integration.test.ts   # sandbox roundtrip
```

The integration test exercises a real Intuit v3 round trip; it requires a
valid sandbox refresh token in `.env.local` and is skipped otherwise.

## Known limitations

- Banking-scope entities (`Deposit`, `BillPayment`, `Payment`,
  `JournalEntry`, `CreditMemo`, `RefundReceipt`, `Estimate`, `PurchaseOrder`,
  `VendorCredit`) classify but don't post yet — tracked in issue #12.
- Bill expense accounts are chosen from a chart-of-accounts dropdown
  (`qbo.listExpenseAccounts`) and posted by id. Auto-suggesting the most
  likely account from the document is not done yet — the user picks manually.
- No per-organization audit-log UI; the smoke page is the only surface that
  renders `uploads.listForClient`. Issue #28 covers the full audit log.
- The dev smoke page lives under `(app)/clients/[clientId]/dev-smoke` — it
  bypasses the role check beyond the standard org-membership gate. Keep it
  internal until the audit log lands.

## Key files

| Concern              | Path                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| Drop zone provider   | `src/components/uploads/dropzone-provider.tsx`                         |
| Wizard UI            | `src/components/uploads/upload-wizard.tsx`                             |
| Review form          | `src/components/uploads/review-fields.tsx`                             |
| Classifier           | `src/server/uploads/classify.ts`                                       |
| Translators          | `src/server/uploads/translators/`                                      |
| Ref resolution       | `src/server/uploads/resolve-refs.ts`                                   |
| Commit pipeline      | `src/server/uploads/commit.ts`                                         |
| Intuit v3 client     | `src/server/qbo/intuit-client.ts` (`describeIntuitFault` surfaces faults) |
| Expense accounts     | `src/server/qbo/accounts.ts` + `qbo.listExpenseAccounts`               |
| Entity creates       | `src/server/qbo/{bill,invoice,sales-receipt,customer,vendor}.create.ts`|
| OAuth + token store  | `src/server/qbo/oauth.ts`, `src/server/qbo/tokens.ts`                  |
| tRPC router          | `src/server/trpc/routers/uploads.ts`                                   |
| Smoke page           | `src/app/(app)/clients/[clientId]/dev-smoke/page.tsx`                  |
| Fixture endpoint     | `src/app/api/dev/fixtures/vendor-bill/route.ts`                        |
