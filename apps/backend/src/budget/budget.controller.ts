import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BudgetService } from './budget.service';
import { CreateBudgetItemDto } from './dto/create-budget-item.dto';
import { UpdateBudgetItemDto } from './dto/update-budget-item.dto';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';

@Controller('budget')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get('items')
  listItems(@CurrentUser() user: AuthenticatedUser) {
    return this.budget.listItems(user.id);
  }

  @Post('items')
  createItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBudgetItemDto) {
    return this.budget.createItem(user.id, dto);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBudgetItemDto,
  ) {
    return this.budget.updateItem(user.id, id, dto);
  }

  @Delete('items/:id')
  removeItem(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.budget.removeItem(user.id, id);
  }

  @Get('presets')
  presets(@CurrentUser() user: AuthenticatedUser) {
    return this.budget.presets(user.id);
  }

  /**
   * GET /api/budget/report?month=2025-12
   */
  @Get('report')
  report(@CurrentUser() user: AuthenticatedUser, @Query('month') month: string) {
    // month is validated at the DB query stage; also enforce a rough shape here.
    const m = /^\d{4}-\d{2}$/.test(month ?? '') ? month : new Date().toISOString().slice(0, 7);
    return this.budget.monthlyReport(user.id, m);
  }
}
