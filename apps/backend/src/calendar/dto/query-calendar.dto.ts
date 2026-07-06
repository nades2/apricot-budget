import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCalendarDto {
  /** Start of the range, inclusive. ISO date (YYYY-MM-DD). */
  @IsDateString()
  from!: string;

  /** End of the range, inclusive. ISO date (YYYY-MM-DD). */
  @IsDateString()
  to!: string;

  /** Optional restriction to a single account. */
  @IsOptional()
  @IsUUID()
  accountId?: string;

  /** How many transactions to inline per day cell (rest goes into overflowCount). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topPerDay?: number = 3;
}
