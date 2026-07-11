import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { STAFF_ROLES, hasAnyRole } from "../../common/constants/roles";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async findById(id: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const isStaff = hasAnyRole(actor.roles, STAFF_ROLES);

    const guardian = await this.prisma.guardian.findFirst({
      where: {
        id,
        schoolId,
        // Parents may only fetch their own guardian record.
        ...(isStaff ? {} : { userId: actor.sub }),
      },
      include: {
        guardianLearners: { include: { learner: true } },
      },
    });

    if (!guardian) {
      throw new NotFoundException(`Guardian ${id} not found`);
    }

    return guardian;
  }
}
