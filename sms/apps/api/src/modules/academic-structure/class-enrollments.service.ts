import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ClassEnrollment } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateClassEnrollmentDto, ListClassEnrollmentsQueryDto } from "./dto/class-enrollment.dto";

@Injectable()
export class ClassEnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateClassEnrollmentDto): Promise<ClassEnrollment> {
    const schoolId = this.tenant.schoolId;

    const [learner, classRecord] = await Promise.all([
      this.prisma.learner.findFirst({ where: { id: dto.learnerId, schoolId } }),
      this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } }),
    ]);

    if (!learner) throw new NotFoundException(`Learner ${dto.learnerId} not found`);
    if (!classRecord) throw new NotFoundException(`Class ${dto.classId} not found`);

    try {
      return await this.prisma.classEnrollment.create({
        data: {
          schoolId,
          learnerId: dto.learnerId,
          classId: dto.classId,
          academicYearId: classRecord.academicYearId,
          status: dto.status ?? "active",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Learner is already enrolled for this academic year");
      }
      throw error;
    }
  }

  findAll(query: ListClassEnrollmentsQueryDto): Promise<ClassEnrollment[]> {
    return this.prisma.classEnrollment.findMany({
      where: {
        schoolId: this.tenant.schoolId,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.learnerId ? { learnerId: query.learnerId } : {}),
      },
      include: { learner: true, class: true },
      orderBy: { id: "desc" },
    });
  }
}
