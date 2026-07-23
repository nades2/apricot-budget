import { IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';
import { TaxBundleKind } from '../presets';

export class CreateTaxesBundleDto {
  /** Quelle taxe créer (scolaire ou municipale). */
  @IsIn(['scolaire', 'municipale'])
  kind!: TaxBundleKind;

  /** Total annuel de la facture. Sera divisé également entre les versements. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annualTotal!: number;

  /** Année civile pour laquelle créer les versements. */
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}
