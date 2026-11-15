import type { Metadata } from "next";
import { createProjectAction } from "@/app/actions/projects";
import { ProjectForm } from "@/components/workflows/project-form";
import { Card, PageHeader } from "@/components/ui/primitives";
import { pageQuery } from "@/lib/server/context";
import { listDefinitionVersions } from "@/lib/services/projects";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const { taxonomies, rubrics } = await pageQuery((tx) => listDefinitionVersions(tx));
  return (
    <>
      <PageHeader title="New project" description="Define scope, the label definitions (taxonomy + rubric versions) and how many independent annotations each item needs." />
      <Card className="max-w-3xl p-5"><ProjectForm action={createProjectAction} taxonomies={taxonomies} rubrics={rubrics} submitLabel="Create project" /></Card>
    </>
  );
}
