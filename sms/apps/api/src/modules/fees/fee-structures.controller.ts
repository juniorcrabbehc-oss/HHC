import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { FeeStructuresService } from "./fee-structures.service";
import { CreateFeeStructureDto, ListFeeStructuresQueryDto, UpdateFeeStructureDto } from "./dto/fee-structure.dto";

@Controller("fee-structures")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeeStructuresController {
  constructor(private readonly feeStructuresService: FeeStructuresService) {}

  @Post()
  @Roles("admin", "bursar")
  create(@Body() dto: CreateFeeStructureDto) {
    return this.feeStructuresService.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  list(@Query() query: ListFeeStructuresQueryDto) {
    return this.feeStructuresService.list(query);
  }

  @Get(":id")
  @Roles("admin", "teacher", "bursar", "front_office")
  findOne(@Param("id") id: string) {
    return this.feeStructuresService.findById(id);
  }

  @Patch(":id")
  @Roles("admin", "bursar")
  update(@Param("id") id: string, @Body() dto: UpdateFeeStructureDto) {
    return this.feeStructuresService.update(id, dto);
  }
}
