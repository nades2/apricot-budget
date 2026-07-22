# Pre-deployment security audit — Apricot Budget

**Stack détecté :**
- Frontend : React 18 + TypeScript + Vite, servi par Nginx (Docker)
- Backend : NestJS 11 + TypeScript, Prisma ORM
- DB : PostgreSQL 16 sur NAS Synology (10.0.0.227)
- Infra : Docker Compose sur NAS, exposition prévue via Cloudflare Tunnel
- Auth : JWT (7 jours, bcrypt cost 10, localStorage)

**Sensibilité des données :** ÉLEVÉE — données financières personnelles (transactions bancaires, salaires, dépenses, prêts). Équivalent réglementaire proche des données de santé.

**Contexte :** app familiale/amis (petit groupe fermé), migration LAN → internet via Cloudflare Tunnel.

**Total : 87 items** (🔴 22 critical, 🟠 34 high, 🟡 31 medium)

> Travailler les items 🔴 en priorité. Tout item 🔴 non coché est un **bloquant de déploiement**.
> Légende : `[ ]` à faire · `[x]` fait · `[?]` à vérifier chez toi · `[N/A]` non applicable
> Certains items sont pré-cochés selon ma revue de code. **Vérifie-les quand même** — je peux me tromper.

---

## 1. Frontend & client-side

### 🔴 Critical

- [ ] **Content Security Policy (CSP) est défini dans nginx.conf, sans `unsafe-inline` / `unsafe-eval` sur `script-src`.** Actuellement AUCUN CSP dans `docker/nginx.conf`. Pourquoi : CSP est la défense principale qui empêche un XSS de devenir une prise de compte. Ajouter un header type `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';`. Tester avec https://csp-evaluator.withgoogle.com/.
- [x] **Pas de secrets dans le bundle client.** Vérifié : seule env var `VITE_API_URL` (public par design). Vérif : `docker run --rm apricot-budget/frontend:latest grep -RE "(JWT_SECRET|DATABASE_URL|password)" /usr/share/nginx/html`.
- [ ] **HTTPS partout, pas de mixed content.** À vérifier une fois Cloudflare Tunnel réactivé. `Strict-Transport-Security: max-age=31536000; includeSubDomains` à ajouter dans nginx. Pourquoi : évite le downgrade attack.
- [x] **Pas de `dangerouslySetInnerHTML` non contrôlé.** Vérifié : `grep -r dangerouslySetInnerHTML apps/frontend/src` → 0 résultats.
- [ ] **⚠️ JWT actuellement en `localStorage` — vulnérable au XSS.** Le code lui-même le documente : *"For a LAN family app this is adequate; for public deployment we'd want httpOnly cookies + CSRF."* Pour internet : migrer vers cookies `HttpOnly + Secure + SameSite=Strict` + token CSRF. Chantier moyen (~4h) mais isolé (`lib/auth.ts` + `lib/api.ts` + backend).

### 🟠 High

- [ ] **Security headers manquants sur les réponses HTML.** Ajouter dans `docker/nginx.conf` :
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (ou CSP `frame-ancestors 'none'`)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- [N/A] **SRI (Subresource Integrity)** — aucun `<script>` third-party dans `index.html`, tout est bundlé par Vite.
- [ ] **CSRF sur mutations state-changing.** Sans SameSite cookies, le seul rempart est l'origin check du CORS. À implémenter en même temps que la migration cookies (item ci-dessus).
- [ ] **CORS allowlist explicite.** Actuellement `origin: config.get('CORS_ORIGIN', 'http://localhost:5173').split(',')` — fallback localhost dangereux en prod. Doit fail-fast si `CORS_ORIGIN` absent en prod, et accepter uniquement `https://apricotonline.ca`.
- [x] **Pas d'error pages framework en prod.** NestJS retourne des erreurs structurées via `PrismaExceptionFilter`. Vite prod build supprime les overlays HMR.

### 🟡 Medium

- [?] **Source maps privés ou intentionnels.** Vérifie ce que produit `npm run build` — si `.map` files sont dans `dist/`, ils seront servis par nginx. Pour les cacher : ne pas les copier dans l'image (`docker/Dockerfile.frontend`) ou ajouter `location ~ \.map$ { deny all; }` dans nginx.
- [N/A] **Autocomplete off sur inputs sensibles** — pas de CVV/MFA à ce stade. Password fields OK avec `autocomplete="new-password"` (déjà fait dans `ProfilePage.tsx`).
- [ ] **Cookies scoped proprement** — applicable après migration cookies. `Path=/`, pas de wildcard subdomain.
- [x] **`rel="noopener noreferrer"` sur liens externes.** Aucun `target="_blank"` détecté.
- [ ] **Aucun debug flag qui fuit vers le client.** Vérifie `grep -RE "console\.(log|debug|warn)" apps/frontend/src` avant de builder prod.

