import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { GradingBand, LevelStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { serializeGradingBand } from "./academics.mapper";
import type { CreateGradingBandDto, ListGradingBandsQueryDto, UpdateGradingBandDto } from "./dto/grading-band.dto";

@Injectable()
export class GradingBandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateGradingBandDto) {
    assertScoreRange(dto.minScore, dto.maxScore);

    const created = await this.prisma.gradingBand.create({
      data: {
        schoolId: this.tenant.schoolId,
        name: dto.name,
        minScore: dto.minScore,
        maxScore: dto.maxScore,
        grade: dto.grade,
        descriptor: dto.descriptor,
        remark: dto.remark,
        levelStage: dto.levelStage as LevelStage,
        isActive: dto.isActive ?? true,
      },
    });
    return serializeGradingBand(created);
  }

  async findAll(query: ListGradingBandsQueryDto) {
    const records = await this.prisma.gradingBand.findMany({
      where: {
        schoolId: this.tenant.schoolId,
        ...(query.levelStage ? { levelStage: query.levelStage as LevelStage } : {}),
      },
      orderBy: { minScore: "desc" },
    });
    return records.map(serializeGradingBand);
  }

  async findOneOrThrow(id: string): Promise<GradingBand> {
    const record = await this.prisma.gradingBand.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
    });
    if (!record) {
      throw new NotFoundException(`Grading band ${id} not found`);
    }
    return record;
  }

  async update(id: string, dto: UpdateGradingBandDto) {
    const existing = await this.findOneOrThrow(id);

    const minScore = dto.minScore ?? Number(existing.minScore);
    const maxScore = dto.maxScore ?? Number(existing.maxScore);
    assertScoreRange(minScore, maxScore);

    const updated = await this.prisma.gradingBand.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.minScore !== undefined ? { minScore: dto.minScore } : {}),
        ...(dto.maxScore !== undefined ? { maxScore: dto.maxScore } : {}),
        ...(dto.grade !== undefined ? { grade: dto.grade } : {}),
        ...(dto.descriptor !== undefined ? { descriptor: dto.descriptor } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
        ...(dto.levelStage !== undefined ? { levelStage: dto.levelStage as LevelStage } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return serializeGradingBand(updated);
  }
}

function assertScoreRange(minScore: number, maxScore: number): void {
  if (minScore > maxScore) {
    throw new BadRequestException("minScore must be less than or equal to maxScore");
  }
}
