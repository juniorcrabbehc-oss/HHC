import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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
