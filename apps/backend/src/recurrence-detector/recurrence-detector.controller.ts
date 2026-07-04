import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { RecurrenceDetectorService } from './recurrence-detector.service';
import { AcceptCandidateDto } from './dto/accept-candidate.dto';

@Controller('recurrence-detector')
export class RecurrenceDetectorController {
  constructor(private readonly detector: RecurrenceDetectorService) {}

  /**
   * GET /api/recurrence-detector?windowDays=365[&accountId=uuid]
   *
   * Retourne la liste des récurrences détectées dans l'historique récent
   * de l'utilisateur, non encore couvertes par un BudgetItem actif.
   */
  @Get()
  detect(
    @CurrentUser() user: AuthenticatedUser,
    @Query('windowDays') windowDays?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.detector.detect(user.id, {
      windowDays: windowDays ? Math.min(1095, Math.max(30, Number(windowDays))) : undefined,
      accountId,
    });
  }

  /**
   * POST /api/recurrence-detector/accept
   *
   * Convertit un candidat détecté en `BudgetItem`. Le frontend renvoie
   * l'objet candidat tel que reçu, plus des overrides optionnels si
   * l'utilisateur a modifié la proposition.
   */
  @Post('accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Body() body: AcceptCandidateDto) {
    return this.detector.accept(user.id, {
      candidate: body.candidate,
      overrides: body.overrides,
    });
  }
}
