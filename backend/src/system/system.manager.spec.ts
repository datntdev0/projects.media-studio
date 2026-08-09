import { NodeEnv } from '../core/config/configuration';
import { AppConfigService } from '../core/config/app-config.service';
import { SERVICE_NAME, SERVICE_VERSION } from '../core/service-metadata';
import { HealthStatus } from './dto/health.dto';
import { SystemManager } from './system.manager';

/**
 * A manager is framework-free, so its spec needs no Nest fixture — a stub
 * standing in for the typed config reader is enough.
 */
function managerWith(nodeEnv: NodeEnv): SystemManager {
  return new SystemManager({ nodeEnv } as AppConfigService);
}

describe('SystemManager', () => {
  describe('getInfo', () => {
    it('identifies the service from its manifest', () => {
      expect(managerWith(NodeEnv.Development).getInfo()).toMatchObject({
        name: SERVICE_NAME,
        version: SERVICE_VERSION,
      });
    });

    it('reports the environment it is running in', () => {
      expect(managerWith(NodeEnv.Production).getInfo().environment).toBe(
        NodeEnv.Production,
      );
    });

    it('names the API version serving the response', () => {
      expect(managerWith(NodeEnv.Test).getInfo().apiVersion).toBe('v1');
    });
  });

  describe('getHealth', () => {
    it('reports the process as serving', () => {
      expect(managerWith(NodeEnv.Test).getHealth().status).toBe(
        HealthStatus.Ok,
      );
    });

    it('reports uptime as whole seconds', () => {
      const { uptimeSeconds } = managerWith(NodeEnv.Test).getHealth();

      expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(uptimeSeconds)).toBe(true);
    });
  });
});
