import { IsString, MinLength } from 'class-validator';

/**
 * PATCH /auth/password — changement de mot de passe pour l'utilisateur
 * authentifié. Exige le mot de passe actuel pour éviter qu'un token volé
 * ne permette de "prendre" le compte définitivement en changeant le pass.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1) // pas de MinLength strict — on veut juste qu'il soit fourni
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' })
  newPassword!: string;
}
