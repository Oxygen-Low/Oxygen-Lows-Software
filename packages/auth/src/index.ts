import {
  OxygenAuthConfig,
  AuthorizeUrlOptions,
  ExchangeCodeOptions,
  OxygenUser,
  TokenResponse,
  OxygenAuthError,
  OxygenScope,
} from "./types.js";

export * from "./types.js";

export class OxygenAuth {
  private clientId: string;
  private apiKey?: string;
  private baseUrl: string;

  constructor(config: OxygenAuthConfig) {
    if (!config || !config.clientId) {
      throw new OxygenAuthError("clientId is required to initialize OxygenAuth");
    }
    this.clientId = config.clientId.trim();
    this.apiKey = config.apiKey?.trim();
    this.baseUrl = (config.baseUrl || "https://oxygenlow.com").replace(/\/+$/, "");
  }

  /**
   * Generates the authorization URL for user login and permission consent.
   * Redirect the user's browser to this URL to initiate authentication.
   */
  public getAuthorizationUrl(options: AuthorizeUrlOptions): string {
    if (!options || !options.redirectUri) {
      throw new OxygenAuthError("redirectUri is required in getAuthorizationUrl options");
    }

    const url = new URL(`${this.baseUrl}/oauth/authorize`);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", options.redirectUri);

    if (options.scopes && options.scopes.length > 0) {
      url.searchParams.set("scope", options.scopes.join(" "));
    }

    if (options.state) {
      url.searchParams.set("state", options.state);
    }

    return url.toString();
  }

  /**
   * Exchanges an authorization code for an access token and the authenticated user profile.
   * Call this on your backend server inside your OAuth redirect callback route.
   */
  public async exchangeCode(options: ExchangeCodeOptions): Promise<TokenResponse> {
    if (!options || !options.code) {
      throw new OxygenAuthError("Authorization code is required to exchange for token");
    }

    const secretKey = options.apiKey || this.apiKey;
    if (!secretKey) {
      throw new OxygenAuthError(
        "API Key (apiKey) is required to exchange authorization code for access token. Provide it during initialization or in exchangeCode options.",
      );
    }

    const endpoint = `${this.baseUrl}/api/oauth/token`;
    const body: Record<string, any> = {
      grant_type: "authorization_code",
      client_id: this.clientId,
      client_secret: secretKey,
      code: options.code,
    };

    if (options.redirectUri) {
      body.redirect_uri = options.redirectUri;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      throw new OxygenAuthError(`Failed to connect to Oxygen Low's Software auth server: ${err.message}`);
    }

    const data: any = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data?.error_description || data?.error || `Token exchange failed with HTTP status ${response.status}`;
      throw new OxygenAuthError(message, {
        code: data?.error,
        status: response.status,
        errorDescription: data?.error_description,
      });
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || "Bearer",
      expiresIn: data.expires_in,
      scope: data.scope || "",
      user: data.user,
    };
  }

  /**
   * Fetches the user profile associated with a bearer access token.
   */
  public async getUserInfo(accessToken: string): Promise<OxygenUser> {
    if (!accessToken) {
      throw new OxygenAuthError("accessToken is required to fetch user info");
    }

    const endpoint = `${this.baseUrl}/api/oauth/userinfo`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (err: any) {
      throw new OxygenAuthError(`Failed to connect to Oxygen Low's Software auth server: ${err.message}`);
    }

    const data: any = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data?.error_description || data?.error || `Failed to fetch user info with HTTP status ${response.status}`;
      throw new OxygenAuthError(message, {
        code: data?.error,
        status: response.status,
        errorDescription: data?.error_description,
      });
    }

    return data;
  }

  /**
   * Verifies if an access token is still active and valid.
   */
  public async verifyToken(
    accessToken: string,
  ): Promise<{ valid: boolean; user?: OxygenUser; error?: string }> {
    try {
      const user = await this.getUserInfo(accessToken);
      return { valid: true, user };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Revokes an access token, invalidating it immediately.
   */
  public async revokeToken(accessToken: string): Promise<boolean> {
    if (!accessToken) return false;

    const endpoint = `${this.baseUrl}/api/oauth/revoke`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token: accessToken }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default OxygenAuth;
