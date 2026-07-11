import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateMessageTemplateDto, ListMessageTemplatesQueryDto, UpdateMessageTemplateDto } from "./dto/message-template.dto";

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateMessageTemplateDto) {
    const schoolId = this.tenant.schoolId;
    return this.prisma.messageTemplate.create({
      data: {
        schoolId,
        name: dto.name,
        channel: dto.channel,
        eventTrigger: dto.eventTrigger,
        bodyTemplate: dto.bodyTemplate,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async list(query: ListMessageTemplatesQueryDto) {
    const schoolId = this.tenant.schoolId;
    return this.prisma.messageTemplate.findMany({
      where: {
        schoolId,
        ...(query.eventTrigger ? { eventTrigger: query.eventTrigger } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string) {
    const schoolId = this.tenant.schoolId;
    const template = await this.prisma.messageTemplate.findFirst({ where: { id, schoolId } });
    if (!template) throw new NotFoundException(`Message template ${id} not found`);
    return template;
  }

  async update(id: string, dto: UpdateMessageTemplateDto) {
    const schoolId = this.tenant.schoolId;
    const existing = await this.prisma.messageTemplate.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException(`Message template ${id} not found`);

    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.bodyTemplate !== undefined ? { bodyTemplate: dto.bodyTemplate } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }
}
