import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PaymentsService } from "./payments.service";
import { CashPaymentDto, InitiateMomoPaymentDto } from "./dto/payment.dto";

@Controller("payments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("momo/initiate")
  @Roles("parent", "bursar", "admin")
  initiateMomo(@Body() dto: InitiateMomoPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.initiateMomo(dto, user);
  }

  @Post("cash")
  @Roles("bursar", "admin")
  createCashPayment(@Body() dto: CashPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.createCashPayment(dto, user);
  }

  @Get(":id/status")
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  getStatus(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.getStatus(id, user);
  }
}
