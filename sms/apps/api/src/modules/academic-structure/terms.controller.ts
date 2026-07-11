import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { Term } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { TermsService } from "./terms.service";
import { CreateTermDto, UpdateTermDto } from "./dto/term.dto";

@Controller("terms")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateTermDto): Promise<Term> {
    return this.termsService.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(@Query("academicYearId") academicYearId?: string): Promise<Term[]> {
    return this.termsService.findAll(academicYearId);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateTermDto): Promise<Term> {
    return this.termsService.update(id, dto);
  }
}
