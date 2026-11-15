export const ROLES = ["owner", "admin", "annotator", "reviewer", "adjudicator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Single source of truth for "who may do what". Enforced server-side (services) and mirrored by RLS. */
export const CAPABILITIES = {
  view: ROLES,
  manage_project: ["owner", "admin"],
  author_content: ["owner", "admin"], // cases, prompts, model responses
  assign_tasks: ["owner", "admin"],
  annotate: ["annotator"],
  review: ["reviewer"],
  adjudicate: ["adjudicator"],
  export: ["owner", "admin"],
} as const satisfies Record<string, readonly Role[]>;
export type Capability = keyof typeof CAPABILITIES;

export function can(roles: readonly Role[], capability: Capability): boolean {
  const allowed: readonly Role[] = CAPABILITIES[capability];
  return roles.some((r) => allowed.includes(r));
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Creates and configures the project, authors cases and prompts, assigns work and exports datasets.",
  admin: "Same management rights as the owner, without owning the project.",
  annotator: "Labels assigned model responses. Cannot see other annotators' labels while blind mode is on.",
  reviewer: "Independently reviews submitted annotations. Can never review their own work.",
  adjudicator: "Resolves disagreements between approved independent annotations.",
  viewer: "Read-only access to project artifacts and finalized labels.",
};
