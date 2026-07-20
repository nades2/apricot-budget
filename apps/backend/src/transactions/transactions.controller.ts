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

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.transactions.remove(user.id, id);
  }
}
