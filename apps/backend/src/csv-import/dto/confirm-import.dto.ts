import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One entry per row the user reviewed. If `categoryId` is omitted, the
 * server keeps whichever suggestion was computed at upload time. If
 * `saveAsRule` is true, an EXACT mapping rule is persisted so future imports
 * auto-apply this category.
 */
export class RowMappingDto {
  @IsInt()
  @Min(0)
  rowIndex!: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  saveAsRule?: boolean;
}

export class ConfirmImportDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => RowMappingDto)
  mappings!: RowMappingDto[];
}
