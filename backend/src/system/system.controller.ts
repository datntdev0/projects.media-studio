import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceInfoDto } from './dto/service-info.dto';
import { SystemManager } from './system.manager';

/** `/api/v1/system` — the prefix and version come from main.ts. */
@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemManager) {}

  @Get()
  @ApiOperation({
    summary: 'Service information',
    description:
      'Identifies the service, its build and the API version serving it.',
  })
  @ApiOkResponse({ type: ServiceInfoDto })
  getInfo(): ServiceInfoDto {
    return this.system.getInfo();
  }
}
