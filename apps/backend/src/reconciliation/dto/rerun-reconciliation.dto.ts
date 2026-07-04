import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class RerunReconciliationDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}
