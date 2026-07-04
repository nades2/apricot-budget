import { Body, Controller, Post } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { ReconciliationService } from './reconciliation.service';
import { RerunReconciliationDto } from './dto/rerun-reconciliation.dto';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reco: ReconciliationService) {}

  /**
   * POST /api/reconciliation/rerun
   * body: { from, to, accountId? }
   *
   * Relance la reconciliation sur une fenetre arbitraire. Utile apres avoir
   * edite manuellement une regle BudgetItem (RRULE, montant) — l historique
   * n est pas re-genere automatiquement.
   */
  @Post('rerun')
  rerun(@CurrentUser() user: AuthenticatedUser, @Body() body: RerunReconciliationDto) {
    return this.reco.reconcile(user.id, {
      accountId: body.accountId,
      from: new Date(body.from),
      to: new Date(body.to),
    });
  }
}