---

## 2. Backend & API

### 🔴 Critical

- [x] **Validation server-side de tous les inputs.** `ValidationPipe` global avec `whitelist: true` + `forbidNonWhitelisted: true` (main.ts:17-19). Rejette les champs inconnus. DTOs class-validator partout.
- [x] **SQL via Prisma parametrized.** Vérifié — les 3 `$queryRaw`/`$executeRaw` (health, csv-import splits, mapping-engine trigram) utilisent des template tags paramétrés Prisma. Pas d'interpolation string.
- [N/A] **NoSQL injection** — Postgres uniquement, pas de MongoDB.
- [x] **Pas de command injection.** `grep -RE "exec\(|spawn\(" apps/backend/src` — 0 shell-out.
- [x] **SSRF** — le backend ne fait aucun `fetch` sortant côté user input. `webhook`, `image proxy`, etc. absent.
- [ ] **Rate limiting sur endpoints auth manquant.** ❌ Aucun `@nestjs/throttler`. Installer + configurer :
  ```bash
  npm i @nestjs/throttler --workspace=@apricot/backend
  ```
  Limites suggérées : `/auth/login` 5/min/IP, `/auth/register` 3/heure/IP, `/auth/password` 10/heure/user. Pourquoi : credential stuffing bots trouveront `/api/auth/login` en 24h.
- [x] **DEBUG désactivé en prod.** `NODE_ENV: production` dans docker-compose.yml. NestJS n'a pas de debug PIN équivalent Flask.

### 🟠 High

- [x] **Authorization vérifiée sur chaque route (multi-tenant).** Revue complète — tous les services filtrent par `userId` dans le `where`. Spot-check :
  - `accounts.service.ts` — ✓ `findOne(userId, id)` puis update par id
  - `transactions.service.ts` — ✓ `where: { id, userId }` partout
  - `budget.service.ts` — ✓ tous les groupBy incluent `userId`
  - `categories.service.ts` — ✓ mergeInto vérifie source ET target ownership
  - `csv-import.service.ts` — ✓ account ownership check avant upload
- [x] **Mass assignment prévenu.** `whitelist: true` sur ValidationPipe rejette les champs non-DTO. Aucun `req.body` passé directement à `.update()`.
- [ ] **⚠️ File uploads : MIME type re-vérifié côté serveur.** Actuellement `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })` — vérifie la taille mais PAS le MIME type ni le magic-bytes. Un attaquant peut uploader n'importe quoi. Ajouter un `fileFilter` :
  ```ts
  fileFilter: (req, file, cb) => {
    const ok = ['text/csv', 'application/vnd.ms-excel', 'text/plain'].includes(file.mimetype);
    cb(ok ? null : new BadRequestException('Type de fichier non autorisé'), ok);
  }
  ```
  Le parser CSV rejettera de toute façon les non-CSV, mais mieux vaut échouer tôt.
- [N/A] **XML/YAML XXE** — pas de parser XML/YAML.
- [x] **JSON responses n'exposent pas de champs sensibles.** `auth.me()` fait un `select` explicite (id, email, displayName, locale, currency). `passwordHash` jamais renvoyé.
- [ ] **Error messages ne fuient pas de stack traces en prod.** `PrismaExceptionFilter` existe — vérifier qu'en `NODE_ENV=production` NestJS ne renvoie pas la stack trace complète. Par défaut NestJS masque en prod ; à confirmer via un test manuel (`curl` avec un mauvais payload → réponse doit être générique).
- [ ] **CORS server-side avec allowlist explicite.** Voir item Frontend #4. Fail-fast si non défini.
- [x] **HTTP methods restreints par route.** Chaque endpoint a un décorateur explicite (`@Get`, `@Post`, etc.). Pas de `@All`.
- [ ] **Timeouts sur requêtes DB.** Prisma n'a pas de timeout par défaut. Ajouter dans le connection string : `connect_timeout=10&statement_timeout=30000` (30s). Pourquoi : une requête lente peut saturer le pool.

### 🟡 Medium

- [x] **Response size bornée** — `take: q.limit ?? 100` dans transactions, `Max(500)` sur le DTO. OK.
- [x] **Pagination sur list endpoints** — transactions ont limit/offset. Budget report couvre 1 mois par nature.
- [ ] **Server info stripé.** Ajouter dans nginx : `server_tokens off;`. Dans main.ts backend : `app.disable('x-powered-by')` (méthode Express sous NestJS : `app.getHttpAdapter().getInstance().disable('x-powered-by')`).
- [N/A] **Batch endpoints limités** — pas d'endpoint bulk pour l'instant.
- [N/A] **Webhooks entrants** — aucun tiers ne pousse vers Apricot.
- [N/A] **Idempotency keys** — pas de paiement.
- [N/A] **GraphQL** — REST uniquement.
- [ ] **`Cache-Control: no-store` sur endpoints sensibles.** Ajouter dans main.ts un middleware global sur `/api/*` : `Cache-Control: no-store, no-cache, must-revalidate`. Pourquoi : évite qu'un proxy en amont cache un `/auth/me`.

