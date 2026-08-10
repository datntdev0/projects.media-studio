import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HEALTH_PATH } from '../core/api.constants';
import { HealthDto } from './dto/health.dto';
import { SystemManager } from './system.manager';

/**
 * `/health` — outside the prefix and outside the version.
 *
 * Liveness is not part of the API's contract with clients: orchestrators and
 * load balancers should not have to know which API version is current.
 * `VERSION_NEUTRAL` drops the `/v1`, and `configureApp` excludes this path from
 * the `/api` prefix.
 */
@ApiTags('System')
@Controller({ path: HEALTH_PATH, version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly system: SystemManager) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: HealthDto })
  getHealth(): HealthDto {
    return this.system.getHealth();
  }
}
