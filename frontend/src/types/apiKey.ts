export interface ApiKeyResponse {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyCreateResponse extends ApiKeyResponse {
  raw_key: string;
}

export interface ApiKeyCreate {
  name: string;
  description?: string | null;
}

export interface ApiKeyUpdate {
  name?: string | null;
  description?: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  auth_disabled: boolean;
}
