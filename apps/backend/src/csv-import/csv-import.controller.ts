import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsvImportService } from './csv-import.service';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';

@Controller('csv-imports')
export class CsvImportController {
  constructor(private readonly imports: CsvImportService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.imports.list(user.id);
  }

  /**
   * POST /api/csv-imports?accountId=<uuid>
   * multipart/form-data with a `file` field.
   *
   * Returns the CsvImport record with rawPayload containing rows + suggestions.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountId', new ParseUUIDPipe()) accountId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.upload(user.id, accountId, file);
  }

  @Get(':id')
  preview(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.preview(user.id, id);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmImportDto,
  ) {
    return this.imports.confirm(user.id, id, dto);
  }

  @Delete(':id')
  rollback(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.rollback(user.id, id);
  }
}
