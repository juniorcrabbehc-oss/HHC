import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../types/authenticated-user";

export const CurrentSchool = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    return user?.schoolId;
  },
);
