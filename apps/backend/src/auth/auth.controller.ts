import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './public.decorator';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';

/**
 * Rate limiting sur les endpoints auth — protège contre credential stuffing
 * et spam de comptes. Les limites overridees ici remplacent celles définies
 * globalement dans AppModule pour ces routes spécifiques.
 *
 * Les valeurs sont par IP. Un `429 Too Many Requests` est renvoyé au-delà,
 * avec un header `Retry-After`. Ajuster si trop strict après observation.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 tentatives / min / IP
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) // 3 créations / heure / IP
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** Returns the profile of the currently authenticated user. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  /**
   * Changement de mot de passe. Exige le mot de passe actuel + un nouveau
   * (min 8 chars, différent de l'actuel). Ne renvoie pas de nouveau token —
   * la session courante reste valide.
   */
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } }) // 10 changements / heure / user
  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, dto);
  }
}
