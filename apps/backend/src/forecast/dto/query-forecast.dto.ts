import { IsDateString, IsNumberString, IsOptional } from 'class-validator';

export class QueryForecastDto {
  /** Début de la fenêtre, inclusif. ISO (YYYY-MM-DD). */
  @IsDateString()
  from!: string;

  /** Fin de la fenêtre, inclusive. ISO (YYYY-MM-DD). */
  @IsDateString()
  to!: string;

  /**
   * Seuil optionnel : les jours dont le solde projeté passe sous ce montant
   * seront marqués `belowThreshold: true` (utile pour surligner en rouge dans
   * le graphique). Exprimé comme string pour préserver la précision Decimal.
   */
  @IsOptional()
  @IsNumberString()
  lowBalanceThreshold?: string;
}
