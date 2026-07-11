import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../../../prisma/prisma.service";
import { MessageDispatchService } from "../message-dispatch.service";
import { getNotifiableGuardians } from "../guardian-notify.util";
import { ATTENDANCE_MARKED_EVENT, type AttendanceMarkedEvent } from "../../attendance/attendance.events";
import { REPORT_CARD_PUBLISHED_EVENT, type ReportCardPublishedEvent } from "../../academics/report-card.events";

const ABSENCE_ALERT_FALLBACK =
  "{{learnerName}} was marked absent on {{date}}. Please contact the school office if this is unexpected.";
const REPORT_CARD_READY_FALLBACK =
  "{{learnerName}}'s report card for {{termName}} is now available. Please log in to the parent portal to view it.";

/**
 * Event-driven trigger wiring for absence alerts and report-card-ready
 * notices. Deliberately event-emitter-based rather than a direct call
 * from `AttendanceService`/`ReportCardsService`: both of those services
 * carry carefully-reasoned-about idempotency/visibility logic (attendance's
 * offline-sync dedup, report cards' draft/published visibility split)
 * that this task has no test coverage for and shouldn't risk by threading
 * notification side effects directly into them. Each service only gained
 * a one-line `eventEmitter.emit(...)` call at its existing success path
 * (see `attendance.events.ts` / `report-card.events.ts`) — this service
 * does the rest, fully decoupled.
 *
 * Handlers are fire-and-forget from the emitter's point of view (Nest's
 * `EventEmitter2.emit` doesn't await listener promises), so every handler
 * wraps its body in try/catch — an unhandled rejection here must never
 * surface as a request failure on the attendance/report-card write that
 * triggered it, since by the time this runs that write has already
 * committed.
 */
@Injectable()
export class NotificationTriggersService {
  private readonly logger = new Logger(NotificationTriggersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: MessageDispatchService,
  ) {}

  @OnEvent(ATTENDANCE_MARKED_EVENT)
  async handleAttendanceMarked(payload: AttendanceMarkedEvent): Promise<void> {
    if (payload.status !== "ABSENT") return;

    try {
      const learner = await this.prisma.learner.findFirst({ where: { id: payload.learnerId, schoolId: payload.schoolId } });
      if (!learner) return;

      const guardians = await getNotifiableGuardians(this.prisma, payload.schoolId, payload.learnerId);
      if (guardians.length === 0) return;

      const { body, templateId } = await this.dispatch.renderBody(
        payload.schoolId,
        "absence_alert",
        "sms",
        ABSENCE_ALERT_FALLBACK,
        {
          learnerName: `${learner.firstName} ${learner.lastName}`,
          date: payload.date.toISOString().slice(0, 10),
        },
      );

      for (const guardian of guardians) {
        // Sequential: a handful of guardians per learner at most, same
        // "small batch, not a hot path" reasoning as elsewhere in this
        // codebase (e.g. AttendanceService.markBulk).
        // eslint-disable-next-line no-await-in-loop
        await this.dispatch.sendSmsToGuardian({
          schoolId: payload.schoolId,
          guardian,
          body,
          templateId,
          relatedEntityType: "AttendanceRecord",
          relatedEntityId: payload.recordId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to process absence alert for learner ${payload.learnerId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  @OnEvent(REPORT_CARD_PUBLISHED_EVENT)
  async handleReportCardPublished(payload: ReportCardPublishedEvent): Promise<void> {
    try {
      const [learner, term] = await Promise.all([
        this.prisma.learner.findFirst({ where: { id: payload.learnerId, schoolId: payload.schoolId } }),
        this.prisma.term.findFirst({ where: { id: payload.termId, schoolId: payload.schoolId } }),
      ]);
      if (!learner) return;

      const guardians = await getNotifiableGuardians(this.prisma, payload.schoolId, payload.learnerId);
      if (guardians.length === 0) return;

      const { body, templateId } = await this.dispatch.renderBody(
        payload.schoolId,
        "report_card_ready",
        "sms",
        REPORT_CARD_READY_FALLBACK,
        {
          learnerName: `${learner.firstName} ${learner.lastName}`,
          termName: term?.name ?? "this term",
        },
      );

      for (const guardian of guardians) {
        // eslint-disable-next-line no-await-in-loop
        await this.dispatch.sendSmsToGuardian({
          schoolId: payload.schoolId,
          guardian,
          body,
          templateId,
          relatedEntityType: "ReportCard",
          relatedEntityId: payload.reportCardId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to process report-card-ready notice for report card ${payload.reportCardId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
