import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { GuardiansService } from "./guardians.service";

@Controller("guardians")
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Get(":id")
  @Roles("admin", "front_office", "teacher", "parent")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.guardiansService.findById(id, user);
  }
}
