import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * PATCH transaction — pour l instant on autorise :
 *   - categoryId (null explicite = decategoriser)
 *   - notes
 *   - learnRule (crée une CsvMappingRule EXACT quand true + categoryId non-null)
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

  /**
   * Opt-in : si true et categoryId est un UUID (pas null), le service crée
   * (ou upsert) une règle de mapping EXACT sur la description de la
   * transaction, pointant vers la nouvelle catégorie. Les imports CSV
   * futurs classeront automatiquement toute transaction de description
   * identique dans cette catégorie.
   *
   * Ignoré silencieusement si categoryId absent ou null.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  learnRule?: boolean;
}
