import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.categories.findAllVisibleTo(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.categories.findOne(user.id, id);
  }

  /**
   * Compte les usages d'une catégorie (tx, splits, budget items, rules).
   * Le frontend l'appelle avant d'ouvrir le dialog de suppression pour
   * décider : delete direct si tout est à 0, sinon proposer réassignation.
   */
  @Get(':id/usage')
  usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.categories.usageCounts(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(user.id, id, dto);
  }

  /**
   * Fusionne toutes les références d'une catégorie source vers une cible,
   * puis supprime la source. Atomique. Utile pour retirer une catégorie
   * user-created (ex. "Remboursement Assurance") en migrant ses tx vers
   * la catégorie dépense d'origine (ex. Santé), sans laisser les tx en
   * Non-catégorisées.
   */
  @Post(':id/merge-into/:targetId')
  mergeInto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('targetId', new ParseUUIDPipe()) targetId: string,
  ) {
    return this.categories.mergeInto(user.id, id, targetId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.categories.remove(user.id, id);
  }
}
