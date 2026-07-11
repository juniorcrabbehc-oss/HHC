import { Injectable } from "@nestjs/common";
import type { Level } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class LevelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Levels are a global (non-tenant-scoped) seed list. */
  findAll(): Promise<Level[]> {
    return this.prisma.level.findMany({ orderBy: { sortOrder: "asc" } });
  }
}
