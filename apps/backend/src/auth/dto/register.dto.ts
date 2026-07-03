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
}
