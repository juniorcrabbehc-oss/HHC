import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Period } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreatePeriodDto, UpdatePeriodDto } from "./dto/period.dto";

@Injectable()
export class PeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreatePeriodDto): Promise<Period> {
    try {
      return await this.prisma.period.create({
        data: {
          schoolId: this.tenant.schoolId,
          name: dto.name,
          startTime: dto.startTime,
          endTime: dto.endTime,
          sortOrder: dto.sortOrder,
          isBreak: dto.isBreak ?? false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`A period with sort order ${dto.sortOrder} already exists`);
      }
      throw error;
    }
  }

  findAll(): Promise<Period[]> {
    return this.prisma.period.findMany({
      where: { schoolId: this.tenant.schoolId },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findOneOrThrow(id: string): Promise<Period> {
    const period = await this.prisma.period.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
    });
    if (!period) {
      throw new NotFoundException(`Period ${id} not found`);
    }
    return period;
  }

  async update(id: string, dto: UpdatePeriodDto): Promise<Period> {
    await this.findOneOrThrow(id);
    try {
      return await this.prisma.period.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
          ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isBreak !== undefined ? { isBreak: dto.isBreak } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`A period with sort order ${dto.sortOrder} already exists`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<Period> {
    await this.findOneOrThrow(id);
    try {
      return await this.prisma.period.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException("Period is used by timetable slots; remove those first");
      }
      throw error;
    }
  }
}
