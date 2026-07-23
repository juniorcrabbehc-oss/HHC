import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { AuditService } from "../../common/audit/audit.service";
import { STAFF_ROLES, hasAnyRole } from "../../common/constants/roles";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { MessageDispatchService } from "./message-dispatch.service";
import type { ListMessagesQueryDto, SendMessageDto } from "./dto/message.dto";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly auditService: AuditService,
    private readonly dispatch: MessageDispatchService,
  ) {}

  /**
   * Inbox = in-app messages addressed to the `Guardian` record linked to
   * the current user (`Guardian.userId`) — same linkage
   * `learnerScopeWhere`/`ReportCardsService.findById` use elsewhere for
   * "is this my child". Staff without a linked `Guardian` profile (the
   * normal case) simply have an empty inbox: `Message` has no
   * staff-recipient column (only `recipientGuardianId`/`recipientPhone`),
   * so staff-to-staff in-app messaging is out of scope here — the brief
   * calls guardian-linked recipients the primary case, and adding a
   * parallel recipient concept would be a schema change, not a Phase 5
   * wiring task.
   */
  async list(query: ListMessagesQueryDto, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;

    if (query.box && query.box !== "inbox") {
      throw new BadRequestException(`Unsupported box "${query.box}"`);
    }

    const guardian = await this.prisma.guardian.findFirst({ where: { schoolId, userId: actor.sub } });
    if (!guardian) return [];

    return this.prisma.message.findMany({
      where: { schoolId, channel: "in_app", recipientGuardianId: guardian.id },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Ad-hoc "message a guardian" — staff pick a guardian directly, or a
   * learner (resolved to that learner's primary-contact guardian, or the
   * first linked guardian if none is flagged primary). Not tied to any
   * `MessageTemplate`/eventTrigger — the body is whatever staff typed.
   */
  async create(dto: SendMessageDto, actor: AuthenticatedUser) {
    // Feature-gated on provider config — same pattern as MoMo initiation.
    // The web UI hides the SMS channel via GET /config/features when the
    // Arkesel key is absent; this guard covers direct API callers.
    if (dto.channel === "sms" && !process.env.ARKESEL_API_KEY) {
      throw new BadRequestException("SMS sending is not enabled yet. Use the in-app channel instead.");
    }

    const schoolId = this.tenant.schoolId;
    const guardian = await this.resolveRecipientGuardian(dto, schoolId);

    const message =
      dto.channel === "sms"
        ? await this.dispatch.sendSmsToGuardian({
            schoolId,
            guardian,
            body: dto.body,
            relatedEntityType: dto.learnerId ? "Learner" : undefined,
            relatedEntityId: dto.learnerId,
          })
        : await this.dispatch.sendInApp({
            schoolId,
            guardian,
            body: dto.body,
            relatedEntityType: dto.learnerId ? "Learner" : undefined,
            relatedEntityId: dto.learnerId,
          });

    if (!message) {
      // sendSmsToGuardian returns null only for the opt-out/no-phone case.
      throw new BadRequestException("Guardian has opted out of SMS (or has no phone on file)");
    }

    await this.auditService.log({
      schoolId,
      actorUserId: actor.sub,
      action: "MESSAGE_SENT",
      entityType: "Message",
      entityId: message.id,
      diff: { channel: dto.channel, recipientGuardianId: guardian.id },
    });

    return message;
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const isStaff = hasAnyRole(actor.roles, STAFF_ROLES);

    const message = await this.prisma.message.findFirst({
      where: {
        id,
        schoolId,
        ...(isStaff ? {} : { recipientGuardian: { userId: actor.sub } }),
      },
    });

    if (!message) {
      // 404, not 403 — same non-leaking pattern used throughout this codebase.
      throw new NotFoundException(`Message ${id} not found`);
    }

    return message;
  }

  private async resolveRecipientGuardian(dto: SendMessageDto, schoolId: string) {
    if (dto.guardianId) {
      const guardian = await this.prisma.guardian.findFirst({ where: { id: dto.guardianId, schoolId } });
      if (!guardian) throw new NotFoundException(`Guardian ${dto.guardianId} not found`);
      return guardian;
    }

    if (dto.learnerId) {
      const link = await this.prisma.guardianLearner.findFirst({
        where: { schoolId, learnerId: dto.learnerId },
        orderBy: [{ isPrimaryContact: "desc" }],
        include: { guardian: true },
      });
      if (!link) throw new BadRequestException(`No guardian linked to learner ${dto.learnerId}`);
      return link.guardian;
    }

    throw new BadRequestException("Provide either guardianId or learnerId");
  }
}
