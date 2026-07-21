import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Room } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { CreateRoomDto, UpdateRoomDto } from "./dto/room.dto";

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(dto: CreateRoomDto): Promise<Room> {
    try {
      return await this.prisma.room.create({
        data: {
          schoolId: this.tenant.schoolId,
          name: dto.name,
          capacity: dto.capacity,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`A room named "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  findAll(): Promise<Room[]> {
    return this.prisma.room.findMany({
      where: { schoolId: this.tenant.schoolId },
      orderBy: { name: "asc" },
    });
  }

  async findOneOrThrow(id: string): Promise<Room> {
    const room = await this.prisma.room.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
    });
    if (!room) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    return room;
  }

  async update(id: string, dto: UpdateRoomDto): Promise<Room> {
    await this.findOneOrThrow(id);
    try {
      return await this.prisma.room.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`A room named "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<Room> {
    await this.findOneOrThrow(id);
    try {
      return await this.prisma.room.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictException("Room is used by timetable slots; remove those first");
      }
      throw error;
    }
  }
}
