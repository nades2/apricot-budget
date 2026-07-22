import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  displayName?: string;

  /**
   * Code d'invitation — requis en production quand `INVITE_CODES` est défini.
   * Le service valide la présence conditionnelle : si la config a des codes,
   * ce champ devient obligatoire ; sinon (dev sans config), il est ignoré.
   */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  inviteCode?: string;
}
