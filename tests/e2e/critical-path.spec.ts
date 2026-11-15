import { expect, test, type Page } from "@playwright/test";

/** The acceptance demo from CLAUDE.md, driven entirely through the UI. Tests run in order. */
test.describe.configure({ mode: "serial" });

const CASE_TITLE = `E2E chest pain triage ${Date.now()}`;
const RESPONSE = "This is most likely muscle strain. Rest at home and take an over-the-counter pain reliever. See your doctor next week if it continues.";

async function signIn(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto("/signin");
  await page.getByRole("button", { name: new RegExp(persona) }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("1. lead creates a synthetic case, prompt version, model response and queued task", async ({ page }) => {
  await signIn(page, "Demo Project Lead");
  await page.getByRole("link", { name: "Projects" }).first().click();
  await page.getByRole("link", { name: /Heart Failure & Medication Safety/ }).click();
  await page.getByRole("link", { name: "Add synthetic case" }).first().click();

  await page.getByLabel("Case title").fill(CASE_TITLE);
  await page.getByLabel("Chief complaint").fill("Sudden chest pain while shoveling snow");
  await page.getByLabel("History of present illness").fill("Pressure-like chest pain for 20 minutes with shortness of breath and sweating.");
  await page.getByLabel(/Source \/ provenance notes/).fill("Fictional vignette written for the end-to-end test.");
  await page.getByLabel(/fully synthetic/).check();
  await page.getByRole("button", { name: "Save synthetic case" }).click();
  await expect(page.getByRole("heading", { level: 1, name: CASE_TITLE })).toBeVisible();

  await page.getByLabel("Insert template").selectOption("triage");
  await expect(page.getByLabel(/Prompt text/)).toHaveValue(/How urgently/);
  await page.getByRole("button", { name: "Save version 1" }).click();
  await expect(page.getByText("Saved prompt version 1.")).toBeVisible();

  await page.getByLabel("Model name").fill("e2e-example-model");
  await page.getByLabel("Response text").fill(RESPONSE);
  await page.getByRole("button", { name: "Attach response" }).click();
  await expect(page.getByText("Model response attached (immutable).")).toBeVisible();

  await page.getByLabel("Priority").selectOption("urgent");
  await page.getByLabel("Demo Annotator A").check();
  await page.getByRole("button", { name: "Queue task" }).click();
  // The queue form is replaced by a link to the new task, showing its server-computed status.
  await expect(page.getByRole("link", { name: /Task\s*Labeling/ })).toBeVisible();
});

async function openMyTask(page: Page) {
  await page.goto("/queue?assignee=me");
  await page.getByRole("link", { name: CASE_TITLE }).click();
}

test("2. annotator saves a partial draft, resumes after refresh, then submits", async ({ page }) => {
  await signIn(page, "Demo Annotator A");
  await openMyTask(page);
  await page.getByRole("button", { name: "Start labeling" }).click();

  await page.getByLabel("Clinical task type").selectOption("triage_escalation");
  await page.locator("label", { hasText: /^Incorrect$/ }).click();
  await page.getByLabel("Rationale").fill("Exertional chest pressure with sweating is a red flag for acute coronary syndrome; reassurance delays care.");
  await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 10_000 });

  // Incomplete: submit must be refused with field errors.
  await page.getByRole("button", { name: "Submit annotation" }).click();
  await expect(page.getByText("The annotation is incomplete", { exact: false })).toBeVisible();

  // Refresh and resume.
  await page.reload();
  await expect(page.getByLabel("Rationale")).toHaveValue(/red flag for acute coronary syndrome/);

  await page.locator("label", { hasText: /^Critical$/ }).click();
  await page.getByLabel("Missed red flag").check();
  await page.getByLabel("Insufficient escalation").check();
  for (const dim of ["accuracy", "safety", "reasoning", "completeness", "communication"]) {
    await page.locator(`[role=radiogroup][aria-labelledby="dim-${dim}"] label`).nth(1).click();
  }
  await page.getByLabel(/Your confidence/).fill("0.9");
  await page.getByLabel("Escalation recommendation").fill("Call emergency services now for possible acute coronary syndrome.");
  await page.getByLabel("Add evidence by exact quote").fill("This is most likely muscle strain.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("mark", { hasText: "This is most likely muscle strain." })).toBeVisible();
  await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Submit annotation" }).click();
  await expect(page.getByText("Submitted: awaiting independent review")).toBeVisible();
});

test("3. reviewer requests changes, annotator revises, reviewer approves", async ({ page }) => {
  await signIn(page, "Demo Reviewer");
  await page.goto("/review");
  await page.getByRole("link", { name: CASE_TITLE }).first().click();
  await page.getByLabel("Comments").fill("Please name the specific red-flag features from the vignette in your rationale.");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText(/Review recorded \(needs changes\)/)).toBeVisible();

  await signIn(page, "Demo Annotator A");
  await openMyTask(page);
  await expect(page.getByText("Please name the specific red-flag features").first()).toBeVisible();
  await page.getByRole("button", { name: "Start revision 2" }).click();
  await expect(page.getByText(/Revision 2: reviewer feedback/)).toBeVisible();
  await page.getByLabel("Rationale").fill("Red flags: exertional onset, pressure quality, diaphoresis and dyspnea. Calling this muscle strain delays emergency care for possible ACS.");
  await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Submit annotation" }).click();
  await expect(page.getByText("Submitted: awaiting independent review")).toBeVisible();

  await signIn(page, "Demo Reviewer");
  await page.goto("/review");
  await page.getByRole("link", { name: CASE_TITLE }).first().click();
  await expect(page.getByText("Earlier revisions by this annotator")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Review recorded \(approve\)/)).toBeVisible();
});

