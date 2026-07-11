import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type { Request } from "express";
import type { AuthenticatedUser } from "../types/authenticated-user";

/**
 * Request-scoped service that resolves the current tenant (school) from the
 * authenticated request. Injected by feature modules (Phase 1+) that need
 * to automatically scope Prisma queries to `schoolId` without threading it
 * through every method signature.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  get user(): AuthenticatedUser | undefined {
    return (this.request as Request & { user?: AuthenticatedUser }).user;
  }

  get schoolId(): string {
    const schoolId = this.user?.schoolId;
    if (!schoolId) {
      throw new Error("TenantContextService: no schoolId available on request. Is the request authenticated?");
    }
    return schoolId;
  }
}
