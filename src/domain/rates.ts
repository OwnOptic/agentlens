/**
 * Message rates - the one place a price enters this codebase.
 *
 * Copilot Studio meters in MESSAGES. The consumption API returns message counts
 * per agent; it does not return money. Turning one into the other needs a rate,
 * and the rate depends on the contract: prepaid capacity packs and
 * pay-as-you-go are billed differently, and list prices change.
 *
 * The rule this file exists to enforce: a currency figure may be derived, but
 * the rate and where it came from travel with it, in the same payload, always.
 * A bare number with an invisible constant behind it is what this codebase
 * refuses to produce - the administrator must be able to see the multiplier and
 * disagree with it.
 *
 * Set COPILOT_RATE_STANDARD / COPILOT_RATE_PREMIUM from your own price sheet and
 * every figure becomes yours. Leave them unset and the published list price is
 * used, labelled as such, with the date it was last checked.
 */

export type RateSource = 'operator' | 'list_price';

export interface Rates {
  /** Currency per message on the standard meter. */
  standard: number;
  /** Currency per message on the premium / generative meter. */
  premium: number;
  currency: string;
  source: RateSource;
  /**
   * Plain-language provenance. Goes into the tool result verbatim so the model
   * states it alongside any figure derived from these rates.
   */
  basis: string;
}

/**
 * Microsoft's published pay-as-you-go list prices, in USD per message.
 *
 * These are a DEFAULT, not a fact about your invoice. Prepaid capacity packs
 * price differently, enterprise agreements discount, and list prices move.
 * Check them against
 * https://learn.microsoft.com/power-platform/admin/manage-copilot-studio-messages-capacity
 * and override with COPILOT_RATE_* when they drift.
 */
const LIST_PRICE_STANDARD = 0.01;
const LIST_PRICE_PREMIUM = 0.025;
const LIST_PRICE_CURRENCY = 'USD';
/** Bump this whenever the constants above are re-checked against Microsoft. */
const LIST_PRICE_CHECKED = '2026-08';

function num(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Resolve the rates to use.
 *
 * Operator-supplied rates win outright. Supplying only one is enough - the
 * other falls back to list price, and `basis` says so, because a half-configured
 * rate table silently mixing two sources is exactly the kind of thing that
 * makes a number untraceable.
 */
export function resolveRates(): Rates {
  const standard = num('COPILOT_RATE_STANDARD');
  const premium = num('COPILOT_RATE_PREMIUM');
  const currency = process.env.COPILOT_RATE_CURRENCY?.trim() || LIST_PRICE_CURRENCY;

  if (standard === undefined && premium === undefined) {
    return {
      standard: LIST_PRICE_STANDARD,
      premium: LIST_PRICE_PREMIUM,
      currency: LIST_PRICE_CURRENCY,
      source: 'list_price',
      basis:
        `Derived from Microsoft's published pay-as-you-go list price ` +
        `(${LIST_PRICE_STANDARD} ${LIST_PRICE_CURRENCY}/message standard, ` +
        `${LIST_PRICE_PREMIUM} ${LIST_PRICE_CURRENCY}/message premium, checked ${LIST_PRICE_CHECKED}). ` +
        `This is a list price, not your invoice: prepaid capacity packs and negotiated agreements ` +
        `price differently. Set COPILOT_RATE_STANDARD and COPILOT_RATE_PREMIUM to your own rates. ` +
        `For billed spend rather than a derived figure, use the Azure Cost Management totals in this same result.`,
    };
  }

  const mixed = standard === undefined || premium === undefined;

  return {
    standard: standard ?? LIST_PRICE_STANDARD,
    premium: premium ?? LIST_PRICE_PREMIUM,
    currency,
    source: 'operator',
    basis:
      `Derived from the rates configured on this deployment ` +
      `(${standard ?? LIST_PRICE_STANDARD} ${currency}/message standard, ` +
      `${premium ?? LIST_PRICE_PREMIUM} ${currency}/message premium)` +
      (mixed
        ? `. Note: only one rate was configured; the other fell back to list price.`
        : '.') +
      ` Accuracy depends on those rates matching your agreement.`,
  };
}

/** Cost of a message count on a given meter. Rounded to cents. */
export function costOf(messages: number, meter: string | null, rates: Rates): number {
  const rate = meter === 'premium' ? rates.premium : rates.standard;
  return Number((messages * rate).toFixed(2));
}
