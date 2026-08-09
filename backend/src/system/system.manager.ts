import { Injectable } from '@nestjs/common';
import { API_VERSION } from '../core/api.constants';
import { AppConfigService } from '../core/config/app-config.service';
import { SERVICE_NAME, SERVICE_VERSION } from '../core/service-metadata';
import { HealthDto, HealthStatus } from './dto/health.dto';
import { ServiceInfoDto } from './dto/service-info.dto';

/**
 * What the service can say about itself.
 *
 * A manager, not a service: it holds the rules, the controllers only expose
 * them over HTTP. Framework-free on purpose — no request, no response, so its
 * specs need no Nest fixture.
 */
@Injectable()
export class SystemManager {
  constructor(private readonly config: AppConfigService) {}

  getInfo(): ServiceInfoDto {
    return {
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: this.config.nodeEnv,
      apiVersion: `v${API_VERSION}`,
    };
  }

  getHealth(): HealthDto {
    return {
      status: HealthStatus.Ok,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
