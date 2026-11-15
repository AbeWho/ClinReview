"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, runAction, type ActionResult } from "@/lib/server/context";
import { addMember, createProject, removeMember, setProjectArchived, updateProject } from "@/lib/services/projects";

export async function createProjectAction(_: ActionResult<unknown> | null, fd: FormData) {
  const r = await runAction((tx, a) => createProject(tx, a, {
    name: formString(fd, "name"),
    clinical_domain: formString(fd, "clinical_domain"),
    description: formString(fd, "description"),
    dataset_purpose: formString(fd, "dataset_purpose"),
    taxonomy_version_id: formString(fd, "taxonomy_version_id"),
    rubric_version_id: formString(fd, "rubric_version_id"),
    default_required_annotations: formString(fd, "default_required_annotations"),
    blind_annotation: fd.get("blind_annotation") === "on",
  }));
  if (r.ok) redirect(`/projects/${r.data}`);
  return r;
}

export async function setArchivedAction(_: ActionResult<unknown> | null, fd: FormData) {
  const id = formString(fd, "project_id");
  const r = await runAction((tx, a) => setProjectArchived(tx, a, id, formString(fd, "archived") === "true"), "Project updated.");
  revalidatePath(`/projects/${id}`);
  return r;
}

export async function addMemberAction(_: ActionResult<unknown> | null, fd: FormData) {
  const id = formString(fd, "project_id");
  const r = await runAction((tx, a) => addMember(tx, a, id, formString(fd, "user_id"), formString(fd, "role")), "Member added.");
  revalidatePath(`/projects/${id}`);
  return r;
}

export async function removeMemberAction(_: ActionResult<unknown> | null, fd: FormData) {
  const id = formString(fd, "project_id");
  const r = await runAction((tx, a) => removeMember(tx, a, id, formString(fd, "user_id"), formString(fd, "role")), "Member removed.");
  revalidatePath(`/projects/${id}`);
  return r;
}

export async function updateProjectAction(_: ActionResult<unknown> | null, fd: FormData) {
  const id = formString(fd, "project_id");
  const r = await runAction((tx, a) => updateProject(tx, a, id, {
    name: formString(fd, "name"),
    clinical_domain: formString(fd, "clinical_domain"),
    description: formString(fd, "description"),
    dataset_purpose: formString(fd, "dataset_purpose"),
    taxonomy_version_id: formString(fd, "taxonomy_version_id"),
    rubric_version_id: formString(fd, "rubric_version_id"),
    default_required_annotations: formString(fd, "default_required_annotations"),
    blind_annotation: fd.get("blind_annotation") === "on",
  }));
  if (r.ok) {
    revalidatePath(`/projects/${id}`);
    redirect(`/projects/${id}`);
  }
  return r;
}
