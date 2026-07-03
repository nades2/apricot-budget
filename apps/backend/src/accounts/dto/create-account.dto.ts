import { AccountSubtype, AccountType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsEnum(AccountSubtype)
  subtype!: AccountSubtype;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  accountNumber?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  initialBalance?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}
