import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateSplitsDto } from './dto/update-splits.dto';
import { LinkTransferDto } from './dto/link-transfer.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: QueryTransactionsDto) {
    return this.transactions.findAll(user.id, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.transactions.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransactionDto) {
    return this.transactions.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(user.id, id, dto);
  }

  /**
   * Remplace atomiquement la liste des splits d'une transaction.
   * Le corps doit contenir au moins 1 split ; la somme des `amount` doit
   * égaler exactement le montant de la transaction et partager son signe.
   */
  @Put(':id/splits')
  replaceSplits(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSplitsDto,
  ) {
    return this.transactions.replaceSplits(user.id, id, dto);
  }

  /**
   * Détection auto de transferts (paiements CC). Parcourt tout l'historique
   * du user et lie automatiquement les paires évidentes (mêmes catégorie
   * "Paiement carte de crédit", comptes différents, montants opposés, dates
   * à ±3j). Renvoie le nombre de liaisons créées et la liste des cas ambigus.
   *
   * Utilisé comme migration one-shot manuelle (bouton d'admin) et aussi
   * appelé automatiquement lors du confirm d'un import CSV (avec un scope
   * restreint à la fenêtre du batch).
   */
  @Post('detect-transfers')
  detectTransfers(@CurrentUser() user: AuthenticatedUser) {
    return this.transactions.detectAndLinkTransfers(user.id, { mode: 'all' });
  }

  /**
   * Lie deux transactions comme paire de transfert (paiement CC, virement
   * entre chèques et épargne, etc.). Une fois liées, elles ne compteront
   * plus dans les rapports catégoriels.
   */
  @Put(':id/link')
  linkTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LinkTransferDto,
  ) {
    return this.transactions.linkAsTransfer(user.id, id, dto);
  }

  /** Délie une transaction de sa contrepartie de transfert. */
  @Delete(':id/link')
  unlinkTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.transactions.unlinkTransfer(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.transactions.remove(user.id, id);
  }
}
