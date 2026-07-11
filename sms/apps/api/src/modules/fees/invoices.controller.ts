import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { InvoicesService } from "./invoices.service";
import { GenerateInvoicesDto, ListInvoicesQueryDto, UpdateInvoiceDto } from "./dto/invoice.dto";

@Controller("invoices")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post("generate")
  @Roles("admin", "bursar")
  generate(@Body() dto: GenerateInvoicesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.generate(dto, user);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  list(@Query() query: ListInvoicesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.list(query, user);
  }

  @Get(":id")
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.findById(id, user);
  }

  @Patch(":id")
  @Roles("admin", "bursar")
  update(@Param("id") id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.update(id, dto, user);
  }
}