test("4. adjudicator resolves the seeded two-annotator disagreement", async ({ page }) => {
  await signIn(page, "Demo Adjudicator");
  await page.goto("/adjudication");
  await page.getByRole("link", { name: /Warfarin/ }).first().click();
  await expect(page.getByText("Rubric deltas")).toBeVisible();
  await page.getByLabel("Final rationale").fill("Missed warfarin and TMP-SMX interaction without INR monitoring.");
  await page.getByLabel("Reconciliation note").fill("The interaction is the core requested task; both annotators identified it. Final: incorrect, high severity.");
  await page.getByRole("button", { name: "Finalize adjudication" }).click();
  await expect(page.getByText("Adjudicated final label")).toBeVisible();
  await expect(page.getByText("Both independent annotations below are preserved unchanged.")).toBeVisible();
});

test("5. lead exports a versioned JSONL dataset that validates", async ({ page }) => {
  await signIn(page, "Demo Project Lead");
  await page.goto("/exports");
  await expect(page.getByText("Awaiting mandatory clinical review").first()).toBeVisible();
  await page.getByRole("button", { name: /Generate export \(4 records\)/ }).click();
  await expect(page.getByText(/Created immutable export v1\.0\.0 with 4 records/)).toBeVisible();

  const href = await page.getByRole("link", { name: "JSONL" }).first().getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("clinreview-1.0.0.jsonl");
  const lines = (await res.text()).trim().split("\n");
  expect(lines).toHaveLength(4);
  for (const line of lines) {
    const rec = JSON.parse(line);
    expect(rec.schema_version).toBe("1.0.0");
    expect(rec.case_classification).toBe("synthetic");
    expect(["train", "validation", "test"]).toContain(rec.split);
  }
  expect(lines.some((l) => JSON.parse(l).model_response.text === RESPONSE)).toBe(true);

  // Downloads require a session.
  await page.context().clearCookies();
  expect((await page.request.get(href!)).status()).toBe(401);
});

test("6. viewers cannot create exports and annotators cannot see other annotators' labels", async ({ page }) => {
  await signIn(page, "Demo Viewer");
  await page.goto("/exports");
  await expect(page.getByText("Only project owners/admins can create exports")).toBeVisible();

  await signIn(page, "Demo Annotator B");
  await page.goto("/queue?assignee=me");
  await page.getByRole("link", { name: /HFrEF/ }).click();
  await expect(page.getByText("Demo Annotator A", { exact: true })).toHaveCount(0);
});

test("7. lead bulk-imports cases with a dry-run preview, then edits a case and the project", async ({ page }) => {
  await signIn(page, "Demo Project Lead");
  await page.goto("/cases");
  await page.getByRole("link", { name: /Import CSV/ }).click();
  const csv = [
    "title,age_band,sex,chief_complaint,hpi,source_notes,case_group_key",
    `"E2E import one",40-49,female,"Palpitations","Intermittent palpitations for a week.","Fictional e2e row.",grp`,
    `"E2E import bad",40-49,female,"","x","Fictional e2e row.",`,
    `"E2E import two",40-49,female,"Palpitations","Palpitations with dizziness for two days.","Fictional e2e row.",grp`,
  ].join("\n");
  await page.getByLabel(/File \(\.csv or \.jsonl/).setInputFiles({ name: "e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Preview (dry run)" }).click();
  await expect(page.getByText(/2 of 3 row\(s\) valid/)).toBeVisible();
  await expect(page.getByText("Nothing has been saved yet.")).toBeVisible();
  await page.getByLabel(/every case in this file is/).check();
  await page.getByRole("button", { name: "Import 2 valid case(s)" }).click();
  await expect(page.getByText("Imported 2 case(s); skipped 1.")).toBeVisible();

  // Edit an imported case (no prompt yet, so it is editable).
  await page.goto("/cases");
  await page.getByRole("link", { name: "E2E import one" }).click();
  await page.getByRole("link", { name: "Edit case" }).click();
  await page.getByLabel("Case title").fill("E2E import one (edited)");
  await page.getByLabel(/fully synthetic/).check(); // edits must be re-attested as synthetic
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E import one (edited)" })).toBeVisible();

  // Edit the project; taxonomy is locked because annotations exist.
  await page.goto("/projects");
  await page.getByRole("link", { name: /Heart Failure & Medication Safety/ }).click();
  await page.getByRole("link", { name: "Edit project" }).click();
  await expect(page.getByText("Locked: annotations already use this version.").first()).toBeVisible();
  await page.getByLabel("Description / scope").fill("Edited in the end-to-end test.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Edited in the end-to-end test.")).toBeVisible();
});
