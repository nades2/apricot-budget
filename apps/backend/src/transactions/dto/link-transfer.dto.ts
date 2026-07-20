import { IsUUID } from 'class-validator';

/**
 * PUT /transactions/:id/link — link two transactions as a transfer pair.
 * The two transactions must be in DIFFERENT accounts, have equal-magnitude
 * amounts of OPPOSITE sign (e.g. -500 on checking ↔ +500 on the CC), and
 * be dated within the transfer window (see service constant).
 */
export class LinkTransferDto {
  @IsUUID()
  targetTransactionId!: string;
}
