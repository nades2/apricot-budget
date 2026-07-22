import { ConfigService } from '@nestjs/config';

/**
 * Défauts historiques qui ont pu se retrouver dans `.env` par copie du
 * `.env.example` — refuse d'utiliser ces valeurs. Un attaquant qui connaît
 * ces defaults (open-source) pourrait forger des JWT arbitraires.
 */
const KNOWN_WEAK_SECRETS = new Set([
  'change-me-in-env',
  'please-change-me',
  'please-change-me-too',
  'secret',
  'jwtsecret',
  'apricot',
]);

/**
 * Longueur minimale du secret : 32 octets = 256 bits d'entropie, aligné
 * avec la taille de clé HMAC-SHA256 utilisée par les JWT HS256.
 */
const MIN_SECRET_LENGTH = 32;

/**
 * Récupère `JWT_SECRET` depuis la config et valide qu'il est utilisable
 * en production. Fail-fast au démarrage — un secret invalide fait planter
 * l'app plutôt que d'accepter silencieusement un fallback dangereux.
 *
 * En développement (`NODE_ENV !== 'production'`) on tolère un secret court
 * ou faible mais on log un warn, pour permettre `npm run start:dev` sans
 * setup complet.
 *
 * Génère un secret solide avec :  openssl rand -base64 48
 */
export function loadJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  const isProd = config.get<string>('NODE_ENV') === 'production';

  if (!secret || secret.trim() === '') {
    const msg = 'JWT_SECRET is not defined. Set it in .env (generate with `openssl rand -base64 48`).';
    if (isProd) throw new Error(msg);
    // eslint-disable-next-line no-console
    console.warn(`[auth] ${msg} — dev mode: using a random ephemeral secret. Sessions will not survive restart.`);
    // Secret éphémère aléatoire — invalide tous les tokens au restart mais évite
    // d'utiliser une valeur devinable en dev.
    return require('node:crypto').randomBytes(48).toString('base64');
  }

  if (KNOWN_WEAK_SECRETS.has(secret.toLowerCase())) {
    const msg = `JWT_SECRET matches a known-weak default ("${secret}"). Rotate immediately.`;
    if (isProd) throw new Error(msg);
    // eslint-disable-next-line no-console
    console.warn(`[auth] ${msg} — dev mode: allowing but do NOT ship this to prod.`);
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    const msg = `JWT_SECRET is too short (${secret.length} chars). Minimum ${MIN_SECRET_LENGTH} chars required.`;
    if (isProd) throw new Error(msg);
    // eslint-disable-next-line no-console
    console.warn(`[auth] ${msg} — dev mode: allowing but do NOT ship this to prod.`);
  }

  return secret;
}
