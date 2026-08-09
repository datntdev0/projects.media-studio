import { NodeEnv } from '../core/config/configuration';
import { HealthDto, HealthStatus } from './dto/health.dto';
import { ServiceInfoDto } from './dto/service-info.dto';
import { HealthController } from './health.controller';
import { SystemController } from './system.controller';
import { SystemManager } from './system.manager';

const info: ServiceInfoDto = {
  name: '@media-studio/backend',
  version: '1.2.3',
  environment: NodeEnv.Test,
  apiVersion: 'v1',
};

const health: HealthDto = { status: HealthStatus.Ok, uptimeSeconds: 42 };

function managerStub() {
  const getInfo = jest.fn().mockReturnValue(info);
  const getHealth = jest.fn().mockReturnValue(health);

  return {
    getInfo,
    getHealth,
    manager: { getInfo, getHealth } as unknown as SystemManager,
  };
}

/**
 * Controllers are HTTP adapters and nothing else, so what is worth asserting is
 * that they hand the work to the manager and return what it gave them —
 * anything computed here would be a rule in the wrong layer.
 */
describe('SystemController', () => {
  it('returns what the manager reports', () => {
    const { manager, getInfo } = managerStub();

    expect(new SystemController(manager).getInfo()).toBe(info);
    expect(getInfo).toHaveBeenCalledTimes(1);
  });
});

describe('HealthController', () => {
  it('returns what the manager reports', () => {
    const { manager, getHealth } = managerStub();

    expect(new HealthController(manager).getHealth()).toBe(health);
    expect(getHealth).toHaveBeenCalledTimes(1);
  });
});
