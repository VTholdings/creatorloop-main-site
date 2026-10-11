// OWNER-ONLY PRIVATE INSTALLATION TEMPLATE. Not a working signer/endpoint.
// Copy only into a new versioned Owner-local directory; never modify installed core.
// Do not place credentials, keys, cookie values or private configuration in GitHub.
const disabled=()=>{throw Error('ACTUAL_OWNER_PRIVATE_PORT_NOT_INSTALLED');};
export const issuer='VT-CREATORLOOP-TRAINING-OWNER-MAC-EVIDENCE-V1';
export const keyId='UNPROVISIONED-EVIDENCE-KEY';
export const publicKeys=[];
// pollOwnerPending: outbound POST exact Owner relay /v1/owner/pending, body {}.
// Authentication from Owner-controlled keychain/in-memory login; never env/source/chat.
export const pollOwnerPending=disabled;
// readLocalDecision: only Owner-retained request/hash/role/source decision, never an
// executor-provided affirmative body. Unknown purpose/query/caller -> refuse.
export const readLocalDecision=disabled;
// validateIndependentObservation: wire existing createTrainingObserver with direct
// read-only provider/request/runtime/session ports. Never accept executor booleans.
export const validateIndependentObservation=disabled;
// claimLocalOnce: durable Owner-only file/SQLite unique nonce+pending hash, before
// signing. Keep used IDs/nonces after expiry and across crashes/restores.
export const claimLocalOnce=disabled;
// retainLocalEvidence: append/sign-intent and exact signed response under Owner 0700
// directory; files 0600 and independent VT copy. Fail closed on failed retention.
export const retainLocalEvidence=disabled;
// externalEvidenceSign: RS256 signs exact evidence JWS input under a separate key
// ID/purpose on the Owner Mac ONLY. Not createTrainingSigner admission payload.
// Admission receipt stays through existing installed signer+observer+externalSign.
export const externalEvidenceSign=disabled;
// postOwnerResponse: outbound POST /v1/owner/respond {id,jws}; no retries/redirects.
export const postOwnerResponse=disabled;
