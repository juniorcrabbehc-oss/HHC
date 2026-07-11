import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AssessmentConfig, LevelStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { serializeAssessmentConfig } from "./academics.mapper";
import type { CreateAssessmentConfigDto, ListAssessmentConfigQueryDto, UpdateAssessmentConfigDto } from "./dto/assessment-config.dto";

@Injectable()
export class AssessmentConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateAssessmentConfigDto) {
    const schoolId = this.tenant.schoolId;
    assertWeightsSumTo100(dto.caWeightPct, dto.examWeightPct);

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);
    }

    const created = await this.prisma.assessmentConfig.create({
      data: {
        schoolId,
        levelStage: dto.levelStage as LevelStage,
        caWeightPct: dto.caWeightPct,
        examWeightPct: dto.examWeightPct,
        academicYearId: dto.academicYearId,
      },
    });
    return serializeAssessmentConfig(created);
  }

  async findAll(query: ListAssessmentConfigQueryDto) {
    const records = await this.prisma.assessmentConfig.findMany({
      where: {
        schoolId: this.tenant.schoolId,
        ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
        ...(query.levelStage ? { levelStage: query.levelStage as LevelStage } : {}),
      },
    });
    return records.map(serializeAssessmentConfig);
  }

  async findOneOrThrow(id: string): Promise<AssessmentConfig> {
    const record = await this.prisma.assessmentConfig.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
    });
    if (!record) {
      throw new NotFoundException(`Assessment config ${id} not found`);
    }
    return record;
  }

  async update(id: string, dto: UpdateAssessmentConfigDto) {
    const existing = await this.findOneOrThrow(id);

    const caWeightPct = dto.caWeightPct ?? Number(existing.caWeightPct);
    const examWeightPct = dto.examWeightPct ?? Number(existing.examWeightPct);
    assertWeightsSumTo100(caWeightPct, examWeightPct);

    if (dto.academicYearId !== undefined) {
      const academicYear = await this.prisma.academicYear.findFirst({
        where: { id: dto.academicYearId, schoolId: this.tenant.schoolId },
      });
      if (!academicYear) {
        throw new NotFoundException(`Academic year ${dto.academicYearId} not found`);
      }
    }

    const updated = await this.prisma.assessmentConfig.update({
      where: { id },
      data: {
        ...(dto.levelStage !== undefined ? { levelStage: dto.levelStage as LevelStage } : {}),
        ...(dto.caWeightPct !== undefined ? { caWeightPct: dto.caWeightPct } : {}),
        ...(dto.examWeightPct !== undefined ? { examWeightPct: dto.examWeightPct } : {}),
        ...(dto.academicYearId !== undefined ? { academicYearId: dto.academicYearId } : {}),
      },
    });
    return serializeAssessmentConfig(updated);
  }
}

function assertWeightsSumTo100(caWeightPct: number, examWeightPct: number): void {
  // Compare in integer cents to sidestep float rounding (70 + 30.001 etc).
  if (Math.round(caWeightPct * 100) + Math.round(examWeightPct * 100) !== 10000) {
    throw new BadRequestException("caWeightPct and examWeightPct must sum to 100");
  }
}
