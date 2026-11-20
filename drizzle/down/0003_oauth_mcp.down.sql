-- Down de 0003_oauth_mcp: remove as tabelas dos plugins jwt/mcp.
DROP TABLE IF EXISTS "auth_jwks" CASCADE;
DROP TABLE IF EXISTS "auth_oauth_access_token" CASCADE;
DROP TABLE IF EXISTS "auth_oauth_client" CASCADE;
DROP TABLE IF EXISTS "auth_oauth_client_assertion" CASCADE;
DROP TABLE IF EXISTS "auth_oauth_client_resource" CASCADE;
DROP TABLE IF EXISTS "auth_oauth_consent" CASCADE;
DROP TABLE IF EXISTS "auth_oauth_refresh_token" CASCADE;
DROP TABLE IF EXISTS "auth_oauth_resource" CASCADE;
