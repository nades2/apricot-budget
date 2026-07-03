# apricot-budget · déploiement Docker

## Contexte

- Postgres est **externe** (conteneur existant sur `10.0.0.227:5433`).
- Compose gère **backend** (NestJS) + **frontend** (Nginx + build Vite).
- Nginx sert `/` (SPA) et proxifie `/api/*` vers le conteneur backend.
- Le frontend est exposé sur le port `8080` de l'hôte (à changer selon besoin).

## Prérequis

- Docker + Docker Compose installés sur la machine cible.
- Un fichier `.env` à la racine du repo (à côté de `docker-compose.yml`), copié de `.env.example` puis rempli avec le vrai `DATABASE_URL` et un `JWT_SECRET` fort.

## Commandes

```bash
# Build et démarrage
docker compose up -d --build

# Voir les logs
docker compose logs -f backend
docker compose logs -f frontend

# Migrations (auto-exécutées au démarrage du backend, mais utile en manuel) :
docker compose exec backend npx prisma migrate deploy --schema=prisma/schema.prisma

# Seed initial (à faire une fois après la première migration en prod si voulu) :
docker compose exec backend npx prisma db seed

# Arrêt
docker compose down
```

## Accès

- Frontend : `http://<host>:8080`
- API santé (interne, via proxy) : `http://<host>:8080/api/health`

## Notes prod

- Mets un vrai `JWT_SECRET` (au moins 32 caractères aléatoires) dans `.env`.
- Mets `CORS_ORIGIN=https://budget.mondomaine.local` si le frontend n'est pas sur la même origine.
- Devant Nginx du conteneur, tu peux placer un reverse proxy HTTPS (Traefik, Caddy, Nginx hôte) pour terminer TLS et pointer vers `apricot-frontend:80`.
- Le healthcheck backend interroge `/api/health` toutes les 30s.
