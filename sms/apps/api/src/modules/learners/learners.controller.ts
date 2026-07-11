import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { Learner } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { LearnersService } from "./learners.service";
import type { PaginatedResult } from "./learners.service";
import { RegisterLearnerDto } from "./dto/register-learner.dto";
import { UpdateLearnerDto } from "./dto/update-learner.dto";
import { ListLearnersQueryDto } from "./dto/list-learners-query.dto";

@Controller("learners")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LearnersController {
  constructor(private readonly learnersService: LearnersService) {}

  @Post()
  @Roles("admin", "front_office")
  register(@Body() dto: RegisterLearnerDto, @CurrentUser() user: AuthenticatedUser): Promise<Learner> {
    return this.learnersService.register(dto, user);
  }

  @Get()
  @Roles("admin", "front_office", "teacher")
  list(@Query() query: ListLearnersQueryDto): Promise<PaginatedResult<Learner>> {
    return this.learnersService.list(query);
  }

  @Get(":id")
  @Roles("admin", "front_office", "teacher", "parent")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.learnersService.findById(id, user);
  }

  @Patch(":id")
  @Roles("admin", "front_office")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateLearnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Learner> {
    return this.learnersService.update(id, dto, user);
  }
}
