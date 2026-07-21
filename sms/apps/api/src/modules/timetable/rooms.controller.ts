import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { Room } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RoomsService } from "./rooms.service";
import { CreateRoomDto, UpdateRoomDto } from "./dto/room.dto";

@Controller("rooms")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateRoomDto): Promise<Room> {
    return this.roomsService.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(): Promise<Room[]> {
    return this.roomsService.findAll();
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateRoomDto): Promise<Room> {
    return this.roomsService.update(id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Param("id") id: string): Promise<Room> {
    return this.roomsService.remove(id);
  }
}
