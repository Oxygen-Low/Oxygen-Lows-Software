export type OxygenScope =
  | "username"
  | "display_name"
  | "email"
  | "profile_picture"
  | "bio";

export interface OxygenAuthConfig {
  /**
   * The public Client ID for your Oxygen Low's Software application (e.g. ol_app_...).
   */
  clientId: string;

  /**
   * The secret API key for your application (e.g. ol_sec_...).
   * Required for server-side token exchanges and token revocations.
   */
  apiKey?: string;

  /**
   * Base URL of the Oxygen Low's Software instance.
   * Defaults to 'https://oxygenlow.com'.
   */
  baseUrl?: string;
}

export interface AuthorizeUrlOptions {
  /**
   * The callback redirect URI registered for your application.
   */
  redirectUri: string;

  /**
   * Optional scopes to request. Defaults to all allowed scopes configured on your app.
   */
  scopes?: (OxygenScope | string)[];

  /**
   * An opaque value to maintain state between the request and the callback (recommended for CSRF protection).
   */
  state?: string;
}

export interface ExchangeCodeOptions {
  /**
   * The authorization code received from the user redirect callback.
   */
  code: string;

  /**
   * The exact redirect URI used in the initial authorization request.
   */
  redirectUri?: string;

  /**
   * Override API key if not provided during initialization.
   */
  apiKey?: string;
}

export interface OxygenUser {
  id: string;
  username?: string;
  display_name?: string;
  email?: string;
  profile_picture_url?: string | null;
  bio?: string;
  [key: string]: any;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
  user: OxygenUser;
}

export class OxygenAuthError extends Error {
  public code?: string;
  public status?: number;
  public errorDescription?: string;

  constructor(message: string, options?: { code?: string; status?: number; errorDescription?: string }) {
    super(message);
    this.name = "OxygenAuthError";
    this.code = options?.code;
    this.status = options?.status;
    this.errorDescription = options?.errorDescription;
  }
}
