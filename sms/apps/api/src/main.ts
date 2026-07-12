import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  // `rawBody: true` makes Nest preserve the unparsed request body as
  // `req.rawBody` (Buffer) on every route, alongside the normal parsed
  // `req.body` — needed by the Paystack webhook route
  // (`PaymentsWebhookController`) to verify the `x-paystack-signature`
  // HMAC, which must be computed over the exact bytes Paystack sent, not
  // a re-serialized JSON.stringify of the parsed body. This is the
  // documented Nest mechanism for this (see
  // `NestApplicationOptions.rawBody`) — simpler than disabling the global
  // body parser and re-registering a route-scoped one, and it doesn't
  // change behavior for any other route (parsed `req.body` still works
  // exactly as before, ValidationPipe included).
  //
  // `bodyParser: false` + the explicit `useBodyParser` calls below is the
  // documented way (Nest docs, "Raw body" -> body parser options) to set a
  // body-size limit while keeping `rawBody` capture: `useBodyParser`
  // respects the app-level `rawBody: true` and wires the same `verify`
  // hook the default parsers would.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  // 1mb is generous for a JSON API (largest legitimate payloads here are
  // bulk attendance/score syncs) while capping memory abuse.
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "1mb" });

  // Parses the `sms_refresh` httpOnly refresh-token cookie for
  // /auth/refresh and /auth/logout (see AuthController).
  app.use(cookieParser());

  // Standard security headers (X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security, etc.). CSP is disabled: this API serves
  // JSON only — there is no HTML to protect — and a strict CSP config
  // isn't worth debugging here. Revisit if the API ever serves pages.
  app.use(helmet({ contentSecurityPolicy: false }));

  const allowedOrigins = Array.from(
    new Set([process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:3000"].filter(Boolean)),
  ) as string[];

  // `credentials: true` is required so the browser will send/accept the
  // httpOnly refresh cookie on cross-origin /auth/* calls from the web app
  // (which uses `credentials: "include"` for those).
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap();
