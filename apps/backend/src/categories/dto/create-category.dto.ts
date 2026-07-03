import { CategoryDirection } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug: lowercase letters, digits, dashes only' })
  @Length(1, 60)
  slug?: string;

  @IsEnum(CategoryDirection)
  direction!: CategoryDirection;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
