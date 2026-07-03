import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

export type AuthenticatedUser = { id: string };

/**
 * `@CurrentUser() user: AuthenticatedUser` — pulled from `req.user`, set by
 * DemoUserMiddleware today, by JwtStrategy tomorrow.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!req.user) throw new UnauthorizedException('No user attached to request');
    return req.user;
  },
);
