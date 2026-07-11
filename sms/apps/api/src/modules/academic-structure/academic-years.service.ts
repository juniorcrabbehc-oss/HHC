import { Injectable, NotFoundException } from "@nestjs/common";
import type { AcademicYear } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateAcademicYearDto, UpdateAcademicYearDto } from "./dto/academic-year.dto";

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  create(dto: CreateAcademicYearDto): Promise<AcademicYear> {
    return this.prisma.academicYear.create({
      data: {
        schoolId: this.tenant.schoolId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent ?? false,
      },
    });
  }

  findAll(): Promise<AcademicYear[]> {
    return this.prisma.academicYear.findMany({
      where: { schoolId: this.tenant.schoolId },
      orderBy: { startDate: "desc" },
    });
  }

  async findOneOrThrow(id: string): Promise<AcademicYear> {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic year ${id} not found`);
    }
    return academicYear;
  }

  async update(id: string, dto: UpdateAcademicYearDto): Promise<AcademicYear> {
    await this.findOneOrThrow(id);
    return this.prisma.academicYear.update({
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
