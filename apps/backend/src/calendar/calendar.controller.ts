import { Controller, Get, Query } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /**
   * GET /api/calendar?from=2025-12-01&to=2025-12-31[&accountId=...][&topPerDay=3]
   *
   * Returns one entry per day in the range, with totals and the top transactions
   * inlined for the calendar cell view (30-day sliding or 7-day week).
   */
  @Get()
  build(@CurrentUser() user: AuthenticatedUser, @Query() q: QueryCalendarDto) {
    return this.calendar.build(user.id, q);
  }
}
