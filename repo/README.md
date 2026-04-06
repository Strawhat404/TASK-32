# VaultRoom Commerce & Experience

## Quick Start
1. From the `repo/` directory, copy and configure secrets:
   ```bash
   cp .env.example .env   # then edit .env with your own secrets
   ```
2. Generate TLS certificates (required before first run):
   ```bash
   ./certs/generate_certs.sh
   ```
3. Start the stack:
   ```bash
   docker compose up
   ```

## Secrets
All secrets are injected via the `.env` file. **No default secrets are hardcoded in `docker-compose.yml`.**

Required variables in `.env`:
| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL database password |
| `DB_PASSWORD` | Backend database connection password |
| `APP_AES_KEY` | AES-256 key for at-rest encryption (64 hex chars) |
| `ADMIN_PASSWORD` | Bootstrap password for all seeded user accounts |

## Testing
```bash
cd repo && ./run_tests.sh
```
For API tests against the running stack, also set `ADMIN_PASSWORD`:
```bash
ADMIN_PASSWORD=<your_password> ./run_tests.sh
```

## Access
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: `http://localhost:3000`

## Tech Stack
- **Frontend**: Svelte, Vite
- **Backend**: Node.js, Fastify
- **Database**: PostgreSQL
- **Reverse Proxy**: Caddy (TLS)
