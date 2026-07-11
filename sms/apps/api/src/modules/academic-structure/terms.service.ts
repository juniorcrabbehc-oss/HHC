import { Injectable, NotFoundException } from "@nestjs/common";
import type { Term } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateTermDto, UpdateTermDto } from "./dto/term.dto";

@Injectable()
export class TermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateTermDto): Promise<Term> {
    const schoolId = this.tenant.schoolId;
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);
    }

    return this.prisma.term.create({
      data: {
        schoolId,
        academicYearId: dto.academicYearId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent ?? false,
      },
    });
  }

  findAll(academicYearId?: string): Promise<Term[]> {
    return this.prisma.term.findMany({
      where: {
        schoolId: this.tenant.schoolId,
        ...(academicYearId ? { academicYearId } : {}),
      },
      orderBy: { startDate: "asc" },
    });
  }

  async findOneOrThrow(id: string): Promise<Term> {
    const term = await this.prisma.term.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
    });
    if (!term) {
      throw new NotFoundException(`Term ${id} not found`);
    }
    return term;
  }

  async update(id: string, dto: UpdateTermDto): Promise<Term> {
    await this.findOneOrThrow(id);
    return this.prisma.term.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.isCurrent !== undefined ? { isCurrent: dto.isCurrent } : {}),
      },
    });
  }
}
