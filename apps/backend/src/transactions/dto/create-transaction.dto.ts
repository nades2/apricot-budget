import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  NotEquals,
} from 'class-validator';

export class CreateTransactionDto {
  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsDateString()
  postedAt!: string; // ISO 8601 date (YYYY-MM-DD)

  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  description!: string;

  /** Signed amount: negative = expense, positive = income. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @NotEquals(0, { message: 'amount cannot be zero' })
  amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}
