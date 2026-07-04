import { Module } from '@nestjs/common';
import { CsvImportController } from './csv-import.controller';
import { CsvImportService } from './csv-import.service';
import { CsvParserService } from './csv-parser.service';
import { MappingEngineService } from './mapping-engine.service';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
  imports: [ReconciliationModule],
  controllers: [CsvImportController],
  providers: [CsvImportService, CsvParserService, MappingEngineService],
  exports: [CsvImportService],
})
export class CsvImportModule {}
