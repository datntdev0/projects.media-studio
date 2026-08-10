import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SYSTEM_PATH } from '../core/api.constants';
import { ServiceInfoDto } from './dto/service-info.dto';
import { SystemManager } from './system.manager';

/**
 * `/system` — outside the prefix and outside the version.
 *
 * What the service is does not change shape from one API version to the next,
 * and a client checking which build it is talking to should not have to pick a
 * version to ask. `VERSION_NEUTRAL` drops the `/v1` that versioned routes carry,
 * and `configureApp` excludes this path from the `/api` prefix.
 */
@ApiTags('System')
@Controller({ path: SYSTEM_PATH, version: VERSION_NEUTRAL })
export class SystemController {
  constructor(private readonly system: SystemManager) {}

  @Get()
  @ApiOperation({ summary: 'Service information', description: 'Identifies the service, its build, the API version it serves by default, and what its stored record says about this deployment.' })
  @ApiOkResponse({ type: ServiceInfoDto })
  getInfo(): Promise<ServiceInfoDto> {
    return this.system.getInfo();
  }
}
