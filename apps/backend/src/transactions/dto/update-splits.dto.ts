import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * One line of a transaction split.
 *
 * `amount` is signed with the same convention as the parent transaction:
 *   - negative = money OUT (part of an expense)
 *   - positive = money IN  (part of an income)
 *
 * The service enforces that all splits share the sign of the parent
 * (no mixed-sign splits in Phase 2 — refunds live in a separate
 * transaction as they do in the bank CSV).
 */
export class SplitLineDto {
  /** `null` or `undefined` = "Non catégorisé". */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  /** Signed amount, non-zero, up to 2 decimal places. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @NotEquals(0, { message: 'split amount cannot be zero' })
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Optional stable ordering hint. Defaults server-side to array index. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * PUT /transactions/:id/splits — replaces ALL splits of a transaction atomically.
 * The sum of split amounts must equal the parent transaction's `amount`
 * (exact Decimal comparison, no float tolerance).
 */
export class UpdateSplitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitLineDto)
  splits!: SplitLineDto[];
}
