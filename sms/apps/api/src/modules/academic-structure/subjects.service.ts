import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClassSubject, Subject } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateClassSubjectDto, CreateSubjectDto, ListClassSubjectsQueryDto } from "./dto/subject.dto";

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  create(dto: CreateSubjectDto): Promise<Subject> {
    return this.prisma.subject.create({
      data: {
        schoolId: this.tenant.schoolId,
        name: dto.name,
        code: dto.code,
        isCore: dto.isCore ?? true,
      },
    });
  }

  findAll(): Promise<Subject[]> {
    return this.prisma.subject.findMany({
      where: { schoolId: this.tenant.schoolId },
      orderBy: { name: "asc" },
    });
  }

  async createClassSubject(dto: CreateClassSubjectDto): Promise<ClassSubject> {
    const schoolId = this.tenant.schoolId;

    const [classRecord, subject] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } }),
      this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } }),
    ]);

    if (!classRecord) throw new NotFoundException(`Class ${dto.classId} not found`);
    if (!subject) throw new NotFoundException(`Subject ${dto.subjectId} not found`);

    if (dto.teacherId) {
      const teacher = await this.prisma.user.findFirst({ where: { id: dto.teacherId, schoolId } });
      if (!teacher) throw new NotFoundException(`Teacher ${dto.teacherId} not found`);
    }

    return this.prisma.classSubject.create({
      data: {
        schoolId,
        classId: dto.classId,
        subjectId: dto.subjectId,
        teacherId: dto.teacherId,
      },
    });
  }

  findAllClassSubjects(query: ListClassSubjectsQueryDto): Promise<ClassSubject[]> {
    return this.prisma.classSubject.findMany({
      where: {
        schoolId: this.tenant.schoolId,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      },
      include: { subject: true, class: true },
    });
  }
}
