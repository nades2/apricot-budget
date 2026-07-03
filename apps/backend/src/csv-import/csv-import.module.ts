import { Module } from '@nestjs/common';
import { CsvImportController } from './csv-import.controller';
import { CsvImportService } from './csv-import.service';
import { CsvParserService } from './csv-parser.service';
import { MappingEngineService } from './mapping-engine.service';

@Module({
  controllers: [CsvImportController],
  providers: [CsvImportService, CsvParserService, MappingEngineService],
  exports: [CsvImportService],
})
export class CsvImportModule {}
