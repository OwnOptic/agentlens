/**
 * AgentLens Gate Decision Signing
 *
 * HMAC-SHA256 signing and verification for GateDecision records.
 * Provides tamper-detection for the audit trail stored in gate_decisions table.
 *
 * Payload signed: "{id}:{agentRef}:{verdict}:{signedAt}"
 *
 * Key: GATE_SIGNING_KEY env var (hex string).
 *      Falls back to a deterministic dev-only key when the env var is absent
 *      so the app runs offline without configuration.
 *
 * Revocation: revoked decisions carry revoked=true in the database row.
 * The original payload+signature is preserved so the audit trail remains
 * intact - revoking does NOT delete or re-sign.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { GateDecision } from '@/lib/types';

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

/** Dev-only fallback key. MUST NOT be used in production. */
const DEV_FALLBACK_KEY = 'agentlens-dev-gate-signing-key-do-not-use-in-prod';

/**
 * Get the active signing key.
 * Priority: GATE_SIGNING_KEY env var > DEV_FALLBACK_KEY.
 */
function getSigningKey(): string {
  return process.env.GATE_SIGNING_KEY ?? DEV_FALLBACK_KEY;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

/** Fields included in the HMAC payload (order is significant). */
export interface SignablePayload {
  id: string;
  agentRef: string;
  verdict: 'pass' | 'block';
  signedAt: string;
}

/**
 * Serialise the signable payload to a canonical string.
 * Format: "{id}:{agentRef}:{verdict}:{signedAt}"
 */
function canonicalPayload(p: SignablePayload): string {
  return `${p.id}:${p.agentRef}:${p.verdict}:${p.signedAt}`;
}

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------

/**
 * Compute an HMAC-SHA256 hex signature for a gate decision payload.
 *
 * @param payload  The signable fields (id, agentRef, verdict, signedAt).
 * @returns        Lowercase hex string.
 */
export function signDecision(payload: SignablePayload): string {
  const key = getSigningKey();
  const msg = canonicalPayload(payload);
  return createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export type VerifyResult =
  | { valid: true; revoked: false }
  | { valid: false; revoked: boolean; reason: string };

/**
 * Verify the signature on a GateDecision.
 *
 * Returns:
 *   - { valid: true, revoked: false }  when signature matches and not revoked
 *   - { valid: true, revoked: true }   NOT RETURNED - revoked = signature tampered
 *     (revocation sets revoked=true but keeps original sig, so we return valid=true, revoked=true separately)
 *   - { valid: false, ... }            when signature does not match
 *
 * Implementation note: timing-safe comparison prevents side-channel attacks.
 */
export function verifyDecision(decision: GateDecision): VerifyResult {
  // Recompute expected signature
  const expected = signDecision({
    id: decision.id,
    agentRef: decision.agentRef,
    verdict: decision.verdict,
    signedAt: decision.signedAt,
  });

  // Timing-safe compare (both must be same length)
  let signaturesMatch = false;
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(decision.signature, 'hex');
    signaturesMatch =
      expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    return {
      valid: false,
      revoked: decision.revoked,
      reason: 'Signature mismatch - payload may have been tampered with.',
    };
  }

  if (decision.revoked) {
    return {
      valid: false,
      revoked: true,
      reason: 'Decision has been revoked. Signature is intact but this record is no longer authoritative.',
    };
  }

  return { valid: true, revoked: false };
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/**
 * Return a copy of the decision with revoked=true.
 *
 * IMPORTANT: the original signature is preserved - the canonical payload
 * does not include the revoked flag, so verifyDecision() will still confirm
 * signature integrity but will report revoked=true.
 *
 * Callers must persist the returned object to the database.
 *
 * @param decision  The GateDecision to revoke.
 * @returns         A new object (original unchanged) with revoked=true.
 */
export function revokeDecision(decision: GateDecision): GateDecision {
  return { ...decision, revoked: true };
}

/**
 * Batch revoke: returns a map of id -> revoked GateDecision for all supplied decisions.
 */
export function revokeAll(
  decisions: GateDecision[]
): Map<string, GateDecision> {
  const map = new Map<string, GateDecision>();
  for (const d of decisions) {
    map.set(d.id, revokeDecision(d));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Summary helper (UI use)
// ---------------------------------------------------------------------------

export interface DecisionSummary {
  id: string;
  agentRef: string;
  verdict: 'pass' | 'block';
  signedAt: string;
  revoked: boolean;
  signatureValid: boolean;
  verifyReason?: string;
}

/**
 * Build a display-ready summary for a GateDecision, including verification state.
 */
export function summariseDecision(decision: GateDecision): DecisionSummary {
  const result = verifyDecision(decision);
  return {
    id: decision.id,
    agentRef: decision.agentRef,
    verdict: decision.verdict,
    signedAt: decision.signedAt,
    revoked: decision.revoked,
    signatureValid: result.valid,
    verifyReason: result.valid ? undefined : result.reason,
  };
}
