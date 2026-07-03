import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All categories visible to a user: system categories + user's own. */
  findAllVisibleTo(userId: string) {
    return this.prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.category
      .findFirst({
        where: { id, OR: [{ userId: null }, { userId }] },
      })
      .then((c) => {
        if (!c) throw new NotFoundException(`Catégorie ${id} introuvable`);
        return c;
      });
  }

  create(userId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        slug: dto.slug ?? this.slugify(dto.name),
        direction: dto.direction,
        icon: dto.icon,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 500,
        isSystem: false,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { id, userId }, // only user's own — system categories are locked
    });
    if (!existing) throw new NotFoundException(`Catégorie ${id} introuvable ou non modifiable`);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException(`Catégorie ${id} introuvable ou non supprimable`);
    return this.prisma.category.delete({ where: { id } });
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
