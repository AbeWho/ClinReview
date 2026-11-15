import type { Scenario } from "@/lib/validation/case";

export interface PromptTemplate {
  key: string;
  label: string;
  task_type: string;
  body: string;
}

/** Reusable scenario templates. {{variables}} are filled from the structured case. */
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    key: "differential",
    label: "Differential diagnosis",
    task_type: "diagnosis_differential",
    body: "A patient in the {{age_band}} age band ({{sex}}) presents with {{chief_complaint}}. History: {{hpi}}\nComorbidities: {{comorbidities}}. Medications: {{medications}}. Allergies: {{allergies}}.\nVitals: {{vitals}}. Labs: {{labs}}.\n\nWhat is the most likely diagnosis, and what are the key differential diagnoses? Explain your reasoning using the case details.",
  },
  {
    key: "medication_safety",
    label: "Medication safety",
    task_type: "contraindications_interactions",
    body: "A patient in the {{age_band}} age band ({{sex}}) with {{comorbidities}} takes: {{medications}}. Allergies: {{allergies}}. Labs: {{labs}}.\nPresenting concern: {{chief_complaint}}. {{hpi}}\n\nIdentify any medication safety concerns (interactions, contraindications, dose adjustments) and what should be monitored.",
  },
  {
    key: "triage",
    label: "Triage / escalation",
    task_type: "triage_escalation",
    body: "A patient in the {{age_band}} age band ({{sex}}) reports {{chief_complaint}}. {{hpi}}\nComorbidities: {{comorbidities}}. Medications: {{medications}}. Vitals: {{vitals}}.\n\nHow urgently should this patient be evaluated, and where? List any red-flag features.",
  },
  {
    key: "treatment",
    label: "Treatment planning",
    task_type: "treatment_planning",
    body: "A patient in the {{age_band}} age band ({{sex}}) with {{comorbidities}} presents with {{chief_complaint}}. {{hpi}}\nMedications: {{medications}}. Allergies: {{allergies}}. Vitals: {{vitals}}. Labs: {{labs}}.\n\nWhat is the most appropriate management plan, including medication adjustments and monitoring?",
  },
  {
    key: "monitoring",
    label: "Follow-up / monitoring",
    task_type: "follow_up_monitoring",
    body: "A patient in the {{age_band}} age band ({{sex}}) with {{comorbidities}} on {{medications}} was evaluated for {{chief_complaint}}. Labs: {{labs}}.\n\nWhat should be monitored over the next 1-2 weeks, how often, and what findings should prompt earlier reassessment?",
  },
];

export function scenarioVariables(s: Scenario): Record<string, string> {
  const list = (v: string[]) => (v.length ? v.join("; ") : "none listed");
  const vitals = [
    s.vitals.bp && `BP ${s.vitals.bp}`,
    s.vitals.hr && `HR ${s.vitals.hr}`,
    s.vitals.rr && `RR ${s.vitals.rr}`,
    s.vitals.spo2 && `SpO2 ${s.vitals.spo2}`,
    s.vitals.temp_c && `Temp ${s.vitals.temp_c} °C`,
  ].filter(Boolean);
  return {
    age_band: s.age_band,
    sex: s.sex,
    chief_complaint: s.chief_complaint,
    hpi: s.hpi,
    comorbidities: list(s.comorbidities),
    medications: list(s.medications),
    allergies: list(s.allergies),
    vitals: vitals.length ? vitals.join(", ") : "not recorded",
    labs: list(s.labs),
  };
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

/** Which key clinical context the prompt text actually includes (simple, transparent heuristic). */
export function contextChecklist(promptText: string, s: Scenario) {
  const has = (values: string[]) => values.length > 0 && values.some((v) => promptText.toLowerCase().includes(v.toLowerCase().slice(0, 24)));
  return [
    { label: "Chief complaint", present: has([s.chief_complaint]), applicable: true },
    { label: "Comorbidities", present: has(s.comorbidities), applicable: s.comorbidities.length > 0 },
    { label: "Medications", present: has(s.medications), applicable: s.medications.length > 0 },
    { label: "Allergies", present: has(s.allergies), applicable: s.allergies.length > 0 },
    { label: "Vitals", present: /\b(BP|HR|SpO2|RR)\b/.test(promptText), applicable: Object.values(s.vitals).some(Boolean) },
    { label: "Labs", present: has(s.labs), applicable: s.labs.length > 0 },
  ];
}
