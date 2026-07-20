# Apricot Budget

A web-based personal budget management application for family-scale finance tracking. Designed for LAN-only deployment with a strong focus on data integrity.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** NestJS + TypeScript
- **ORM:** Prisma
- **Database:** PostgreSQL 16
- **Deployment:** Docker Compose + Nginx

## Prerequisites

Before installing, make sure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) 20 LTS or later (includes npm)
- [Docker](https://www.docker.com/) and Docker Compose
- [Git](https://git-scm.com/)
- Access to a PostgreSQL 16 server (a local Docker container works too)

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url> apricot-budget
cd apricot-budget
```

### 2. Configure environment variables

Copy the example env file and edit it to match your environment:

```bash
cp .env.example .env
```

Key variables to set:

- `DATABASE_URL` — PostgreSQL connection string (e.g. `postgresql://user:password@10.0.0.227:5432/apricot`)
- `VITE_API_URL` — Backend URL exposed to the frontend (e.g. `http://10.0.0.227:3000`)
- `JWT_SECRET` — Secret key for authentication tokens

> **Note:** `VITE_*` variables are injected at build time. Rebuild the frontend after changing them.

### 3. Install dependencies

From the repo root (npm workspaces):

```bash
npm install
```

### 4. Set up the database

Run Prisma migrations to create the schema and seed default categories:

```bash
npx prisma migrate deploy
npx prisma db seed
```

For local development, use `prisma migrate dev` instead.

### 5. Run in development mode

Start the backend and frontend dev servers:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### 6. Deploy with Docker Compose

For production (or NAS deployment):

```bash
docker compose up -d --build
```

Default exposed ports:

- Frontend (Nginx): **9080**
- Backend API: **3000**
- PostgreSQL: **5432**

Access the app at `http://<host-ip>:9080`.

## Importing bank statements

The app supports CSV imports in BNC (Banque Nationale du Canada) format with the following columns:

```
Date, Description, Categorie, Debit, Credit, Solde
```

- Date format: `MM/DD/YYYY`
- `Debit` and `Credit` are mutually exclusive
- Rows with `Categorie = "Non categorise"` are sent to the mapping engine for classification

## Troubleshooting

- **TS2339 on `import.meta.env`:** Make sure `apps/frontend/src/vite-env.d.ts` exists with `/// <reference types="vite/client" />`.
- **Cannot connect to PostgreSQL:** Verify `pg_hba.conf` allows connections from your subnet and that port 5432 is reachable.
- **Frontend shows old API URL after `.env` change:** Rebuild the frontend — Vite bakes env vars into the bundle at build time.

## License

Private — family use only.
