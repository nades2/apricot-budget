import { PartialType } from '@nestjs/mapped-types';
import { CreateBudgetItemDto } from './create-budget-item.dto';

export class UpdateBudgetItemDto extends PartialType(CreateBudgetItemDto) {}
