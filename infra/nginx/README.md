# Local HTTPS gateway

`docker compose up --build` generates a localhost certificate in the
`nginx_certs` Docker volume and exposes:

- `https://localhost` for the application, API, Swagger UI, WebSockets, and
  browser-facing MinIO objects and presigned URLs.

The certificate is self-signed, so a fresh browser profile will show a warning
the first time it opens the application. Accept the localhost certificate once
for local development. Production deployments must replace it with a
certificate issued for their real hostname.

Google OAuth must allow this exact redirect URI:

`https://localhost/api/auth/google/callback`

HTTP on port 80 redirects to HTTPS. Backend, frontend, database, ML, Adminer,
and MinIO ports are otherwise private to the Docker network; PostgreSQL is also
bound to loopback for the repository's local `sqlx` migration commands.
