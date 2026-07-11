import { Controller, Get, UseGuards } from "@nestjs/common";
import type { Level } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { LevelsService } from "./levels.service";

/** Global, non-tenant-scoped seed data — any authenticated user can read it. */
@Controller("levels")
@UseGuards(JwtAuthGuard)
export class LevelsController {
  constructor(private readonly levelsService: LevelsService) {}

  @Get()
  findAll(): Promise<Level[]> {
    return this.levelsService.findAll();
  }
}
