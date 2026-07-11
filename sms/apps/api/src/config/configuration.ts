export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  webOrigin: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  paystack: {
    secretKey: string;
    publicKey: string;
    webhookSecret: string;
  };
  arkesel: {
    apiKey: string;
    senderId: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? "",
  webOrigin: process.env.NEXT_PUBLIC_API_BASE_URL_ORIGIN ?? "http://localhost:3000",
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "30d",
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
    publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET ?? "",
  },
  arkesel: {
    apiKey: process.env.ARKESEL_API_KEY ?? "",
    senderId: process.env.ARKESEL_SENDER_ID ?? "",
  },
});
