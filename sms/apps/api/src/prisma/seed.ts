import { LevelStage, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const ROLE_SEED: Array<{ name: string; description: string }> = [
  { name: "admin", description: "School administrator with full access" },
  { name: "teacher", description: "Teaching staff" },
  { name: "bursar", description: "Finance / fees officer" },
  { name: "front_office", description: "Front office / registrar staff" },
  { name: "parent", description: "Parent or guardian" },
  { name: "learner", description: "Student" },
];

const LEVEL_SEED: Array<{ code: string; name: string; sortOrder: number; stage: LevelStage }> = [
  { code: "CRECHE", name: "Creche", sortOrder: 1, stage: LevelStage.CRECHE },
  { code: "NURSERY_1", name: "Nursery 1", sortOrder: 2, stage: LevelStage.NURSERY },
  { code: "NURSERY_2", name: "Nursery 2", sortOrder: 3, stage: LevelStage.NURSERY },
  { code: "KG_1", name: "Kindergarten 1", sortOrder: 4, stage: LevelStage.KG },
  { code: "KG_2", name: "Kindergarten 2", sortOrder: 5, stage: LevelStage.KG },
  { code: "PRIMARY_1", name: "Primary 1", sortOrder: 6, stage: LevelStage.PRIMARY },
  { code: "PRIMARY_2", name: "Primary 2", sortOrder: 7, stage: LevelStage.PRIMARY },
  { code: "PRIMARY_3", name: "Primary 3", sortOrder: 8, stage: LevelStage.PRIMARY },
  { code: "PRIMARY_4", name: "Primary 4", sortOrder: 9, stage: LevelStage.PRIMARY },
  { code: "PRIMARY_5", name: "Primary 5", sortOrder: 10, stage: LevelStage.PRIMARY },
  { code: "PRIMARY_6", name: "Primary 6", sortOrder: 11, stage: LevelStage.PRIMARY },
  { code: "JHS_1", name: "JHS 1", sortOrder: 12, stage: LevelStage.JHS },
  { code: "JHS_2", name: "JHS 2", sortOrder: 13, stage: LevelStage.JHS },
  { code: "JHS_3", name: "JHS 3", sortOrder: 14, stage: LevelStage.JHS },
];

async function main(): Promise<void> {
  console.log("Seeding roles...");
  for (const role of ROLE_SEED) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  console.log("Seeding levels...");
  for (const level of LEVEL_SEED) {
    await prisma.level.upsert({
      where: { code: level.code },
      update: { name: level.name, sortOrder: level.sortOrder, stage: level.stage },
      create: level,
    });
  }

  console.log("Seeding demo school...");
  const school = await prisma.school.upsert({
    where: { code: "SIS001" },
    update: {},
    create: {
      name: "Sunrise International School",
      code: "SIS001",
      region: "Greater Accra",
      district: "Accra Metropolitan",
      isActive: true,
    },
  });

  console.log("Seeding admin user...");
  const passwordHash = await bcrypt.hash("Admin123!", 10);
  const adminUser = await prisma.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email: "admin@sunrise.test" } },
    update: { passwordHash },
    create: {
      schoolId: school.id,
      email: "admin@sunrise.test",
      phone: "+233200000000",
      passwordHash,
      status: "active",
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });

  console.log("Linking admin user to admin role...");
  await prisma.userRole.upsert({
    where: {
      userId_roleId_schoolId: {
        userId: adminUser.id,
        roleId: adminRole.id,
        schoolId: school.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      schoolId: school.id,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
