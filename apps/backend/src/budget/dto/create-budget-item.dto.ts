import { BudgetDirection, BudgetRecurrence } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateBudgetItemDto {
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEnum(BudgetDirection)
  direction!: BudgetDirection;

  /** Positive amount; direction gives the sign. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsEnum(BudgetRecurrence)
  recurrence!: BudgetRecurrence;

  /** ISO date. For monthly items = day of month; for weekly = day of week; etc. */
  @IsDateString()
  anchorDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
