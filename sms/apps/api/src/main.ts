import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
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
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowedOrigins = Array.from(
    new Set([process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:3000"].filter(Boolean)),
  ) as string[];

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
