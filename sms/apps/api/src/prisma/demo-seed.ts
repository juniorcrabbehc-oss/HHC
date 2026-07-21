/**
 * Demo data — populates a realistic slice of every module (admissions,
 * attendance, academics/grading, fees, communications) so the app can be
 * clicked through end to end. Separate from `seed.ts` (which only bootstraps
 * roles/levels/school/admin) so this can be re-run independently; every
 * insert here is upsert-by-natural-key or existence-checked, so re-running
 * is safe and won't duplicate rows.
 *
 * Run with: npx ts-node -r tsconfig-paths/register src/prisma/demo-seed.ts
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { findGradingBand, round2 } from "../modules/academics/grading.util";
import { formatInvoiceNumber, formatReceiptNumber } from "../modules/fees/numbering.util";

const prisma = new PrismaClient();

async function getOrCreateUser(schoolId: string, email: string, phone: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { schoolId_email: { schoolId, email } },
    update: {},
    create: { schoolId, email, phone, passwordHash, status: "active" },
  });
}

async function assignRole(userId: string, roleName: string, schoolId: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.upsert({
    where: { userId_roleId_schoolId: { userId, roleId: role.id, schoolId } },
    update: {},
    create: { userId, roleId: role.id, schoolId },
  });
}

function weekdaysBefore(anchor: Date, count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date(anchor);
  while (days.length < count) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cursor));
  }
  return days.reverse();
}

async function main(): Promise<void> {
  const school = await prisma.school.findUniqueOrThrow({ where: { code: "SIS001" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { schoolId: school.id, email: "admin@sunrise.test" } });
  console.log(`Using school ${school.name} (${school.id})`);

  // -- Academic year / terms — a year that actually contains "today" -------
  console.log("Setting up 2025/2026 academic year (current) with 3 terms...");
  await prisma.academicYear.updateMany({ where: { schoolId: school.id }, data: { isCurrent: false } });
  let academicYear = await prisma.academicYear.findFirst({ where: { schoolId: school.id, name: "2025/2026" } });
  if (!academicYear) {
    academicYear = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2025/2026", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31"), isCurrent: true },
    });
  } else {
    academicYear = await prisma.academicYear.update({ where: { id: academicYear.id }, data: { isCurrent: true } });
  }

  const termSpecs = [
    { name: "Term 1", startDate: "2025-09-01", endDate: "2025-12-12", isCurrent: false },
    { name: "Term 2", startDate: "2026-01-05", endDate: "2026-04-03", isCurrent: false },
    { name: "Term 3", startDate: "2026-04-20", endDate: "2026-07-31", isCurrent: true },
  ];
  await prisma.term.updateMany({ where: { schoolId: school.id, academicYearId: academicYear.id }, data: { isCurrent: false } });
  const terms: Record<string, { id: string }> = {};
  for (const t of termSpecs) {
    const existing = await prisma.term.findFirst({ where: { schoolId: school.id, academicYearId: academicYear.id, name: t.name } });
    terms[t.name] = existing
      ? await prisma.term.update({ where: { id: existing.id }, data: { isCurrent: t.isCurrent } })
      : await prisma.term.create({
          data: { schoolId: school.id, academicYearId: academicYear.id, name: t.name, startDate: new Date(t.startDate), endDate: new Date(t.endDate), isCurrent: t.isCurrent },
        });
  }
  const currentTerm = terms["Term 3"];

  // -- Teachers --------------------------------------------------------------
  console.log("Creating teacher accounts...");
  const teacherSpecs = [
    { email: "kmensah@sunrise.test", phone: "+233301111111", name: "Kwame Mensah" },
    { email: "aosei@sunrise.test", phone: "+233302222222", name: "Abena Osei" },
    { email: "kadjei@sunrise.test", phone: "+233303333333", name: "Kofi Adjei" },
  ];
  const teachers: Record<string, string> = {};
  for (const t of teacherSpecs) {
    const user = await getOrCreateUser(school.id, t.email, t.phone, "Teacher123!");
    await assignRole(user.id, "teacher", school.id);
    teachers[t.name] = user.id;
  }

  // -- Levels + classes --------------------------------------------------------
  const levelByCode = async (code: string) => prisma.level.findUniqueOrThrow({ where: { code } });
  const kg2 = await levelByCode("KG_2");
  const primary1 = await levelByCode("PRIMARY_1");
  const jhs1 = await levelByCode("JHS_1");

  console.log("Creating classes for 2025/2026...");
  async function getOrCreateClass(name: string, levelId: string, classTeacherId: string) {
    const existing = await prisma.class.findFirst({ where: { schoolId: school.id, academicYearId: academicYear!.id, name } });
    if (existing) return prisma.class.update({ where: { id: existing.id }, data: { classTeacherId } });
    return prisma.class.create({ data: { schoolId: school.id, levelId, academicYearId: academicYear!.id, name, classTeacherId, capacity: 30 } });
  }
  const kg2a = await getOrCreateClass("KG 2A", kg2.id, teachers["Abena Osei"]);
  const primary1a = await getOrCreateClass("Primary 1A", primary1.id, teachers["Kwame Mensah"]);
  const jhs1a = await getOrCreateClass("JHS 1A", jhs1.id, teachers["Kofi Adjei"]);

  // -- Subjects + class-subject assignments -------------------------------
  console.log("Creating subjects...");
  const subjectSpecs = [
    { code: "MATH", name: "Mathematics" },
    { code: "ENG", name: "English Language" },
    { code: "SCI", name: "Integrated Science" },
    { code: "SOC", name: "Social Studies" },
  ];
  const subjects: Record<string, string> = {};
  for (const s of subjectSpecs) {
    const existing = await prisma.subject.findFirst({ where: { schoolId: school.id, code: s.code } });
    const subject = existing ?? (await prisma.subject.create({ data: { schoolId: school.id, name: s.name, code: s.code, isCore: true } }));
    subjects[s.code] = subject.id;
  }

  async function ensureClassSubjects(classId: string, teacherId: string) {
    const ids: Record<string, string> = {};
    for (const code of Object.keys(subjects)) {
      const existing = await prisma.classSubject.findFirst({ where: { schoolId: school.id, classId, subjectId: subjects[code] } });
      const cs = existing ?? (await prisma.classSubject.create({ data: { schoolId: school.id, classId, subjectId: subjects[code], teacherId } }));
      ids[code] = cs.id;
    }
    return ids;
  }
  const primary1aSubjects = await ensureClassSubjects(primary1a.id, teachers["Kwame Mensah"]);
  const jhs1aSubjects = await ensureClassSubjects(jhs1a.id, teachers["Kofi Adjei"]);

  // -- Learners + guardians ------------------------------------------------
  console.log("Registering learners and guardians...");
  const learnerSpecs = [
    { adm: "SIS-2026-001", first: "Ama", last: "Owusu", dob: "2019-03-14", gender: "female", classRef: primary1a, guardianName: "Efua Owusu", guardianPhone: "+233241234567", createParentUser: true },
    { adm: "SIS-2026-010", first: "Kwabena", last: "Asante", dob: "2019-05-02", gender: "male", classRef: primary1a, guardianName: "Kojo Asante", guardianPhone: "+233242222222" },
    { adm: "SIS-2026-011", first: "Akosua", last: "Frimpong", dob: "2019-08-21", gender: "female", classRef: primary1a, guardianName: "Abena Frimpong", guardianPhone: "+233243333333" },
    { adm: "SIS-2026-012", first: "Kofi", last: "Appiah", dob: "2021-02-10", gender: "male", classRef: kg2a, guardianName: "Yaw Appiah", guardianPhone: "+233244444444" },
    { adm: "SIS-2026-013", first: "Abena", last: "Darko", dob: "2021-06-18", gender: "female", classRef: kg2a, guardianName: "Comfort Darko", guardianPhone: "+233245555555" },
    { adm: "SIS-2026-014", first: "Yaw", last: "Ofori", dob: "2021-01-30", gender: "male", classRef: kg2a, guardianName: "Samuel Ofori", guardianPhone: "+233246666666" },
    { adm: "SIS-2026-015", first: "Nana Yaa", last: "Addo", dob: "2013-04-11", gender: "female", classRef: jhs1a, guardianName: "Grace Addo", guardianPhone: "+233247777777" },
    { adm: "SIS-2026-016", first: "Kwesi", last: "Boadi", dob: "2013-09-09", gender: "male", classRef: jhs1a, guardianName: "Emmanuel Boadi", guardianPhone: "+233248888888" },
    { adm: "SIS-2026-017", first: "Efua", last: "Amoah", dob: "2013-11-23", gender: "female", classRef: jhs1a, guardianName: "Josephine Amoah", guardianPhone: "+233249999999" },
  ];

  const learners: { id: string; classId: string; classSubjects: Record<string, string> | null }[] = [];

  for (const spec of learnerSpecs) {
    let learner = await prisma.learner.findFirst({ where: { schoolId: school.id, admissionNumber: spec.adm } });
    if (!learner) {
      learner = await prisma.learner.create({
        data: {
          schoolId: school.id,
          admissionNumber: spec.adm,
          firstName: spec.first,
          lastName: spec.last,
          dob: new Date(spec.dob),
          gender: spec.gender,
          admissionDate: new Date("2026-01-12"),
          status: "active",
        },
      });
    }

    let guardianUserId: string | undefined;
    if (spec.createParentUser) {
      const parentUser = await getOrCreateUser(school.id, "parent1@sunrise.test", spec.guardianPhone, "Parent123!");
      await assignRole(parentUser.id, "parent", school.id);
      guardianUserId = parentUser.id;
    }

    let guardian = await prisma.guardian.findFirst({ where: { schoolId: school.id, fullName: spec.guardianName } });
    if (!guardian) {
      guardian = await prisma.guardian.create({
        data: { schoolId: school.id, userId: guardianUserId, fullName: spec.guardianName, phonePrimary: spec.guardianPhone, smsOptIn: true },
      });
    } else if (guardianUserId && !guardian.userId) {
      guardian = await prisma.guardian.update({ where: { id: guardian.id }, data: { userId: guardianUserId } });
    }

    const existingLink = await prisma.guardianLearner.findFirst({ where: { guardianId: guardian.id, learnerId: learner.id } });
    if (!existingLink) {
      await prisma.guardianLearner.create({
        data: { schoolId: school.id, guardianId: guardian.id, learnerId: learner.id, relationship: "mother", isPrimaryContact: true, isEmergencyContact: true },
      });
    }

    const existingEnrollment = await prisma.classEnrollment.findFirst({ where: { learnerId: learner.id, academicYearId: academicYear.id } });
    if (!existingEnrollment) {
      await prisma.classEnrollment.create({
        data: { schoolId: school.id, learnerId: learner.id, classId: spec.classRef.id, academicYearId: academicYear.id, status: "active" },
      });
    }

    const csIds = spec.classRef === primary1a ? primary1aSubjects : spec.classRef === jhs1a ? jhs1aSubjects : null;
    learners.push({ id: learner.id, classId: spec.classRef.id, classSubjects: csIds });
  }
  console.log(`  ${learners.length} learners enrolled across KG 2A, Primary 1A, JHS 1A.`);

  // -- Attendance: last 5 school days, mostly present with a few exceptions --
  console.log("Marking attendance for the last 5 school days...");
  const today = new Date("2026-07-11T00:00:00.000Z");
  const days = weekdaysBefore(new Date(today.getTime() + 86400000), 5); // last 5 weekdays up to and including today
  let attendanceCount = 0;
  for (const day of days) {
    for (const learner of learners) {
      const existing = await prisma.attendanceRecord.findFirst({ where: { schoolId: school.id, learnerId: learner.id, date: day } });
      if (existing) continue;
      // Sprinkle a handful of absences/lates for realism, everyone else present.
      const roll = (learner.id.charCodeAt(0) + day.getDate()) % 11;
      const status = roll === 0 ? "ABSENT" : roll === 1 ? "LATE" : "PRESENT";
      await prisma.attendanceRecord.create({
        data: {
          schoolId: school.id,
          classId: learner.classId,
          learnerId: learner.id,
          termId: currentTerm.id,
          date: day,
          status: status as "PRESENT" | "ABSENT" | "LATE",
          recordedBy: admin.id,
          source: "WEB",
          clientUuid: randomUUID(),
        },
      });
      attendanceCount++;
    }
  }
  console.log(`  ${attendanceCount} attendance records created.`);

  // -- Assessment config + grading bands -----------------------------------
  console.log("Setting up assessment config and grading bands...");
  for (const stage of ["PRIMARY", "JHS"] as const) {
    const existing = await prisma.assessmentConfig.findFirst({ where: { schoolId: school.id, levelStage: stage, academicYearId: academicYear.id } });
    if (!existing) {
      await prisma.assessmentConfig.create({
        data: { schoolId: school.id, levelStage: stage, caWeightPct: 30, examWeightPct: 70, academicYearId: academicYear.id },
      });
    }
  }

  const primaryBands = [
    { name: "A", min: 80, max: 100, grade: "A", descriptor: "Excellent", remark: "Excellent performance" },
    { name: "B", min: 70, max: 79.99, grade: "B", descriptor: "Very Good", remark: "Very good performance" },
    { name: "C", min: 60, max: 69.99, grade: "C", descriptor: "Good", remark: "Good performance" },
    { name: "D", min: 50, max: 59.99, grade: "D", descriptor: "Credit", remark: "Credit level" },
    { name: "E", min: 40, max: 49.99, grade: "E", descriptor: "Pass", remark: "Passable, needs improvement" },
    { name: "F", min: 0, max: 39.99, grade: "F", descriptor: "Fail", remark: "Needs significant improvement" },
  ];
  const jhsBands = [
    { name: "1", min: 80, max: 100, grade: "1", descriptor: "Highest", remark: "Outstanding" },
    { name: "2", min: 75, max: 79.99, grade: "2", descriptor: "Higher", remark: "Excellent" },
    { name: "3", min: 70, max: 74.99, grade: "3", descriptor: "High", remark: "Very good" },
    { name: "4", min: 65, max: 69.99, grade: "4", descriptor: "High Average", remark: "Good" },
    { name: "5", min: 60, max: 64.99, grade: "5", descriptor: "Average", remark: "Average" },
    { name: "6", min: 55, max: 59.99, grade: "6", descriptor: "Low Average", remark: "Below average" },
    { name: "7", min: 50, max: 54.99, grade: "7", descriptor: "Low", remark: "Weak" },
    { name: "8", min: 40, max: 49.99, grade: "8", descriptor: "Lower", remark: "Very weak" },
    { name: "9", min: 0, max: 39.99, grade: "9", descriptor: "Lowest", remark: "Fail" },
  ];
  async function ensureBands(stage: "PRIMARY" | "JHS", bands: typeof primaryBands) {
    for (const b of bands) {
      const existing = await prisma.gradingBand.findFirst({ where: { schoolId: school.id, levelStage: stage, name: b.name } });
      if (!existing) {
        await prisma.gradingBand.create({
          data: { schoolId: school.id, name: b.name, minScore: b.min, maxScore: b.max, grade: b.grade, descriptor: b.descriptor, remark: b.remark, levelStage: stage, isActive: true },
        });
      }
    }
  }
  await ensureBands("PRIMARY", primaryBands);
  await ensureBands("JHS", jhsBands);

  // -- CA + exam scores for Primary 1A and JHS 1A --------------------------
  console.log("Entering CA and exam scores...");
  function scoreFor(seed: string): number {
    // Deterministic pseudo-random 55-95 range so re-runs are stable.
    let hash = 0;
    for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
    return 55 + (hash % 41);
  }
  let scoreCount = 0;
  for (const learner of learners.filter((l) => l.classSubjects)) {
    for (const code of Object.keys(subjects)) {
      const classSubjectId = learner.classSubjects![code];
      const existingCa = await prisma.caScore.findFirst({ where: { schoolId: school.id, learnerId: learner.id, classSubjectId, termId: currentTerm.id } });
      if (!existingCa) {
        await prisma.caScore.create({
          data: {
            schoolId: school.id, learnerId: learner.id, classSubjectId, termId: currentTerm.id,
            assessmentType: "Class Test", maxScore: 100, scoreObtained: scoreFor(learner.id + code + "ca"),
            weightPct: 100, recordedBy: admin.id, clientUuid: randomUUID(),
          },
        });
      }
      const existingExam = await prisma.examScore.findFirst({ where: { schoolId: school.id, learnerId: learner.id, classSubjectId, termId: currentTerm.id } });
      if (!existingExam) {
        await prisma.examScore.create({
          data: {
            schoolId: school.id, learnerId: learner.id, classSubjectId, termId: currentTerm.id,
            examType: "End of Term Exam", maxScore: 100, scoreObtained: scoreFor(learner.id + code + "exam"),
            recordedBy: admin.id, clientUuid: randomUUID(),
          },
        });
      }
      scoreCount += 2;
    }
  }
  console.log(`  ${scoreCount} CA/exam score entries recorded.`);

  // -- Generate + publish report cards (Primary 1A + JHS 1A) --------------
  console.log("Generating and publishing report cards...");
  for (const [cls, stage] of [[primary1a, "PRIMARY"], [jhs1a, "JHS"]] as const) {
    const config = await prisma.assessmentConfig.findFirstOrThrow({ where: { schoolId: school.id, levelStage: stage, academicYearId: academicYear.id } });
    const bands = await prisma.gradingBand.findMany({ where: { schoolId: school.id, levelStage: stage, isActive: true } });
    const classSubjectsForClass = await prisma.classSubject.findMany({ where: { schoolId: school.id, classId: cls.id } });
    const enrollments = await prisma.classEnrollment.findMany({ where: { schoolId: school.id, classId: cls.id, status: "active" } });

    const caFrac = Number(config.caWeightPct) / 100;
    const examFrac = Number(config.examWeightPct) / 100;
    const interim: { learnerId: string; reportCardId: string; overallAverage: number | null }[] = [];

    for (const enr of enrollments) {
      const items: { subjectId: string; caTotal: number; examTotal: number; totalScore: number; grade: string; remark: string | null }[] = [];
      for (const cs of classSubjectsForClass) {
        const ca = await prisma.caScore.findMany({ where: { schoolId: school.id, learnerId: enr.learnerId, classSubjectId: cs.id, termId: currentTerm.id } });
        const exam = await prisma.examScore.findMany({ where: { schoolId: school.id, learnerId: enr.learnerId, classSubjectId: cs.id, termId: currentTerm.id } });
        if (ca.length === 0 && exam.length === 0) continue;
        const caRawPct = ca.reduce((sum, e) => sum + (Number(e.scoreObtained) / Number(e.maxScore)) * Number(e.weightPct), 0);
        const examRawPct = exam.length > 0 ? exam.reduce((sum, e) => sum + (Number(e.scoreObtained) / Number(e.maxScore)) * 100, 0) / exam.length : 0;
        const caTotal = round2(caRawPct * caFrac);
        const examTotal = round2(examRawPct * examFrac);
        const totalScore = round2(caTotal + examTotal);
        const band = findGradingBand(bands, totalScore);
        items.push({ subjectId: cs.subjectId, caTotal, examTotal, totalScore, grade: band?.grade ?? "N/A", remark: band?.remark ?? null });
      }
      const overallAverage = items.length > 0 ? round2(items.reduce((s, i) => s + i.totalScore, 0) / items.length) : null;
      const overallBand = overallAverage !== null ? findGradingBand(bands, overallAverage) : undefined;

      let reportCard = await prisma.reportCard.findFirst({ where: { schoolId: school.id, learnerId: enr.learnerId, termId: currentTerm.id } });
      if (reportCard) {
        reportCard = await prisma.reportCard.update({ where: { id: reportCard.id }, data: { classId: cls.id, overallAverage, overallGrade: overallBand?.grade ?? null, status: "published" } });
      } else {
        reportCard = await prisma.reportCard.create({
          data: { schoolId: school.id, learnerId: enr.learnerId, termId: currentTerm.id, classId: cls.id, overallAverage, overallGrade: overallBand?.grade ?? null, status: "published" },
        });
      }
      await prisma.reportCardItem.deleteMany({ where: { reportCardId: reportCard.id } });
      if (items.length > 0) {
        await prisma.reportCardItem.createMany({ data: items.map((i) => ({ reportCardId: reportCard!.id, ...i })) });
      }
      interim.push({ learnerId: enr.learnerId, reportCardId: reportCard.id, overallAverage });
    }

    const ranked = interim.filter((e) => e.overallAverage !== null).sort((a, b) => (b.overallAverage as number) - (a.overallAverage as number));
    let prevAvg: number | null = null;
    let rank = 0;
    for (let idx = 0; idx < ranked.length; idx++) {
      const entry = ranked[idx];
      if (prevAvg === null || entry.overallAverage !== prevAvg) rank = idx + 1;
      prevAvg = entry.overallAverage;
      await prisma.reportCard.update({ where: { id: entry.reportCardId }, data: { positionInClass: rank } });
    }
    console.log(`  ${cls.name}: ${interim.length} report cards generated and published.`);
  }

  // -- Fees: structure, invoices, one partial + one full payment ----------
  console.log("Setting up fee structure, invoices, and payments...");
  const feeLevels = [
    { level: primary1, name: "Primary Term Fees", items: [{ name: "Tuition", amount: 450 }, { name: "PTA Levy", amount: 30 }, { name: "Feeding", amount: 120 }] },
    { level: kg2, name: "KG Term Fees", items: [{ name: "Tuition", amount: 400 }, { name: "PTA Levy", amount: 30 }, { name: "Feeding", amount: 120 }] },
    { level: jhs1, name: "JHS Term Fees", items: [{ name: "Tuition", amount: 550 }, { name: "PTA Levy", amount: 30 }, { name: "ICT Levy", amount: 60 }] },
  ];
  const feeItemsByLevel: Record<string, { id: string; name: string; amount: number }[]> = {};
  for (const spec of feeLevels) {
    let structure = await prisma.feeStructure.findFirst({ where: { schoolId: school.id, academicYearId: academicYear.id, termId: currentTerm.id, levelId: spec.level.id } });
    if (!structure) {
      structure = await prisma.feeStructure.create({ data: { schoolId: school.id, academicYearId: academicYear.id, termId: currentTerm.id, levelId: spec.level.id, name: spec.name } });
    }
    const items: { id: string; name: string; amount: number }[] = [];
    for (const item of spec.items) {
      let feeItem = await prisma.feeItem.findFirst({ where: { schoolId: school.id, feeStructureId: structure.id, name: item.name } });
      if (!feeItem) {
        feeItem = await prisma.feeItem.create({ data: { schoolId: school.id, feeStructureId: structure.id, name: item.name, amount: item.amount, isOptional: false } });
      }
      items.push({ id: feeItem.id, name: feeItem.name, amount: Number(feeItem.amount) });
    }
    feeItemsByLevel[spec.level.id] = items;
  }

  const invoiceYear = currentTerm ? new Date().getFullYear() : 2026;
  let invoiceSeq = (await prisma.invoice.count({ where: { schoolId: school.id } })) + 1;
  let receiptSeq = (await prisma.receipt.count({ where: { schoolId: school.id } })) + 1;
  const classLevelMap: Record<string, string> = { [primary1a.id]: primary1.id, [kg2a.id]: kg2.id, [jhs1a.id]: jhs1.id };

  let invoicesCreated = 0;
  const createdInvoices: { id: string; total: number; learnerId: string }[] = [];
  for (const learner of learners) {
    const existing = await prisma.invoice.findFirst({ where: { schoolId: school.id, learnerId: learner.id, termId: currentTerm.id } });
    if (existing) {
      createdInvoices.push({ id: existing.id, total: Number(existing.totalAmount), learnerId: learner.id });
      continue;
    }
    const levelId = classLevelMap[learner.classId];
    const items = feeItemsByLevel[levelId];
    const total = round2(items.reduce((s, i) => s + i.amount, 0));
    const invoiceNumber = formatInvoiceNumber(invoiceYear, invoiceSeq++);
    const invoice = await prisma.invoice.create({
      data: {
        schoolId: school.id, learnerId: learner.id, termId: currentTerm.id, invoiceNumber,
        issueDate: new Date("2026-04-20"), dueDate: new Date("2026-05-20"),
        totalAmount: total, amountPaid: 0, balance: total, status: "unpaid",
      },
    });
    await prisma.invoiceLineItem.createMany({
      data: items.map((i) => ({ schoolId: school.id, invoiceId: invoice.id, feeItemId: i.id, description: i.name, amount: i.amount })),
    });
    createdInvoices.push({ id: invoice.id, total, learnerId: learner.id });
    invoicesCreated++;
  }
  console.log(`  ${invoicesCreated} invoices created (${createdInvoices.length} total across all learners).`);

  // One fully-paid invoice (Ama Owusu) and one partially-paid invoice (Kwabena Asante), for a realistic mix.
  async function recordCashPayment(invoiceId: string, learnerId: string, amount: number) {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (Number(invoice.balance) <= 0) return; // already settled
    const payment = await prisma.payment.create({
      data: {
        schoolId: school.id, learnerId, invoiceId, amount, method: "cash", status: "success",
        clientUuid: randomUUID(), paidAt: new Date("2026-07-01"),
      },
    });
    await prisma.paymentAllocation.create({ data: { schoolId: school.id, paymentId: payment.id, invoiceId, amountAllocated: amount } });
    const newPaid = round2(Number(invoice.amountPaid) + amount);
    const newBalance = round2(Number(invoice.totalAmount) - newPaid);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid: newPaid, balance: newBalance, status: newBalance <= 0 ? "paid" : "partially_paid" },
    });
    const receiptNumber = formatReceiptNumber(invoiceYear, receiptSeq++);
    await prisma.receipt.upsert({
      where: { paymentId: payment.id },
      update: {},
      create: { schoolId: school.id, paymentId: payment.id, receiptNumber, issuedAt: new Date("2026-07-01") },
    });
  }
  const amaInvoice = createdInvoices.find((i) => i.learnerId === learners[0].id);
  if (amaInvoice) await recordCashPayment(amaInvoice.id, amaInvoice.learnerId, amaInvoice.total);
  const kwabenaInvoice = createdInvoices.find((i) => i.learnerId === learners[1].id);
  if (kwabenaInvoice) await recordCashPayment(kwabenaInvoice.id, kwabenaInvoice.learnerId, round2(kwabenaInvoice.total * 0.4));
  console.log("  Recorded 1 full cash payment (Ama Owusu) and 1 partial cash payment (Kwabena Asante), each with a receipt.");

  // -- A message template + an in-app message ------------------------------
  console.log("Seeding a message template and a sample in-app message...");
  let template = await prisma.messageTemplate.findFirst({ where: { schoolId: school.id, name: "Fee Reminder" } });
  if (!template) {
    template = await prisma.messageTemplate.create({
      data: {
        schoolId: school.id, name: "Fee Reminder", channel: "sms", eventTrigger: "fee_reminder", isActive: true,
        bodyTemplate: "Dear {{guardianName}}, a balance of GHS {{balance}} remains on {{learnerName}}'s Term 3 invoice. Please settle at your earliest convenience. — Sunrise International School",
      },
    });
  }
  const amaGuardianLink = await prisma.guardianLearner.findFirst({ where: { learnerId: learners[0].id }, include: { guardian: true } });
  if (amaGuardianLink) {
    const existingMsg = await prisma.message.findFirst({ where: { schoolId: school.id, recipientGuardianId: amaGuardianLink.guardianId, channel: "in_app" } });
    if (!existingMsg) {
      await prisma.message.create({
        data: {
          schoolId: school.id, channel: "in_app", recipientGuardianId: amaGuardianLink.guardianId,
          body: "Welcome to the Sunrise International School parent portal! You can view Ama's attendance, report card, and fee balance here.",
          status: "delivered", sentAt: new Date("2026-07-10"), deliveredAt: new Date("2026-07-10"),
        },
      });
    }
  }

  // -- Timetable: periods, rooms, and a week of lessons --------------------
  console.log("Building the timetable...");
  const periodSpecs = [
    { name: "Period 1", startTime: "08:00", endTime: "08:45", sortOrder: 1, isBreak: false },
    { name: "Period 2", startTime: "08:45", endTime: "09:30", sortOrder: 2, isBreak: false },
    { name: "Snack Break", startTime: "09:30", endTime: "10:00", sortOrder: 3, isBreak: true },
    { name: "Period 3", startTime: "10:00", endTime: "10:45", sortOrder: 4, isBreak: false },
    { name: "Period 4", startTime: "10:45", endTime: "11:30", sortOrder: 5, isBreak: false },
    { name: "Lunch", startTime: "11:30", endTime: "12:30", sortOrder: 6, isBreak: true },
    { name: "Period 5", startTime: "12:30", endTime: "13:15", sortOrder: 7, isBreak: false },
    { name: "Period 6", startTime: "13:15", endTime: "14:00", sortOrder: 8, isBreak: false },
  ];
  const periods: Record<number, string> = {};
  for (const p of periodSpecs) {
    const existing = await prisma.period.findFirst({ where: { schoolId: school.id, sortOrder: p.sortOrder } });
    const period = existing ?? (await prisma.period.create({ data: { schoolId: school.id, ...p } }));
    periods[p.sortOrder] = period.id;
  }

  const roomSpecs = [
    { name: "Primary Block Room 1", capacity: 30 },
    { name: "JHS Block Room 1", capacity: 35 },
    { name: "Science Room", capacity: 25 },
  ];
  const rooms: Record<string, string> = {};
  for (const r of roomSpecs) {
    const existing = await prisma.room.findFirst({ where: { schoolId: school.id, name: r.name } });
    const room = existing ?? (await prisma.room.create({ data: { schoolId: school.id, ...r } }));
    rooms[r.name] = room.id;
  }

  // A simple rotation: each teaching period cycles through the four subjects,
  // offset per day, each class in its home room. One shared subject-teacher
  // per class means no cross-class teacher clashes in the demo data.
  const teachingSortOrders = [1, 2, 4, 5, 7, 8];
  const subjectCodes = ["MATH", "ENG", "SCI", "SOC"];
  async function ensureWeeklyTimetable(
    classId: string,
    homeRoomName: string,
    teacherId: string,
  ) {
    for (let day = 1; day <= 5; day += 1) {
      for (let i = 0; i < teachingSortOrders.length; i += 1) {
        const periodId = periods[teachingSortOrders[i]];
        const code = subjectCodes[(i + day) % subjectCodes.length];
        const existing = await prisma.timetableSlot.findFirst({
          where: { classId, dayOfWeek: day, periodId },
        });
        if (existing) continue;
        await prisma.timetableSlot.create({
          data: {
            schoolId: school.id,
            academicYearId: academicYear!.id,
            classId,
            subjectId: subjects[code],
            teacherId,
            roomId: rooms[homeRoomName],
            periodId,
            dayOfWeek: day,
          },
        });
      }
    }
  }
  await ensureWeeklyTimetable(primary1a.id, "Primary Block Room 1", teachers["Kwame Mensah"]);
  await ensureWeeklyTimetable(jhs1a.id, "JHS Block Room 1", teachers["Kofi Adjei"]);

  console.log("\nDemo data ready.\n");
  console.log("Login as:");
  console.log("  Admin:   admin@sunrise.test / Admin123!");
  console.log("  Teacher: kmensah@sunrise.test / Teacher123!  (class teacher, Primary 1A)");
  console.log("  Parent:  parent1@sunrise.test / Parent123!   (guardian of Ama Owusu)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