---

## 3. Authentication & authorization

### 🔴 Critical

- [x] **Passwords hashés avec bcrypt cost 10.** ⚠️ Cost 10 est acceptable mais un peu bas en 2026 ; **passer à 12** pour meilleure résistance au bruteforce hors-ligne en cas de fuite DB. Fix : `bcrypt.hash(pw, 12)` dans `auth.service.ts` (register + changePassword).
- [ ] **Sessions/tokens invalidés au logout server-side.** ❌ Actuellement logout = `localStorage.removeItem` côté client. Le JWT reste valide 7 jours. Pour invalider server-side : ajouter colonne `passwordChangedAt` sur User, la comparer avec `iat` du JWT dans jwt.strategy.ts. Alternative : store de sessions Redis avec révocation.
- [x] **Chaque route protégée re-vérifie authN ET authZ.** Global guard `JwtAuthGuard` (auth.module.ts:29). Opt-out via `@Public()` uniquement sur login/register/health. AuthZ multi-tenant vérifiée dans services (voir Backend #6).
- [x] **AuthZ inclut object ownership.** Toutes les mutations filtrent par `userId`. Pas d'IDOR détecté.
- [ ] **Password reset ne fuite pas l'existence du compte.** ❌ Pas de flow de reset actuellement. Si tu en ajoutes un plus tard, retourner *toujours* "Si un compte existe, un email a été envoyé", même timing (>=500ms sans await conditionnel).
- [ ] **Rate limit sur auth endpoints.** Voir Backend #6 — `@nestjs/throttler` obligatoire avant exposition.
- [ ] **⚠️ Compte demo par défaut à supprimer en prod.** `prisma/seed.ts` crée `demo@apricot.local / demo1234` si `NODE_ENV !== 'production'`. Vérifie que ta prod NE contient PAS ce user :
  ```sql
  SELECT id, email FROM users WHERE email = 'demo@apricot.local';
  -- Si présent : DELETE FROM users WHERE email = 'demo@apricot.local';
  ```
- [N/A] **OAuth state parameter** — pas d'OAuth.
- [ ] **JWT_SECRET fail-fast si absent ou faible.** ❌ Actuellement fallback silencieux `'change-me-in-env'` dans jwt.strategy.ts:17 et auth.module.ts:18. Un attaquant qui connaît ce défaut (open-source) forge n'importe quel JWT. Fix :
  ```ts
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret.length < 32 || secret === 'change-me-in-env' || secret === 'please-change-me') {
    throw new Error('JWT_SECRET must be set and >= 32 chars in production');
  }
  ```
  Générer un secret : `openssl rand -base64 48`.

### 🟠 High

- [ ] **MFA disponible pour au moins l'admin.** Pas actuellement. Pour un app "toi + amis" avec données financières, TOTP (Google Authenticator) via `otplib` recommandé. Ajouter colonnes `totpSecret` (encrypted) + `totpEnabled` sur User.
- [ ] **Cookies session : `HttpOnly + Secure + SameSite=Strict`.** Après migration cookies (Frontend #5).
- [ ] **JWT hygiène :**
  - [x] Algo vérifié — passport-jwt vérifie signature avec HS256 par défaut, `alg: none` rejeté.
  - [ ] Expiry court — actuellement 7 jours. Pour internet : access token 15min + refresh token 30 jours rotationné.
  - [x] Pas de données sensibles dans le payload — juste `{ sub, email }`.
- [ ] **Enumeration de comptes prévenue partout.** `login` OK ("Identifiants invalides"). Vérifie `register` — actuellement `throw new ConflictException('Email déjà utilisé')` révèle qu'un email est déjà pris. Trade-off : cette UX est standard mais permet d'énumérer. Acceptable si `register` fermé (voir item suivant).
- [ ] **Password policy renforcée.** Actuellement min 8 chars. Pour internet + données financières : min 12 chars, check contre haveibeenpwned (k-anonymity API — envoie juste 5 chars du hash SHA-1). Package : `hibp` ou implémentation maison. Ne pas imposer de règles de complexité arbitraires (NIST 2022).
- [ ] **Slowdown adaptatif après échecs.** À combiner avec throttler : après 5 échecs sur un email, ajouter délai exponentiel. Éviter le lockout dur (permet DoS d'un user légitime).
- [ ] **⚠️ Registration ouverte publiquement.** `/auth/register` est `@Public()`. Sur internet, n'importe qui crée un compte, spam ta DB. **3 options** :
  - **A.** Fermer complètement (retirer route, créer amis via seed SQL)
  - **B.** Code d'invitation obligatoire (`INVITE_CODES=code1,code2` env var)
  - **C.** Whitelist emails (`ALLOWED_EMAILS=...` env var, vérifié dans `register()`)

  Recommandation : **B** — flexible, permet d'inviter des amis sans redéploiement.
- [ ] **Email change / password change requièrent réauth.** Password change : OK (currentPassword vérifié dans changePassword). Email change : pas d'endpoint actuellement — bien.
- [x] **Session fixation prévenue.** Nouveau JWT émis à chaque login (pas de rehydration d'une session existante).
- [N/A] **Admin endpoints séparés.** Pas de rôle admin implémenté.

### 🟡 Medium

- [N/A] **Password reset tokens one-time, short-lived** — pas de reset flow.
- [ ] **Email verification à l'inscription.** Absent. Recommandé si `register` reste ouvert (envoi via SMTP + token temporaire).
- [N/A] **"Remember me" cookies séparés** — pas de fonctionnalité.
- [N/A] **Support login-as-user** — n'existe pas.
- [N/A] **OAuth scopes** — pas d'OAuth.
- [N/A] **API keys utilisateurs** — pas de fonctionnalité.
- [ ] **CSRF tokens sur mutations** — à faire avec migration cookies.
- [ ] **Log des auth events** (login OK/KO, password change, MFA challenge). Actuellement rien. Ajouter avec `pino` :
  ```
  {level: 'info', event: 'auth.login.success', userId, ip, userAgent}
  {level: 'warn', event: 'auth.login.failure', email, ip, userAgent}
  ```

---

## 4. Data protection

### 🔴 Critical

- [ ] **Aucun secret dans le repo git.** Vérifier historique complet :
  ```bash
  cd C:\Users\steph\Documents\Coding\apricot-budget
  git log -p --all | grep -iE "JWT_SECRET|DATABASE_URL|password.*=" | head -50
  # Si un secret apparaît dans l'histoire : le rotor (voir item suivant)
  ```
  Recommande aussi `gitleaks detect` ou `trufflehog git file://.`.
- [x] **`.env` gitignoré.** Vérifié : `.gitignore:8-10` contient `.env` avec exception `!.env.example`.
- [ ] **Secrets chargés depuis env vars, pas de fichier committé.** ✓ ConfigModule lit `.env` — vérifie que le `.env` du NAS n'est ni backupé publiquement ni copié dans l'image Docker (`docker/Dockerfile.backend` ne doit pas `COPY .env`).
- [ ] **Secrets qui ont touché git rotor.** Si tu trouves quoi que ce soit dans l'histoire git (item ci-dessus), rotor immédiatement : nouveau `JWT_SECRET`, nouveau password Postgres. Rewriting git history ne suffit pas — assume que c'est public.
- [ ] **TLS 1.2+ bout en bout.** Client→Cloudflare (géré par Cloudflare, minimum TLS 1.2 par défaut). Cloudflare→NAS : Cloudflare Tunnel utilise TLS. NAS→Postgres : actuellement `sslmode=disable`. Pour internet : `sslmode=require` (mais réseau Docker interne, donc mineur).
- [ ] **Base de données non exposée publiquement.** Vérifier depuis une IP externe :
  ```bash
  # Depuis un autre réseau (téléphone en 4G) :
  nmap -Pn -p 5432,5433 <ip-publique-de-ton-nas>
  # Attendu : "filtered" ou "closed" pour les deux
  ```
  Le NAS Synology par défaut n'expose pas Postgres, mais vérifie que tu n'as pas ouvert le port via l'UI DSM.
- [ ] **Postgres user à privilèges limités.** Actuellement `admin:admin1234` — c'est probablement un superuser. Créer un user applicatif :
  ```sql
  CREATE USER apricot_app WITH PASSWORD '<strong>';
  GRANT CONNECT ON DATABASE apricot_budget_prod TO apricot_app;
  GRANT USAGE ON SCHEMA public TO apricot_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apricot_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO apricot_app;
  ```
  Séparer un `apricot_migrator` (avec CREATE/ALTER/DROP) utilisé uniquement pendant `npx prisma migrate deploy`.
- [ ] **Backups existent ET restore testé.** Deux dimensions :
  - Backup Postgres : `pg_dump` planifié (Synology Task Scheduler ou cron dans un container).
  - Restore testé : monter un container Postgres jetable, restaurer, vérifier le row count. Un backup non testé est une prière.

### 🟠 High

- [?] **Encryption at rest sur Postgres.** Le volume Synology peut être chiffré (BTRFS encrypted shared folder). Vérifier dans DSM → Shared Folder → chiffrement.
- [ ] **PII inventoriée.** Table `transactions` contient descriptions bancaires (peuvent inclure noms de marchands, numéros de compte partiels dans le libellé BNC). Table `users` : email + displayName. Documenter.
- [x] **PII minimisée.** Pas de date de naissance, pas d'adresse, pas de numéro d'assurance sociale stockés.
- [ ] **Champs très sensibles chiffrés au niveau applicatif.** Actuellement `passwordHash` (déjà via bcrypt). Si tu ajoutes TOTP : le `totpSecret` DOIT être chiffré AES-256 en DB (pas juste bcrypt — il faut pouvoir le déchiffrer pour vérifier). Utiliser `crypto` node avec une `ENCRYPTION_KEY` env var séparée du `JWT_SECRET`.
- [N/A] **Payment data non stockée** — pas de paiement.
- [ ] **Backups chiffrés + hors du primary.** Le `pg_dump` doit être GPG-encrypté et copié vers un autre stockage (S3 Glacier, Backblaze B2, ou un second NAS chez un ami).
- [ ] **Data retention policy.** Pour l'instant, tu gardes tout. Si tu ajoutes des logs, définir : logs auth = 90 jours, logs applicatifs = 30 jours.
- [N/A] **Object storage buckets publics** — pas de S3.
- [N/A] **Presigned URLs** — pas de storage cloud.

### 🟡 Medium

- [ ] **DB connections avec TLS.** `sslmode=require` dans DATABASE_URL une fois le certificat serveur configuré côté Postgres.
- [N/A] **Column-level access control** — trop lourd pour cette échelle.
- [ ] **Data export rate-limited.** L'endpoint transactions list a `Max(500)`. Ajouter un rate limit spécifique si tu ajoutes un `?format=csv` un jour.
- [ ] **Deleted user data effacée pour de vrai.** Actuellement DELETE cascade partout — OK. Vérifier que les backups sont purgés après X jours pour éviter la résurrection.
- [N/A] **Third-party data processors** — aucun analytics/tracker.
- [ ] **Log retention respecte PII.** Ne pas logger `req.body` en clair (contient descriptions bancaires).
- [ ] **Secrets ont expiries et runbook rotation.** Documenter :
  - JWT_SECRET : rotation manuelle, invalide toutes les sessions
  - Postgres password : rotation en 2 temps (nouveau user, deploy, retire ancien)
- [ ] **Env vars ne sont PAS dumpées dans error pages / health / debug.** ✓ `/health` renvoie juste `{status, db, time}`.

---

## 5. Infrastructure & deployment

### 🔴 Critical

- [ ] **HTTPS actif avec certificat valide non-expiré.** Cloudflare Tunnel fournit ça automatiquement. Une fois réactivé (`docker compose start cloudflared`), vérifier :
  ```bash
  curl -I https://apricotonline.ca
  # Doit renvoyer HTTP/2 200
  echo | openssl s_client -servername apricotonline.ca -connect apricotonline.ca:443 2>/dev/null | openssl x509 -noout -dates
  # notAfter doit être >30 jours dans le futur
  ```
- [ ] **DNS records minimaux et corrects.** Sur Cloudflare :
  - Vérifier qu'aucun ancien `A` record ne pointe vers l'IP publique du NAS (subdomain takeover potentiel)
  - Ajouter `CAA 0 issue "letsencrypt.org"` pour restreindre qui peut émettre des certs
  - Retirer les records `dev.`, `staging.`, `test.` s'ils existent
- [ ] **Aucun port DB/management ouvert publiquement.** Scanner depuis internet :
  ```bash
  # Depuis 4G / VPN externe :
  nmap -Pn -p 22,80,443,3000,5432,5433,8080,9080,5000,7000 <ip-publique-nas>
  ```
  Attendu : seuls 80/443 répondent (et redirect 80 → 443). Rien d'autre. Le NAS Synology DSM UI (5000/5001) doit être fermé côté externe.
- [ ] **Prod séparée de dev/staging.** Actuellement dev = port 5433, prod = 5432 sur le MÊME serveur. Pour vraie séparation, considère un second container Postgres sur un autre port pour prod, ou différentes DBs sur le même cluster (moins bien mais suffisant pour cette échelle).
- [N/A] **CI/CD secrets scopés** — pas de CI actuellement (deploy manuel via SSH).
- [N/A] **PR untrusted ne déclenche pas prod deploy** — pas de CI.
- [ ] **SSH key-based, pas password-based, sur le NAS.** Vérifier `/etc/ssh/sshd_config` : `PasswordAuthentication no`. Si tu utilises encore un password pour `littleninja@nas`, générer une clé et désactiver.
- [ ] **`.git` et `.env` NON servis par nginx.** Vérifier :
  ```bash
  curl -I https://apricotonline.ca/.git/config
  curl -I https://apricotonline.ca/.env
  # Les deux doivent 404
  ```
  Actuellement l'image frontend ne copie que `dist/` donc `.git`/`.env` ne sont pas dedans — bien. Mais ajoute quand même en défense :
  ```nginx
  location ~ /\. { deny all; return 404; }
  ```

### 🟠 High

- [ ] **Container images minimales et non-root.** Vérifier `docker/Dockerfile.backend` et `docker/Dockerfile.frontend` :
  - Base images : `node:20-alpine` OK (minimal). `nginx:alpine` OK.
  - Ajouter `USER 1000` dans le stage runner (actuellement probablement root)
  - Backend : `node:20-alpine` en runtime — considère `node:20-alpine` avec `--production` install seul, ou distroless
- [ ] **Images scannées CVE avant deploy.** Ajouter à ton workflow :
  ```bash
  docker scout cves apricot-budget/backend:latest
  docker scout cves apricot-budget/frontend:latest
  # Ou avec trivy :
  trivy image apricot-budget/backend:latest
  ```
- [ ] **Base images pinées par digest** — `node:20-alpine@sha256:...` au lieu de `node:20-alpine`. Les tags sont mutables.
- [N/A] **Cloud IAM least privilege** — self-hosted, pas de cloud IAM.
- [x] **WAF/edge protection.** Cloudflare Tunnel inclut Cloudflare WAF gratuit. Activer les règles de base dans Cloudflare Dashboard → Security → WAF.
- [x] **DDoS protection.** Idem — Cloudflare inclut protection L3/L4 gratuite. Ajouter Rate Limiting rules dans Cloudflare pour `/api/auth/*`.
- [ ] **Logs shippés hors-host en temps réel.** Actuellement stdout des containers. Si le NAS est compromis, tout est effacé. Solution simple : `docker-compose logs` copiés périodiquement vers un stockage externe, ou logs vers un stack Grafana Loki self-hosted sur une autre machine.
- [ ] **Backups infra séparés.** Le `docker-compose.yml` et le `.env` du NAS doivent être backés up ailleurs (ex. un chiffré-GPG dans ton Google Drive personnel).
- [N/A] **Kubernetes** — Docker Compose seulement.
- [x] **Health endpoint ne leak pas version.** `/health` renvoie `{status, db, time}` — pas de version.

### 🟡 Medium

- [ ] **Rollback documenté et testé.** Écrire dans `README.md` ou un `RUNBOOK.md` :
  ```
  Rollback : git log --oneline -20 → git checkout <sha> → docker compose build --no-cache && docker compose up -d
  ```
  Et le tester une fois.
- [N/A] **Infra codifiée (Terraform)** — trop lourd pour un NAS solo.
- [x] **NTP synchronisé** — Synology sync l'heure par défaut.
- [N/A] **SPF/DKIM/DMARC** — pas d'envoi d'email.
- [ ] **`robots.txt` intentionnel.** Actuellement inexistant. Pour app privée : ajouter dans `nginx.conf` :
  ```nginx
  location = /robots.txt { return 200 "User-agent: *\nDisallow: /\n"; }
  ```
- [N/A] **OpenAPI/Swagger** — pas exposé.
- [ ] **Timeouts nginx tunés.** Défauts nginx OK pour ce trafic. Ajouter si abus détecté : `client_body_timeout 10s;`, `keepalive_timeout 30s;`.
- [N/A] **Cost alerts cloud** — self-hosted.
- [ ] **Registrar (domaine apricotonline.ca) : 2FA + registrar lock.** Vérifier chez ton registrar (Cloudflare Registrar / Namecheap / etc.) que :
  - MFA est activée sur ton compte
  - "Registrar lock" / "Transfer lock" est ON
  Pourquoi : un hijack de domaine = compromise totale (attaquant reçoit tes emails, points le DNS ailleurs, etc.)

---

## 6. Dependencies & supply chain

### 🔴 Critical

- [x] **Lockfile committé.** `package-lock.json` à la racine et par workspace.
- [ ] **Vulnerability scan green.** Rouler :
  ```bash
  npm audit --workspace=@apricot/backend
  npm audit --workspace=@apricot/frontend
  ```
  Attendu : 0 critical, 0 high sur runtime deps. Si présents, `npm audit fix` puis triage manuel des restants.
- [ ] **Build utilise `--frozen-lockfile` / `npm ci`.** Vérifier `docker/Dockerfile.backend` et `Dockerfile.frontend` : doit utiliser `npm ci` (pas `npm install`) pour reproductible.
- [ ] **Base image rebuilt régulièrement.** Ajouter au calendrier : rebuild `--no-cache` mensuel pour absorber les patches de base image.
- [x] **Pas de `curl | bash` dans Dockerfiles.** À vérifier — reviewer les 2 Dockerfiles.

### 🟠 High

- [ ] **Dependabot / Renovate activé.** Créer `.github/dependabot.yml` :
  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule: { interval: "weekly" }
      open-pull-requests-limit: 5
    - package-ecosystem: "docker"
      directory: "/docker"
      schedule: { interval: "weekly" }
  ```
  Ou l'équivalent GitLab / autre.
- [ ] **Dépendances directes auditées manuellement.** `apps/backend/package.json` — 15 deps directes, revoir chacune : justifiée ? maintenue ? Idem frontend.
- [ ] **⚠️ multer 1.x — CVEs connus.** `multer: ^1.4.5-lts.1` a plusieurs CVE DoS (CVE-2022-24434, CVE-2024-45590). Upgrade vers `multer@^2.0.0` (compatible NestJS 11).
- [ ] **Postinstall scripts audités.** `npm ci --ignore-scripts` en Dockerfile réduit la surface. Vérifier qu'aucune dep légitime ne dépend d'un postinstall (Prisma en a un — `prisma generate` — donc pas d'`--ignore-scripts` full, mais `npm ci --ignore-scripts` + `npx prisma generate` explicite est plus propre).
- [x] **Package names pinés exactement.** `package-lock.json` fait le job.
- [N/A] **Registre privé** — tout est public npm.
- [ ] **License scan.** `npx license-checker --production --summary` — vérifier qu'aucune dep n'est GPL/AGPL (risque juridique pour une app fermée).
- [ ] **SBOM généré.** `npm sbom --sbom-format=cyclonedx > sbom.json` par release.

### 🟡 Medium

- [N/A] **Vérif signatures Sigstore/npm provenance** — écosystème pas encore mainstream.
- [ ] **Transitive deps inspectées sur bump majeurs.** Renovate/Dependabot ne sépare pas — être manuel.
- [x] **Toolchain pinée.** `node:20-alpine` dans les Dockerfiles. Ajoute `.nvmrc` avec `20.x` à la racine pour dev local.
- [ ] **Deps legacy identifiées.** `npm outdated` — quelles deps sont derrière 2+ majors ?
- [N/A] **Third-party SaaS inventoriées** — aucune.
- [N/A] **Reproducible builds** — trop d'effort pour cette échelle.

---

## 7. Monitoring, logging & incident response

### 🔴 Critical

- [ ] **Error tracking activé (Sentry).** Actuellement rien. Setup :
  ```bash
  npm i @sentry/nestjs @sentry/react
  ```
  Frontend : `Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })` dans `main.tsx`. Backend : Sentry NestJS integration. DSN gratuit chez sentry.io (5k events/mois).
- [ ] **Logs structurés vers stockage durable.** Actuellement `console.log` → stdout container → perdu au restart. Solution minimale : `docker-compose.yml` config logging driver `json-file` avec rotation :
  ```yaml
  logging:
    driver: json-file
    options: { max-size: "10m", max-file: "5" }
  ```
  Meilleur : logs vers Grafana Loki self-hosted OU un service SaaS gratuit (Better Stack, Logtail).
- [ ] **Auth events loggés.** Voir Auth #🟡 — implémenter :
  ```
  {event: 'auth.login.success', userId, ip, ua, ts}
  {event: 'auth.login.failure', email, ip, ua, ts}
  {event: 'auth.password.changed', userId, ip, ts}
  ```
- [ ] **Données sensibles scrubbées des logs.** Configurer redaction au niveau du logger (pas au site). Avec `pino` :
  ```ts
  pino({ redact: ['req.headers.authorization', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword'] })
  ```
- [ ] **Un humain est on-call.** C'est toi — mais assure-toi que ton téléphone reçoit les alertes Sentry (push notif). Si tu pars en vacances, un ami "co-admin" avec accès Cloudflare.
- [ ] **Rollback en <5 min prouvé.** Voir Infra 🟡 — teste-le une fois avant le go-live.

### 🟠 High

- [ ] **Alertes sur activité auth anormale.** Sentry / Grafana : alerter si >20 échecs login/heure sur un IP.
- [ ] **Alertes sur error rate + latence.** Sentry alerte quand l'error rate double la baseline. Uptime : alerte si p95 > 2s pendant 5min.
- [ ] **Uptime monitoring externe.** UptimeRobot gratuit pinge `https://apricotonline.ca/health` toutes les 5min et alerte si down. Le monitoring DOIT être hors de ton NAS.
- [ ] **Métriques sur chemins critiques.** Compter login attempts/day, transactions imported/day. Un pic = potentielle attaque ou bug.
- [ ] **Runbook incidents.** Créer `RUNBOOK.md` :
  ```
  ## Rotation JWT_SECRET (invalide toutes les sessions)
  1. Générer : openssl rand -base64 48
  2. Éditer ~/apricot-budget/.env
  3. docker compose restart backend

  ## Rotation password Postgres
  ...

  ## Désactiver register (spam attack)
  1. Éditer apps/backend/src/auth/auth.controller.ts, commenter @Post('register')
  2. git commit && push && pull sur NAS && docker compose build --no-cache backend
  ```
- [ ] **Liste de contacts incident.** Pas ultra pertinent solo, mais :
  - Support Cloudflare (chat 24/7 sur payant, sinon community)
  - Support Synology (si problème hardware)
- [ ] **Backups alertent sur échec.** Le script `pg_dump` doit `set -e` + envoyer email/notif si erreur.
- [ ] **Alertes vulnérabilité deps vers vraie boîte.** Dependabot mail → adresse que tu lis.
- [ ] **Rate limits fire alertes.** Quand throttler déclenche >100/min, log warn + alerte Sentry.

### 🟡 Medium

- [ ] **Anomaly detection log-based.** Grafana Loki + LogQL. Overkill pour ta taille.
- [ ] **Audit log actions admin.** Pas d'admin, mais logger : delete category, delete account, delete transaction avec `{userId, action, resourceType, resourceId, ts}`.
- [ ] **Feature flag / kill-switch sur features risquées.** Ex : env var `DISABLE_REGISTRATION=true` pour couper register sans redeploy. Idem `DISABLE_CSV_IMPORT`.
- [N/A] **Latency budget documenté** — trop early.
- [ ] **Template postmortem prêt.** Fichier `POSTMORTEM_TEMPLATE.md` — même pour un solo, force la clarté après incident.
- [N/A] **Cost anomaly alerts** — self-hosted.
- [N/A] **GDPR notification clock (72h)** — probablement pas concerné (usage privé, non-commercial), mais si tu déclares légalement "amis" ≥100 personnes ça pourrait s'appliquer. Vérifier au cas par cas.
- [N/A] **Log integrity WORM** — overkill.

---

## 🚨 Before you press deploy

Les 5 items à re-vérifier au dernier moment avant d'exposer sur internet :

1. **`JWT_SECRET` est fort (32+ chars aléatoires) ET différent de `.env.example`** — sinon prise de compte triviale.
2. **`docker compose config` ne montre AUCUN secret en clair** — vérifie que `docker inspect apricot-backend | grep JWT` ne fuit rien inattendu.
3. **`nmap -Pn -p 1-10000 <ip-publique-nas>` depuis internet ne renvoie que 80/443.** Rien d'autre.
4. **User `demo@apricot.local` supprimé de la prod DB.** `SELECT * FROM users WHERE email = 'demo@apricot.local';` doit être vide.
5. **`/api/auth/register` fermé ou protégé par code d'invitation.** Sinon spam garanti dans les 48h.

---

## 📝 Notes finales

Cet audit a mitigé **la majorité des erreurs à haute fréquence** qui causent des compromises réelles. **Il ne rend PAS l'app "sécurisée" au sens absolu** — pour ça, un pentest professionnel serait requis (mais overkill pour cette échelle).

Le plus important : **teste ton backup une fois avant d'exposer**. Un backup non-testé est une fiction, et pour des données financières familiales, la perte est aussi grave que la fuite.

Cloudflare Tunnel te donne gratuitement : TLS end-to-end, WAF de base, DDoS L3/L4, hidden origin IP. C'est un excellent gate pour cette taille de déploiement — active-le avant tout le reste.

Ordre suggéré de traitement :
1. **Sprint 1 (2h)** : items critiques faciles — JWT_SECRET, fermer register, throttler, supprimer demo user, `server_tokens off`.
2. **Sprint 2 (4h)** : cookies httpOnly + CSRF, security headers nginx, upgrade multer, password policy renforcée, pg_hba.conf + strong pg password.
3. **Sprint 3 (une semaine)** : Sentry + logging structuré, backups + test restore, monitoring uptime, refresh tokens + rotation.
4. **Sprint 4 (mois 1)** : 2FA TOTP, audit trail table, bcrypt cost 12, SBOM.

**Une fois tout coché, réévalue tous les 3-6 mois** — les CVEs changent, les libs vieillissent.
