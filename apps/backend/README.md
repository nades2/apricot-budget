# @apricot/backend

API NestJS pour apricot-budget.

## Démarrer

Depuis la racine du monorepo :

```powershell
npm install                       # installe backend + racine (workspaces)
npm run dev:backend               # nest start --watch, port 3000
```

## Endpoints exposés (préfixe /api)

| Méthode | Route                  | Description                                                       |
|--------:|:-----------------------|:------------------------------------------------------------------|
| GET     | /api/health            | Vérifie l'API + la connexion Postgres                             |
| GET     | /api/categories        | Liste catégories système + celles de l'utilisateur                |
| POST    | /api/categories        | Crée une catégorie personnalisée                                  |
| PATCH   | /api/categories/:id    | Modifie une catégorie personnalisée (les système sont verrouillées) |
| DELETE  | /api/categories/:id    | Supprime une catégorie personnalisée                              |
| GET     | /api/accounts          | Liste des actifs/passifs (query `?type=ASSET` ou `?type=LIABILITY`) |
| POST    | /api/accounts          | Ajoute un compte / actif / passif                                 |
| GET     | /api/transactions      | Liste avec filtres `accountId`, `categoryId`, `from`, `to`        |
| POST    | /api/transactions      | Ajoute une transaction ad hoc                                     |
| DELETE  | /api/transactions/:id  | Supprime une transaction                                          |
| GET     | /api/csv-imports       | Historique des imports CSV                                        |
| POST    | /api/csv-imports?accountId=<uuid> | Upload CSV (multipart, `file`) → parse + suggestions      |
| GET     | /api/csv-imports/:id   | Preview des lignes + catégories suggérées                         |
| POST    | /api/csv-imports/:id/confirm | Confirmer les mappings, insérer les transactions            |
| DELETE  | /api/csv-imports/:id   | Rollback complet de l'import                                      |

## Auth

Pas encore de JWT — `DemoUserMiddleware` attache le user `demo@apricot.local`
seedé par Prisma à chaque requête. Quand on branchera Passport-JWT, seul ce
middleware sera remplacé, les contrôleurs restent inchangés.

## Structure

```
src/
├── main.ts                 · bootstrap Nest + Config + ValidationPipe
├── app.module.ts           · assemble tous les modules
├── health.controller.ts    · GET /api/health
├── prisma/                 · PrismaService global (@Global())
├── common/
│   ├── demo-user.middleware.ts    · stand-in auth
│   ├── current-user.decorator.ts  · @CurrentUser()
│   └── prisma-exception.filter.ts · P2002/P2025 → 409/404
├── categories/             · CRUD catégories
├── accounts/               · CRUD actifs/passifs + calcul solde courant
└── transactions/           · CRUD transactions
```
