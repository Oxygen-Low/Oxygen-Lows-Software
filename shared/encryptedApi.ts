export const ENCRYPTED_API_CATEGORIES = [
  "characters",
  "data_save",
  "chatbot",
] as const;

export type EncryptedApiCategory = (typeof ENCRYPTED_API_CATEGORIES)[number];

export const ENCRYPTED_API_TOKEN_PREFIX = "olea_";
export const ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX = "ENC:v2:aes-256-gcm:";
export const ENCRYPTED_API_MAX_PAGE_SIZE = 100;
export const ENCRYPTED_API_DEFAULT_PAGE_SIZE = 50;
export const ENCRYPTED_API_MAX_KEY_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface WrappedDataKey {
  version: 1;
  wrapped_key: string;
}

export interface EncryptedApiGrant {
  id: string;
  name: string;
  token_prefix: string;
  categories: EncryptedApiCategory[];
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface CreateEncryptedApiGrantRequest {
  name: string;
  categories: EncryptedApiCategory[];
  expires_at: string;
  token_hash: string;
  token_prefix: string;
  wrapped_keys: Partial<Record<EncryptedApiCategory, string>>;
}

/** Paginated payload returned by encrypted-access data endpoints. */
export interface EncryptedApiPage<T = Array<Record<string, unknown>>> {
  data: T;
  pagination: {
    limit: number;
    offset: number;
    count: number;
    has_more: boolean;
  };
}

export function isEncryptedApiCategory(
  value: unknown,
): value is EncryptedApiCategory {
  return (
    typeof value === "string" &&
    (ENCRYPTED_API_CATEGORIES as readonly string[]).includes(value)
  );
}
