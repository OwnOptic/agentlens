/**
 * Token Service (Server-Only)
 *
 * Provides MSAL-based token acquisition for Power Platform APIs.
 * This module must only run on the server side.
 *
 * @server
 */

import { ConfidentialClientApplication, ITokenCache } from '@azure/msal-node';

/**
 * In-memory token cache entry
 */
interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * TokenService
 * Manages token lifecycle with per-audience caching.
 */
class TokenService {
  private clientApp: ConfidentialClientApplication;
  private tokenCache: Map<string, CachedToken>;
  private readonly BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer before expiry

  constructor() {
    // TODO: Initialize ConfidentialClientApplication with real MSAL config
    // Expected config structure:
    // {
    //   auth: {
    //     clientId: string;
    //     authority: string;
    //     clientSecret: string;
    //   }
    // }
    this.clientApp = {} as ConfidentialClientApplication;
    this.tokenCache = new Map<string, CachedToken>();
  }

  /**
   * Get a token for the specified audience.
   * Caches tokens in memory and returns cached tokens if valid.
   *
   * @param audience The resource audience (e.g., "https://org.crm.dynamics.com/.default")
   * @returns A valid access token
   * @throws Error if token acquisition fails
   */
  public async getToken(audience: string): Promise<string> {
    // Check cache
    const cached = this.tokenCache.get(audience);
    if (cached && cached.expiresAt > Date.now() + this.BUFFER_MS) {
      return cached.token;
    }

    // TODO: Acquire token via clientApp.acquireTokenByClientCredential()
    // Expected call:
    // const response = await this.clientApp.acquireTokenByClientCredential({
    //   scopes: [audience],
    // });
    // const token = response?.accessToken;
    const token = '';

    if (!token) {
      throw new Error(`Failed to acquire token for audience: ${audience}`);
    }

    // TODO: Decode JWT to extract expiration
    // For now, assume 1 hour expiry (3600 seconds)
    const expiresAt = Date.now() + 3600 * 1000;

    // Cache the token
    this.tokenCache.set(audience, { token, expiresAt });

    return token;
  }

  /**
   * Get a token for Dataverse (Power Platform data access).
   * Derives the audience from the organization URL.
   *
   * @param orgUrl The Dataverse organization URL (e.g., "https://myorg.crm.dynamics.com")
   * @returns A valid access token
   * @throws Error if token acquisition fails
   */
  public async getDataverseToken(orgUrl: string): Promise<string> {
    // Normalize orgUrl (remove trailing slash if present)
    const normalizedUrl = orgUrl.endsWith('/') ? orgUrl.slice(0, -1) : orgUrl;

    // Derive the audience for Dataverse
    const audience = `${normalizedUrl}/.default`;

    return this.getToken(audience);
  }

  /**
   * Clear the token cache.
   * Useful for logout or testing.
   */
  public clearCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Get cache statistics (for monitoring).
   * @returns Map of cached audiences and their expiry times
   */
  public getCacheStats(): Map<string, number> {
    const stats = new Map<string, number>();
    for (const [audience, cached] of this.tokenCache.entries()) {
      stats.set(audience, cached.expiresAt);
    }
    return stats;
  }
}

// Singleton instance
let instance: TokenService | null = null;

/**
 * Get the token service singleton instance.
 */
export function getTokenService(): TokenService {
  if (!instance) {
    instance = new TokenService();
  }
  return instance;
}

/**
 * Get a token for the specified audience.
 *
 * @param audience The resource audience
 * @returns A valid access token
 */
export async function getToken(audience: string): Promise<string> {
  return getTokenService().getToken(audience);
}

/**
 * Get a token for Dataverse (Power Platform data access).
 *
 * @param orgUrl The Dataverse organization URL
 * @returns A valid access token
 */
export async function getDataverseToken(orgUrl: string): Promise<string> {
  return getTokenService().getDataverseToken(orgUrl);
}

/**
 * Clear the token cache.
 * Useful for logout or testing.
 */
export function clearTokenCache(): void {
  getTokenService().clearCache();
}
