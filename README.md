# VaultRoom Platform

## Tech Stack
- **Frontend**: Svelte, Vite
- **Backend**: Node.js, Fastify
- **Database**: PostgreSQL
- **Reverse Proxy**: Caddy

## How to Run
1. Configure secrets:
   ```bash
   cd repo && cp .env.example .env
   ```
2. Start the stack:
   ```bash
   cd repo && docker compose up
   ```

## Where to Access
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: `https://localhost:3443`
