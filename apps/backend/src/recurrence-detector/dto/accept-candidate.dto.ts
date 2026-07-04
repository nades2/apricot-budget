import { BudgetDirection, BudgetRecurrence } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * DTO en miroir de DetectedRecurrence — le frontend renvoie exactement ce
 * qu'il a reçu, plus d'éventuels overrides utilisateur.
 */
export class DetectedRecurrenceDto {
  @IsString()
  key!: string;

  @IsString()
  suggestedName!: string;

  @IsString()
  normalizedDescription!: string;

  @IsArray()
  @IsString({ each: true })
  matchingDescriptions!: string[];

  @IsEnum(BudgetDirection)
  direction!: BudgetDirection;

  @IsEnum(BudgetRecurrence)
  recurrence!: BudgetRecurrence;

  @IsNumberString()
  avgAmount!: string;

  @IsNumberString()
  amountStdev!: string;

  @IsInt()
  medianIntervalDays!: number;

  @IsNumber()
  intervalStdevDays!: number;

  @IsInt()
  @Min(1)
  occurrences!: number;

  @IsDateString()
  firstSeen!: string;

  @IsDateString()
  lastSeen!: string;

  @IsDateString()
  nextExpected!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  confidence!: number;

  @IsOptional()
  @IsUUID()
  categoryId!: string | null;

  @IsArray()
  @IsUUID('4', { each: true })
  suggestedTransactionIds!: string[];
}

export class AcceptOverridesDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  accountId?: string | null;

  @IsOptional()
  @IsNumberString()
  amount?: string;

  @IsOptional()
  @IsDateString()
  anchorDate?: string;
}

export class AcceptCandidateDto {
  @ValidateNested()
  @Type(() => DetectedRecurrenceDto)
  candidate!: DetectedRecurrenceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AcceptOverridesDto)
  overrides?: AcceptOverridesDto;
}
