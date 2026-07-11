import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateFeeStructureDto, ListFeeStructuresQueryDto, UpdateFeeStructureDto } from "./dto/fee-structure.dto";
import { serializeFeeStructure } from "./fees.mapper";

const FEE_STRUCTURE_INCLUDE = { feeItems: true } as const;

@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateFeeStructureDto) {
    const schoolId = this.tenant.schoolId;

    const [academicYear, term, level] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } }),
      this.prisma.level.findFirst({ where: { id: dto.levelId } }),
    ]);
    if (!academicYear) throw new BadRequestException(`Academic year ${dto.academicYearId} not found`);
    if (!term) throw new BadRequestException(`Term ${dto.termId} not found`);
    if (!level) throw new BadRequestException(`Level ${dto.levelId} not found`);

    const created = await this.prisma.feeStructure.create({
      data: {
        schoolId,
        academicYearId: dto.academicYearId,
        termId: dto.termId,
        levelId: dto.levelId,
        name: dto.name,
        feeItems: {
          create: dto.feeItems.map((item) => ({
            schoolId,
            name: item.name,
            amount: item.amount,
            isOptional: item.isOptional ?? false,
          })),
        },
      },
      include: FEE_STRUCTURE_INCLUDE,
    });

    return serializeFeeStructure(created);
  }

  async findById(id: string) {
    const schoolId = this.tenant.schoolId;
    const feeStructure = await this.prisma.feeStructure.findFirst({
      where: { id, schoolId },
      include: FEE_STRUCTURE_INCLUDE,
    });
    if (!feeStructure) throw new NotFoundException(`Fee structure ${id} not found`);
    return serializeFeeStructure(feeStructure);
  }

  async list(query: ListFeeStructuresQueryDto) {
    const schoolId = this.tenant.schoolId;
    const feeStructures = await this.prisma.feeStructure.findMany({
      where: {
        schoolId,
        ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
        ...(query.termId ? { termId: query.termId } : {}),
        ...(query.levelId ? { levelId: query.levelId } : {}),
      },
      include: FEE_STRUCTURE_INCLUDE,
      orderBy: { name: "asc" },
    });
    return feeStructures.map(serializeFeeStructure);
  }

  /**
   * `feeItems`, when present, fully replaces the existing set (delete +
   * recreate) — same "recompute from scratch" approach as
   * `ReportCardsService.generate`'s item handling, simpler than diffing
   * individual fee items against what's already there.
   */
  async update(id: string, dto: UpdateFeeStructureDto) {
    const schoolId = this.tenant.schoolId;
    const existing = await this.prisma.feeStructure.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException(`Fee structure ${id} not found`);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.feeItems) {
        await tx.feeItem.deleteMany({ where: { feeStructureId: id } });
        await tx.feeItem.createMany({
          data: dto.feeItems.map((item) => ({
            schoolId,
            feeStructureId: id,
            name: item.name,
            amount: item.amount,
            isOptional: item.isOptional ?? false,
          })),
        });
      }

      return tx.feeStructure.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
        },
        include: FEE_STRUCTURE_INCLUDE,
      });
    });

    return serializeFeeStructure(updated);
  }
}
