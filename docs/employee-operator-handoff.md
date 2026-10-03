# CreatorLoop employee and operator handoff

## Your goal

Use your individual identity to work only on your approved records. Keep business approvals, QA, training, and production access separate.

## Before you start

Your Administrator must give you an approved role and scope. Your Administrator must also verify individual admission for the environment you will use. Training and certification alone do not give you production access. Do not use the retired `support@creatorloop.net` identity or another person's login.

## Administrator: prepare an employee

1. Open **Administration → Team & Access**. Choose **Add User**. Enter the person's full name, individual email, approved role, employment status, and proposed Campaign ID / Creator ID scope. Save the inactive user.
2. Prepare the person separately in the isolated training environment. Use fictional records. Do not copy production records or credentials into training.
3. Choose **Prepare Admission Request** in training. Review the person, environment, and reason. This creates a request; it does not change Cloudflare.
4. Have the approved external executor complete that exact request. The executor must verify the individual policy and session, preserve Owner and integration service policies, and return a signed evidence envelope. Follow the [executor contract](admission-execution.md). Never put an API token, Access JWT, or signing private key in the Console.
5. Choose **Record Signed Edge Receipt**. Review the receipt and reason before recording it. Then choose **Start Training** in training. The person must sign in with a fresh individual session. An expired or mismatched receipt is rejected.
6. Run the role's training scenarios below. Record certification with the evidence link and reason. Certification ends practice access and queues any required edge revocation. Finish that revocation before preparing another admission.
7. In production, record role-specific certification evidence from training, approved scope, visibility, and any separate approval delegation. The production identity remains inactive. Prepare and verify a separate production admission request. A training receipt cannot be reused.
8. Choose **Activate** only when the current-role certification, employment, scope, and individual admission receipt are complete. Ask the person to sign in again. Activation does not add business authority beyond the recorded role, scope, and separate delegations.

## Employee: work on a record

1. Open your assigned record. Check the Campaign ID and Creator ID before editing.
2. Choose **Edit**. Changed fields show an unsaved marker. Typing, changing focus, and leaving a field do not save the record.
3. Choose **Save changes**. Review the before/after values. Confirm the save when required.
4. If you change your mind, choose **Cancel/Discard**. The original values stay unchanged.
5. If Save reports a permission or version conflict, stop. Keep or discard your local draft. Reopen the current record and compare the change before trying again.
6. If a field is locked or requires approval, use **Request approval / Escalate**. Normal Save does not grant approval. Campaign editing stays limited to authorized operational Notes.

## Role practice and live acceptance

Use distinct individual accounts. Record the result and audit event for each scenario. Generated test JWTs and local fixtures do not count as live evidence.

- **Operator:** save a permitted creator detail within scope; discard a draft; reject an unrelated Creator ID; submit work to QA; reject an unapproved governed field.
- **QA Reviewer:** record only the authorized QA result and notes. Reject compensation, rights approval, launch, and unrelated records.
- **Operations:** record only exact separately approved decisions. Verify a revoked approval cannot be saved.
- **Approval Authority:** use only an explicit unexpired field/campaign delegation. Reject Owner Approval, launch and budget authority.
- **Operations Manager / Marketing / Campaign Manager:** use only approved scope and visibility. Job title alone does not grant approvals, PII, economics or exports. Campaign Notes require the authorized role, whole-campaign grant and management visibility.
- **Technician:** verify the approved technical level and explicit diagnostic scope. Training belongs in training. No technical level grants credentials or business approval authority.
- **Read Only / Auditor:** verify scoped reads and explicit audit/report visibility. Reject edits and unauthorized exports.
- **Administrator:** verify stale saves, revoked scope and old sessions, immutable audit/report history, finalized report supersession, source conflict rejection, and the employee lifecycle.

## Administrator: change or end access

1. Record each role, scope, visibility, authority or employment change with a reason. Old sessions must be rejected after a permission change.
2. Choose **Suspend** or **Deactivate** when work must stop. Console access ends immediately. Historical identity, assignments and attribution stay in place.
3. Check **Cloudflare session revocation**. `PENDING_VERIFICATION` means edge revocation still needs evidence. It does not mean Cloudflare tokens are already gone.
4. Complete the current individual revocation request through the approved executor. Record its signed removal/session proof. If personnel state changes while work is pending, use the latest request and version.
5. To reactivate, complete pending revocation first. Verify certification, scope, employment and a new individual admission receipt. Do not reactivate by editing database values or enabling a deployment switch.

## When you're done

Keep individually authenticated results, before/after audit IDs, denied-action evidence, source round-trip evidence, backup/restore evidence and the handoff outcome in the protected release evidence destination selected by the Owner. Do not include secrets. Operator Readiness remains pending until these live checks pass.

If access, a source record, or an approval is missing, stop that action and escalate the exact blocker. Do not widen scope, rename source fields, bypass Access, or overwrite finalized history to make a test pass.
