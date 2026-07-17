"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { GuardianRelationship } from "@sms/shared-types";
import { ApiError, createLearner, getClasses } from "../../../../../lib/api-client";
import type { ClassDto, GuardianLinkInput } from "../../../../../lib/api-client";

interface GuardianFormRow {
  fullName: string;
  phonePrimary: string;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
}

const RELATIONSHIP_OPTIONS: GuardianRelationship[] = [
  "mother",
  "father",
  "guardian",
  "grandparent",
  "sibling",
  "other",
];

function emptyGuardianRow(): GuardianFormRow {
  return { fullName: "", phonePrimary: "", relationship: "mother", isPrimaryContact: false };
}

export default function NewLearnerPage() {
  const router = useRouter();

  const [admissionNumber, setAdmissionNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [otherNames, setOtherNames] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [admissionDate, setAdmissionDate] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [allergies, setAllergies] = useState("");
  const [classId, setClassId] = useState("");
  const [guardians, setGuardians] = useState<GuardianFormRow[]>([emptyGuardianRow()]);

  const [classes, setClasses] = useState<ClassDto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getClasses()
      .then(setClasses)
      .catch(() => {
        // Non-fatal: registration can still proceed without a class assignment.
      });
  }, []);

  function updateGuardian(index: number, patch: Partial<GuardianFormRow>) {
    setGuardians((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addGuardianRow() {
    setGuardians((rows) => [...rows, emptyGuardianRow()]);
  }

  function removeGuardianRow(index: number) {
    setGuardians((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    const guardianInputs: GuardianLinkInput[] = guardians
      .filter((row) => row.fullName.trim() && row.phonePrimary.trim())
      .map((row) => ({
        fullName: row.fullName.trim(),
        phonePrimary: row.phonePrimary.trim(),
        relationship: row.relationship,
        isPrimaryContact: row.isPrimaryContact,
      }));

    try {
      await createLearner({
        admissionNumber,
        firstName,
        lastName,
        otherNames: otherNames || undefined,
        dob,
        gender,
        admissionDate,
        medicalNotes: medicalNotes || undefined,
        allergies: allergies || undefined,
        classId: classId || undefined,
        guardians: guardianInputs.length > 0 ? guardianInputs : undefined,
      });

      setSuccess(true);
      router.push("/front-office/learners");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to register learner.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">Register a new learner</h1>
      <form onSubmit={handleSubmit} className="form">
        <fieldset>
          <legend>Learner details</legend>

          <div className="field">
            <label htmlFor="admissionNumber">Admission number</label>
            <input
              id="admissionNumber"
              value={admissionNumber}
              onChange={(e) => setAdmissionNumber(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="otherNames">Other names</label>
            <input id="otherNames" value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="dob">Date of birth</label>
            <input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="gender">Gender</label>
            <select id="gender" value={gender} onChange={(e) => setGender(e.target.value as "male" | "female")}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="admissionDate">Admission date</label>
            <input
              id="admissionDate"
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="medicalNotes">Medical notes</label>
            <textarea id="medicalNotes" value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="allergies">Allergies</label>
            <textarea id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="classId">Class</label>
            <select id="classId" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">— Not enrolled yet —</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>Guardians</legend>
          {guardians.map((row, index) => (
            <div key={index} className="form-row-group">
              <div className="field">
                <label htmlFor={`guardianName-${index}`}>Full name</label>
                <input
                  id={`guardianName-${index}`}
                  value={row.fullName}
                  onChange={(e) => updateGuardian(index, { fullName: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`guardianPhone-${index}`}>Phone</label>
                <input
                  id={`guardianPhone-${index}`}
                  value={row.phonePrimary}
                  onChange={(e) => updateGuardian(index, { phonePrimary: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`guardianRelationship-${index}`}>Relationship</label>
                <select
                  id={`guardianRelationship-${index}`}
                  value={row.relationship}
                  onChange={(e) => updateGuardian(index, { relationship: e.target.value as GuardianRelationship })}
                >
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field field-checkbox">
                <label htmlFor={`guardianPrimary-${index}`}>
                  <input
                    id={`guardianPrimary-${index}`}
                    type="checkbox"
                    checked={row.isPrimaryContact}
                    onChange={(e) => updateGuardian(index, { isPrimaryContact: e.target.checked })}
                  />
                  Primary contact
                </label>
              </div>
              {guardians.length > 1 && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeGuardianRow(index)}>
                  Remove guardian
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addGuardianRow}>
            Add another guardian
          </button>
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Registering..." : "Register learner"}
        </button>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        {success && <p className="alert alert-success">Learner registered successfully.</p>}
      </form>
    </main>
  );
}
