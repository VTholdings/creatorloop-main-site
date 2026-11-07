// CreatorLoop Phase 18 — Owner-Mac outbound evidence runner (source only).
// Runs exclusively on an Owner-controlled machine with separately installed,
// authenticated private ports. This module contains no credentials or signer.
import { webcrypto } from 'node:crypto';
import { validateOwnerPending, prepareOwnerEvidence, ownerPendingHash } from './training-owner-approval-protocol.mjs';
import { validatePublicVerifierKeys } from './creatorloop-training-signer.mjs';
import { refuse } from './training-execution-contract.mjs';

const b64url = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
const required = (value, name) => { if (typeof value !== 'function') refuse('OWNER_PRIVATE_PORT_REQUIRED_' + name); };
const exact = (v, names) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).sort().join('|') === [...names].sort().join('|');

async function ownerPost({origin, path, body, ownerAccessToken, fetchImpl}) {
  const response = await fetchImpl(origin + path, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': ownerAccessToken },
    body: JSON.stringify(body)
  });
  if (response.status !== 200 || response.redirected || !response.ok) refuse('OWNER_RELAY_RESPONSE_REFUSED');
  const text = await response.text();
  if (text.length > 32768) refuse('OWNER_RELAY_BODY_TOO_LARGE');
  try { return JSON.parse(text); } catch { refuse('OWNER_RELAY_INVALID_JSON'); }
}

/**
 * Process one bounded outbound poll. No automatic timer, retry, or deployment.
 * All callbacks must be independently installed on the Owner Mac; none may
 * derive a positive decision from the executor's submitted evidence alone.
 *
 * authorizeOwnerRequest: obtains an already-authorized short-lived Owner
 * Access JWT from private custody (never a service/executor credential).
 * readLocalDecision: reads an Owner-retained decision, not a pending request
 * self-approval.
 * validateIndependentObservation: returns a locally corroborated decision
 * with the exact existing CREATORLOOP_OWNER_LOCAL_EVIDENCE_DECISION_V1 shape.
 * claimLocalOnce: atomically/durably claims pending id, hash and nonce BEFORE
 * signing, persisting replay denial across restart/restore.
 * retainLocalEvidence: durable Owner-only append + independent recovery copy
 * of decision, signing intent and signed response BEFORE transmission.
 * externalEvidenceSign: signs exact JWS input with a separately held RS256
 * evidence key; never an admission or deployment credential.
 */
export async function runOwnerMailboxOnce({
  origin, issuer, keyId, publicJwk, authorizeOwnerRequest,
  readLocalDecision, validateIndependentObservation, claimLocalOnce,
  retainLocalEvidence, externalEvidenceSign,
  fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000)
}) {
  if (typeof origin !== 'string' || !/^https:\/\/[a-z0-9.-]+$/i.test(origin) ||
      new URL(origin).origin !== origin || new URL(origin).username || new URL(origin).password)
    refuse('EXACT_OWNER_RELAY_ORIGIN_REQUIRED');
  if (typeof issuer !== 'string' || !issuer || typeof keyId !== 'string' || !keyId)
    refuse('OWNER_EVIDENCE_ISSUER_REQUIRED');
  for (const [name, port] of Object.entries({
    authorizeOwnerRequest, readLocalDecision, validateIndependentObservation,
    claimLocalOnce, retainLocalEvidence, externalEvidenceSign
  })) required(port, name);
  const [key] = await validatePublicVerifierKeys([publicJwk]);
  if (key.kid !== keyId) refuse('OWNER_EVIDENCE_KEY_ID_MISMATCH');
  const verifyKey = await webcrypto.subtle.importKey('jwk', key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const token = await authorizeOwnerRequest({ origin, purpose: 'owner-mailbox' });
  if (typeof token !== 'string' || !token || token.length > 16384) refuse('OWNER_ACCESS_TOKEN_REQUIRED');
  const polled = await ownerPost({ origin, path: '/v1/owner/pending', body: {},
    ownerAccessToken: token, fetchImpl });
  if (!exact(polled, ['pending']) || !Array.isArray(polled.pending) || polled.pending.length > 20)
    refuse('EXACT_OWNER_PENDING_RESPONSE_REQUIRED');
  const outcomes = [];
  for (const raw of polled.pending) {
    const pending = validateOwnerPending(raw, now());
    const pendingHash = ownerPendingHash(pending);
    // Local decision and independent evidence are obtained without trusting
    // executor assertions or using pending.value as approval.
    const local = await readLocalDecision({ pending: structuredClone(pending) });
    const decision = await validateIndependentObservation({
      pending: structuredClone(pending), localDecision: local
    });
    const prepared = prepareOwnerEvidence({ pending, decision, issuer, keyId, now: now() });
    if (prepared.pendingHash !== pendingHash) refuse('OWNER_PENDING_HASH_CHANGED');
    if (await claimLocalOnce({ id: pending.id, pendingHash, nonce: pending.read.nonce }) !== true)
      refuse('OWNER_LOCAL_REPLAY_CLAIM_REFUSED');
    const signed = await externalEvidenceSign({
      keyId, algorithm: 'RS256', signingInput: prepared.signingInput
    });
    if (!exact(signed, ['keyId', 'signature']) || signed.keyId !== keyId ||
        !b64url(signed.signature)) refuse('OWNER_EVIDENCE_SIGNATURE_REFUSED');
    const valid = await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', verifyKey,
      Buffer.from(signed.signature, 'base64url'),
      Buffer.from(prepared.signingInput, 'ascii'));
    if (!valid) refuse('OWNER_EVIDENCE_SIGNATURE_NOT_VERIFIED');
    const jws = prepared.signingInput + '.' + signed.signature;
    if (jws.length > 16384 || pending.expiresAt <= now()) refuse('OWNER_EVIDENCE_EXPIRED');
    await retainLocalEvidence({
      pending: structuredClone(pending), decision: structuredClone(decision),
      pendingHash, signingInput: prepared.signingInput, jws
    });
    // No retry after a failed response; operator investigates durable local
    // evidence and relay custody independently before any further action.
    const receipt = await ownerPost({ origin, path: '/v1/owner/respond',
      body: { id: pending.id, jws }, ownerAccessToken: token, fetchImpl });
    if (!exact(receipt, ['id', 'pendingHash', 'responseHash']) ||
        receipt.id !== pending.id || receipt.pendingHash !== pendingHash ||
        !/^[a-f0-9]{64}$/.test(receipt.responseHash || ''))
      refuse('OWNER_RELAY_RECEIPT_REFUSED');
    outcomes.push({ id: pending.id, pendingHash, responseHash: receipt.responseHash });
  }
  return { protocol: 'CREATORLOOP_OWNER_OUTBOUND_PROCESSING_V1',
    environment: 'TRAINING', processed: outcomes.length, receipts: outcomes };
}
