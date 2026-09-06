# auth.md

This document describes how AI agents and automated clients can authenticate with **Oxygen Low's Software** (`https://oxygenlow.com`).

## Agent Audience

This service is open to any AI agent or automated client. Agents may access public resources anonymously or register for a bearer token to access authenticated endpoints.

## Discovery Documents

- **OAuth Protected Resource Metadata**: `https://oxygenlow.com/.well-known/oauth-protected-resource`
- **OAuth Authorization Server Metadata**: `https://oxygenlow.com/.well-known/oauth-authorization-server`

The authorization server metadata includes a machine-readable `agent_auth` block that describes all supported registration flows.

## Registration Endpoint

- **Register**: `POST https://oxygenlow.com/agent/auth`
- **Revoke**: `POST https://oxygenlow.com/agent/auth/revoke`
- **Claim**: `GET https://oxygenlow.com/agent/auth/claim`

## Supported Authentication Methods

### 1. Identity Assertion — ID-JAG (JWT Authorization Grant)

Agents with a signed JWT Authorization Grant can exchange it for a bearer token.

- **Assertion type**: `urn:ietf:params:oauth:token-type:id-jag`
- **Credential type**: `bearer`
- **Register**: `POST https://oxygenlow.com/agent/auth` with assertion in request body
- **Revoke**: `POST https://oxygenlow.com/agent/auth/revoke`
- **Revocation event**: `urn:ietf:params:oauth:event-type:token-revoked`

### 2. Identity Assertion — Verified Email

Agents with a verified email identity claim can register and obtain a bearer token.

- **Assertion type**: `verified_email`
- **Credential type**: `bearer`
- **Register**: `POST https://oxygenlow.com/agent/auth` with email assertion
- **Claim**: `GET https://oxygenlow.com/agent/auth/claim`

### 3. Anonymous Access

Agents without an identity can obtain an anonymous bearer token for access to public resources.

- **Credential type**: `bearer`
- **Claim**: `GET https://oxygenlow.com/agent/auth/claim`

## Using Credentials

All bearer tokens must be sent in the HTTP `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens provide access to API resources scoped under the permissions granted at registration time. See the Authorization Server metadata for the full list of supported scopes.
