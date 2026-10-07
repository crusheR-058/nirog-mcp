import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EncounterRecord, NirogData, PatientRecord } from "./types.js";

/**
 * Reads the Nirog doctor-portal Supabase project. Table and column names come from the
 * Prisma schema (PascalCase tables, camelCase columns). Uses the service key for now;
 * Day 6 replaces this with a narrow `alexa` role plus consent checks.
 */
export class SupabaseData implements NirogData {
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async getPatient(patientId: string): Promise<PatientRecord | null> {
    const { data, error } = await this.client
      .from("Patient")
      .select("id, fullName, preferredLanguage, allergies, conditions, currentMedications")
      .eq("id", patientId)
      .maybeSingle();
    if (error) throw new Error(`Patient lookup failed: ${error.message}`);
    return (data as PatientRecord | null) ?? null;
  }

  async getLatestEncounter(patientId: string): Promise<EncounterRecord | null> {
    const { data, error } = await this.client
      .from("Encounter")
      .select(
        "id, patientId, startedAt, endedAt, chiefComplaint, assessment, clinicalNotes, prescriptions, labRequests, followUp",
      )
      .eq("patientId", patientId)
      .not("endedAt", "is", null)
      .order("startedAt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Encounter lookup failed: ${error.message}`);
    if (!data) return null;
    return {
      ...(data as Omit<EncounterRecord, "prescriptions" | "labRequests" | "followUp">),
      prescriptions: (data.prescriptions as EncounterRecord["prescriptions"]) ?? [],
      labRequests: (data.labRequests as EncounterRecord["labRequests"]) ?? [],
      followUp: (data.followUp as EncounterRecord["followUp"]) ?? null,
    };
  }
}
