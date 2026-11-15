import type { Scenario } from "@/lib/validation/case";

/** Local, predefined synthetic starting points (no generation, no identifying details). */
export const CASE_TEMPLATES: { key: string; title: string; scenario: Scenario }[] = [
  {
    key: "pneumonia_older_adult",
    title: "Cough and fever in an older adult with COPD (synthetic)",
    scenario: {
      age_band: "70-79", sex: "female", chief_complaint: "3 days of productive cough and fever",
      hpi: "Productive cough with yellow sputum, subjective fevers and increased breathlessness over 3 days. Eating less. No chest pain.",
      past_history: "", comorbidities: ["COPD", "Hypertension"], medications: ["Tiotropium inhaler daily", "Lisinopril 20 mg daily"], allergies: ["Sulfa (hives)"],
      vitals: { bp: "112/70", hr: "104", rr: "24", spo2: "90% room air", temp_c: "38.4" }, labs: ["WBC 14.2 x10^9/L"], social_factors: "Lives alone; former smoker.",
    },
  },
  {
    key: "hypoglycemia_sulfonylurea",
    title: "Confusion in a patient taking a sulfonylurea (synthetic)",
    scenario: {
      age_band: "80-89", sex: "male", chief_complaint: "Morning confusion and sweating",
      hpi: "Family found him sweaty and confused this morning; improved after drinking juice. Reduced oral intake for 2 days due to a cold.",
      past_history: "", comorbidities: ["Type 2 diabetes", "CKD stage 3b"], medications: ["Glipizide 10 mg twice daily", "Metformin 500 mg daily"], allergies: [],
      vitals: { bp: "136/80", hr: "88", rr: "16", spo2: "97% room air", temp_c: "36.6" }, labs: ["Fingerstick glucose 52 mg/dL (before juice)", "eGFR 38"], social_factors: "Lives with daughter.",
    },
  },
];
