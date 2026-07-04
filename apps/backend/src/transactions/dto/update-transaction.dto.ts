import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

/**
 * PATCH transaction — pour l instant on autorise :
 *   - categoryId (null explicite = decategoriser)
 *   - notes
 * On ajoutera description/montant si un jour on veut permettre l edition.
 */
export class UpdateTransactionDto {
  /**
   * `null` = decategoriser explicitement.
   * `undefined` = pas de changement.
   * `uuid` = nouvelle categorie.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
