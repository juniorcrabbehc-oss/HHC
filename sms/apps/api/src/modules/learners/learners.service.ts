import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Learner } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { AuditService } from "../../common/audit/audit.service";
import { STAFF_ROLES, hasAnyRole } from "../../common/constants/roles";
import { shallowDiff } from "../../common/utils/diff";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { RegisterLearnerDto } from "./dto/register-learner.dto";
import type { UpdateLearnerDto } from "./dto/update-learner.dto";
import type { ListLearnersQueryDto } from "./dto/list-learners-query.dto";

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class LearnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Creates a learner, optionally creating/linking guardians and enrolling
   * into a class, all inside a single transaction. If `classId` is provided
   * the academic year for the enrollment is inferred from the class record
   * (the client never supplies academicYearId directly).
   */
  async register(dto: RegisterLearnerDto, actor: AuthenticatedUser): Promise<Learner> {
    const schoolId = this.tenant.schoolId;

    for (const guardianInput of dto.guardians ?? []) {
      if (!guardianInput.guardianId && !(guardianInput.fullName && guardianInput.phonePrimary)) {
        throw new BadRequestException(
          "Each guardian must either reference an existing guardianId or supply fullName + phonePrimary",
        );
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        let classRecord = null;
        if (dto.classId) {
          classRecord = await tx.class.findFirst({ where: { id: dto.classId, schoolId } });
          if (!classRecord) {
            throw new BadRequestException(`Class ${dto.classId} not found`);
          }
        }

        const learner = await tx.learner.create({
          data: {
            schoolId,
            admissionNumber: dto.admissionNumber,
            firstName: dto.firstName,
            lastName: dto.lastName,
            otherNames: dto.otherNames,
            dob: new Date(dto.dob),
            gender: dto.gender,
            admissionDate: new Date(dto.admissionDate),
            status: dto.status ?? "active",
            photoUrl: dto.photoUrl,
            medicalNotes: dto.medicalNotes,
            allergies: dto.allergies,
            bloodGroup: dto.bloodGroup,
            emergencyContactName: dto.emergencyContactName,
            emergencyContactPhone: dto.emergencyContactPhone,
          },
        });

        for (const guardianInput of dto.guardians ?? []) {
          let guardianId = guardianInput.guardianId;

          if (guardianId) {
            const existing = await tx.guardian.findFirst({ where: { id: guardianId, schoolId } });
            if (!existing) {
              throw new BadRequestException(`Guardian ${guardianId} not found`);
            }
          } else {
            const created = await tx.guardian.create({
              data: {
                schoolId,
                fullName: guardianInput.fullName!,
                phonePrimary: guardianInput.phonePrimary!,
                phoneSecondary: guardianInput.phoneSecondary,
                email: guardianInput.email,
                address: guardianInput.address,
                idType: guardianInput.idType,
                idNumber: guardianInput.idNumber,
                smsOptIn: guardianInput.smsOptIn ?? true,
              },
            });
            guardianId = created.id;
          }

          await tx.guardianLearner.create({
            data: {
              schoolId,
              guardianId,
              learnerId: learner.id,
              relationship: guardianInput.relationship,
              isPrimaryContact: guardianInput.isPrimaryContact ?? false,
              isEmergencyContact: guardianInput.isEmergencyContact ?? false,
            },
          });
        }

        if (classRecord) {
          await tx.classEnrollment.create({
            data: {
              schoolId,
              learnerId: learner.id,
              classId: classRecord.id,
              academicYearId: classRecord.academicYearId,
              status: "active",
            },
          });
        }

        await this.auditService.log(
          {
            schoolId,
            actorUserId: actor.sub,
            action: "LEARNER_CREATED",
            entityType: "Learner",
            entityId: learner.id,
            diff: { admissionNumber: learner.admissionNumber, firstName: learner.firstName, lastName: learner.lastName },
          },
          tx,
        );

        return learner;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : String(error.meta?.target ?? "");
        throw new ConflictException(
          target.includes("admissionNumber")
            ? "A learner with this admission number already exists"
            : `Duplicate value conflicts with an existing record (${target || "unique constraint"})`,
        );
      }
      throw error;
    }
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const isStaff = hasAnyRole(actor.roles, STAFF_ROLES);

    const learner = await this.prisma.learner.findFirst({
      where: {
        id,
        schoolId,
        // Non-staff (parent) callers only ever see learners linked to their
        // own guardian record — resolved by joining GuardianLearner ->
        // Guardian.userId. Staff roles bypass this filter entirely.
        ...(isStaff
          ? {}
          : {
              guardianLearners: {
                some: { guardian: { userId: actor.sub } },
              },
            }),
      },
      include: {
        guardianLearners: { include: { guardian: true } },
        classEnrollments: {
          include: { class: true },
          orderBy: { id: "desc" },
          take: 1,
        },
      },
    });

    if (!learner) {
      // Deliberately 404 (not 403) for the non-staff, not-linked case so we
      // don't leak whether a learner with that id exists at all.
      throw new NotFoundException(`Learner ${id} not found`);
    }

    return learner;
  }

  async list(query: ListLearnersQueryDto): Promise<PaginatedResult<Learner>> {
    const schoolId = this.tenant.schoolId;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.LearnerWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.classId
        ? { classEnrollments: { some: { classId: query.classId } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { admissionNumber: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.learner.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          classEnrollments: {
            include: { class: true },
            orderBy: { id: "desc" },
            take: 1,
          },
        },
      }),
      this.prisma.learner.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async update(id: string, dto: UpdateLearnerDto, actor: AuthenticatedUser): Promise<Learner> {
    const schoolId = this.tenant.schoolId;
    const existing = await this.prisma.learner.findFirst({ where: { id, schoolId } });
    if (!existing) {
      throw new NotFoundException(`Learner ${id} not found`);
    }

    const data: Prisma.LearnerUpdateInput = {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.otherNames !== undefined ? { otherNames: dto.otherNames } : {}),
      ...(dto.dob !== undefined ? { dob: new Date(dto.dob) } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
      ...(dto.medicalNotes !== undefined ? { medicalNotes: dto.medicalNotes } : {}),
      ...(dto.allergies !== undefined ? { allergies: dto.allergies } : {}),
      ...(dto.bloodGroup !== undefined ? { bloodGroup: dto.bloodGroup } : {}),
      ...(dto.emergencyContactName !== undefined ? { emergencyContactName: dto.emergencyContactName } : {}),
      ...(dto.emergencyContactPhone !== undefined ? { emergencyContactPhone: dto.emergencyContactPhone } : {}),
    };

    const updated = await this.prisma.learner.update({ where: { id }, data });

    const diff = shallowDiff(existing as unknown as Record<string, unknown>, dto as Record<string, unknown>);

    if (Object.keys(diff).length > 0) {
      await this.auditService.log({
        schoolId,
        actorUserId: actor.sub,
        action: "LEARNER_UPDATED",
        entityType: "Learner",
        entityId: id,
        diff,
      });
    }

    return updated;
  }
}
