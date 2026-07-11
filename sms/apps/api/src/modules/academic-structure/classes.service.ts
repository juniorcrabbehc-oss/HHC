import { Injectable, NotFoundException } from "@nestjs/common";
import type { Class } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateClassDto, ListClassesQueryDto, UpdateClassDto } from "./dto/class.dto";

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateClassDto): Promise<Class> {
    const schoolId = this.tenant.schoolId;

    const level = await this.prisma.level.findUnique({ where: { id: dto.levelId } });
    if (!level) {
      throw new NotFoundException(`Level ${dto.levelId} not found`);
    }

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);
    }

    if (dto.classTeacherId) {
      const teacher = await this.prisma.user.findFirst({
        where: { id: dto.classTeacherId, schoolId },
      });
      if (!teacher) {
        throw new NotFoundException(`Class teacher ${dto.classTeacherId} not found`);
      }
    }

    return this.prisma.class.create({
      data: {
        schoolId,
        levelId: dto.levelId,
        academicYearId: dto.academicYearId,
        name: dto.name,
        classTeacherId: dto.classTeacherId,
        capacity: dto.capacity,
      },
    });
  }

  findAll(query: ListClassesQueryDto): Promise<Class[]> {
    return this.prisma.class.findMany({
      where: {
        schoolId: this.tenant.schoolId,
        ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
        ...(query.levelId ? { levelId: query.levelId } : {}),
        ...(query.classTeacherId ? { classTeacherId: query.classTeacherId } : {}),
      },
      include: { level: true },
      orderBy: { name: "asc" },
    });
  }

  async findOneOrThrow(id: string): Promise<Class> {
    const classRecord = await this.prisma.class.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
      include: { level: true },
    });
    if (!classRecord) {
      throw new NotFoundException(`Class ${id} not found`);
    }
    return classRecord;
  }

  async update(id: string, dto: UpdateClassDto): Promise<Class> {
    await this.findOneOrThrow(id);
    return this.prisma.class.update({
      where: { id },
      data: {
        ...(dto.levelId !== undefined ? { levelId: dto.levelId } : {}),
        ...(dto.academicYearId !== undefined ? { academicYearId: dto.academicYearId } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.classTeacherId !== undefined ? { classTeacherId: dto.classTeacherId } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      },
    });
  }
}
