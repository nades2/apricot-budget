import { Module } from '@nestjs/common';
import { RecurrenceDetectorController } from './recurrence-detector.controller';
import { RecurrenceDetectorService } from './recurrence-detector.service';

@Module({
  controllers: [RecurrenceDetectorController],
  providers: [RecurrenceDetectorService],
  exports: [RecurrenceDetectorService],
})
export class RecurrenceDetectorModule {}
