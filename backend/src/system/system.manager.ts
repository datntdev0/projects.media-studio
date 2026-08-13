import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { API_VERSION } from '../core/api.constants';
import { AppConfigService } from '../core/config/app-config.service';
import { QueueTopic } from '../core/queues/queue.messages';
import { QueueProducer } from '../core/queues/queue.producer';
import { SERVICE_NAME, SERVICE_VERSION } from '../core/service-metadata';
import { FirebaseStatus, HealthDto, HealthStatus } from './dto/health.dto';
import { ServiceInfoDto } from './dto/service-info.dto';
import { SCHEMA_VERSION, SystemRecord } from './entities/system-info.entity';
import { SystemBuild, SystemRepository } from './system.repository';

/**
 * How long the boot record has to land before the log says the database is not
 * there. The Firestore client retries an unreachable backend for minutes without
 * complaining, which is the right instinct for a request and useless as a
 * start-up signal — nothing is waiting on this write, so the only thing it can
 * do wrong is stay quiet.
 */
const RECORD_DEADLINE_MS = 10_000;

/**
 * How long Firestore has to answer the health probe before it counts as down.
 * Short, because something is waiting on this one: `/health` is polled, and a
 * probe that hangs as long as the client will wait is a probe that reports
 * nothing. Same retrying client as above, so the deadline is the only answer it
 * will give in time.
 */
const PROBE_DEADLINE_MS = 2_000;

/**
 * What the service can say about itself.
 *
 * A manager, not a service: it holds the rules, the controllers only expose them
 * over HTTP. Framework-free apart from the boot hook — no request, no response,
 * so its specs need no Nest fixture.
 */
@Injectable()
export class SystemManager implements OnModuleInit {
  private readonly logger = new Logger(SystemManager.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly repository: SystemRepository,
    private readonly producer: QueueProducer,
  ) {}

  /**
   * Every boot leaves a mark — but not at the cost of the boot.
   *
   * Deliberately not awaited. `NestFactory.create` does not resolve until every
   * init hook has, so awaiting an unreachable Firestore holds the process short
   * of `listen`, and with `bufferLogs` on, it does it in total silence. Worse,
   * it would take `/health` down with it, which is precisely the endpoint that
   * has to answer when the database does not.
   */
  onModuleInit(): void {
    void this.recordStart();
    void this.announceStart();
  }

  async getInfo(): Promise<ServiceInfoDto> {
    // Absent only if the document was removed after boot. Writing it again is a
    // truer answer than a 500 over a record the service can recreate.
    const record = (await this.repository.read()) ?? (await this.repository.recordStart(this.build));

    return publicView(record);
  }

  /**
   * Liveness, and what the process can see of Firebase.
   *
   * `status` stays `ok` while Firebase is `down` on purpose: it answers for this
   * process, and an orchestrator that restarted the API because the database was
   * unreachable would take down the endpoint saying so. Whatever needs the
   * database reads `firebaseStatus`.
   */
  async getHealth(): Promise<HealthDto> {
    return {
      status: HealthStatus.Ok,
      uptimeSeconds: Math.floor(process.uptime()),
      firebaseStatus: await this.probeFirebase(),
    };
  }

  /** This build, as the record stores it. */
  private get build(): SystemBuild {
    return {
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      environment: this.config.nodeEnv,
      apiVersion: `v${API_VERSION}`,
    };
  }

  /**
   * Whether Firestore answers, as one bounded read.
   *
   * The system document rather than a synthetic ping: it is what `/system` reads,
   * so `up` means the database this service actually uses answered. A document
   * that is not there still counts — Firestore had to answer to say so.
   *
   * The failure is not logged. This endpoint is polled, and a database that is
   * down would write the same line every few seconds; `/system` and the boot
   * record are where a reason belongs.
   */
  private async probeFirebase(): Promise<FirebaseStatus> {
    const answered = this.repository
      .read()
      .then(() => true)
      .catch(() => false);

    return (await Promise.race([answered, expiresAfter(PROBE_DEADLINE_MS)])) ? FirebaseStatus.Up : FirebaseStatus.Down;
  }

  /**
   * The sample send: one message per boot, which both sample consumers pick up —
   * see `sample.handler.ts`.
   *
   * A manager producing a topic it does not own the consequences of is the whole
   * pattern, and this is the seam to copy. It names no queue and waits on no
   * handler; what runs is `QUEUE_CONSUMERS`'s business.
   *
   * Its failure is a warning rather than a throw. Nothing is waiting on the
   * message, and a Redis that is not up yet should not be what stops the boot.
   */
  private async announceStart(): Promise<void> {
    try {
      await this.producer.send(QueueTopic.SamplePinged, { note: `${SERVICE_NAME} ${SERVICE_VERSION} started`, sentBy: SystemManager.name });
    } catch (cause: unknown) {
      this.logger.warn('Could not send the sample message — check that Redis is reachable', cause);
    }
  }

  /** Writes the record, and makes sure a failure to is heard either way. */
  private async recordStart(): Promise<void> {
    const written = this.repository
      .recordStart(this.build)
      .then(() => true)
      .catch((cause: unknown) => {
        this.logger.error('Could not record this start in Firestore', cause);

        // Reported, so the deadline below has nothing left to say.
        return true;
      });

    if (!(await Promise.race([written, expiresAfter(RECORD_DEADLINE_MS)]))) {
      this.logger.error(`Firestore has not accepted this start within ${RECORD_DEADLINE_MS / 1000}s — it is unreachable or misconfigured, and /system will fail until it answers.`);
    }
  }
}

/** `false` once the deadline passes. Unreferenced, so a pending timer cannot hold the process open at shutdown. */
function expiresAfter(ms: number): Promise<false> {
  return new Promise((resolve) => setTimeout(() => resolve(false), ms).unref());
}

/**
 * The record as a client sees it: everything it holds, minus the document id.
 * The collection holds one document, and a client has nothing to do with its
 * name. Spelled out field by field so a field added to the record and forgotten
 * here is a compile error.
 */
function publicView(record: SystemRecord): ServiceInfoDto {
  return {
    name: record.name,
    version: record.version,
    schemaVersion: record.schemaVersion,
    environment: record.environment,
    apiVersion: record.apiVersion,
    installedAt: record.installedAt,
    lastStartedAt: record.lastStartedAt,
  };
}
