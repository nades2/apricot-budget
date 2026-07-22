import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { loadJwtSecret } from './jwt-secret';

/**
 * Reads the `Authorization: Bearer <jwt>` header, verifies the signature, and
 * attaches `{ id, email }` to `req.user`.  The @CurrentUser() decorator reads
 * from there — controllers stay identical to the previous demo middleware.
 *
 * Le secret est validé au démarrage par `loadJwtSecret` (fail-fast si absent
 * ou faible en production).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: loadJwtSecret(config),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
