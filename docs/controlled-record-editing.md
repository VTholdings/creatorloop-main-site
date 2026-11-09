# Controlled record editing and safe Save

## Use the editor

1. Open an authorized record in View mode.
2. Choose Edit. Only permitted fields become available.
3. Prepare local changes. The editor marks changed fields and shows an unsaved notice. Typing, changing a selection and leaving a field do not write data.
4. Choose Save changes to review the before/after values.
5. Go back to editing, discard, or confirm the reviewed Save. Governed changes also require explicit confirmation of the separate decision evidence. Confirmation does not grant authority.
6. The server checks identity, role, current scope, permissions, record freshness and required approvals before the transaction commits. Failed saves retain the local draft.

Cancel / Discard restores the original form values without an API mutation. Leaving a pending record requires discard confirmation; closing the page triggers the browser's unsaved-change warning. Duplicate confirmation is blocked while a save is in progress. Send to QA requires saved facts; QA decisions have their own Edit → Review → Confirm and Save form.

## Field and authority boundaries

| Record | Permitted edit | Separate controls |
|---|---|---|
| Creator | Existing factual roles, within their approved record scope | Identity/relationship/system fields stay locked. Compensation, rights, Product Focus changes and protected rights evidence require exact recorded authorization. Initial selection of an approved Product Focus for an enrollment remains factual processing. |
| Assignment | Existing factual roles and their assigned records | Scheduling, compensation and rights use the existing exact-value decision reference. An Operator reference permits only approved scheduling. |
| QA | Authorized reviewers, scoped records awaiting QA | Only QA result and QA notes. QA does not authorize launch, payment or Owner Approval. |
| Campaign | Administrator; Marketing / Campaign Manager with an explicit whole-campaign grant and management-data visibility | Operational Notes only. Generated name, Campaign ID, source routing, Product Scope, budgets and approval fields are locked. Visibility alone does not grant editing. |

In the governed schema, even an Administrator must record a separate exact-value authorization before saving controlled creator/assignment fields. Omitting the client save-intent marker does not bypass this requirement. Existing Owner authorization and launch-gate authority remain intact. Unsupported changes use Request approval / Escalate, which opens the existing DECISIONS & BLOCKERS workflow without applying a business change.

## Commit and audit protections

- Reviewed edits fail closed until the existing governance migration is present. No new migration or identity/report store is introduced.
- Creator and assignment versions reject stale writes. A newer signed source import increments their edit versions; it cannot leave an old editor silently eligible to overwrite source facts.
- Campaign Notes use a revision fingerprint of the full current row and latest immutable campaign event. The transaction compares original values and history, so a source change or an intervening edit invalidates the draft.
- The existing transaction guard now also checks the current scope/record relationship and any exact-value authorization, including revocation and expiry. A failed guard rolls back business writes, audit and outbox operations.
- Committed creator/assignment edits append before/after field values. Campaign Notes append before/after Notes. Immutable role-at-action snapshots and historical attribution remain preserved; audit visibility restrictions are unchanged.

## Source synchronization

Campaign Notes queue a narrow `CAMPAIGN / NOTES_ONLY` change in the existing outbox. The bridge updates only the canonical CAMPAIGNS → Notes cell for a unique existing Campaign ID. It rejects protected payload fields, formulas, validation failures, missing/duplicate source records and changed source Notes. A retry after the same Notes were written is idempotent. Pending/failed/unacknowledged campaign edits cannot be overwritten by reimport.

The updated bound Apps Script must be included in the eventual reviewed rollout. Do not replace the current live bridge during this draft work. Signed local export/retry/acknowledgement/reimport and source-write tests are simulations, not proof that the live workbook was updated.

## Acceptance boundary

Automated coverage: permitted saves, restricted fields, out-of-scope edits, revoked permissions, scope removal and decision revocation at commit, stale versions/source changes, read-only UI, cancel/discard, review snapshots, duplicate confirms, attributed before/after audits, guarded Owner decision capture and narrow campaign export conflicts/retries.

Hosted browser/visual acceptance and individually authenticated live role tests remain pending with the existing Cloudflare release gates. Keep PR #18 draft; do not merge or deploy production from local test results alone.
