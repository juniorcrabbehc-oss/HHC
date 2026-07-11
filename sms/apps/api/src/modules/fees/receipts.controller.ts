import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PaymentsService } from "./payments.service";

@Controller("receipts")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReceiptsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(":id")
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.getReceipt(id, user);
  }
}
