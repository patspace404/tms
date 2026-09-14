import { TrashClient } from "./TrashClient";

export const dynamic = "force-dynamic";

export default async function TrashPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <TrashClient projectCode={code} />;
}
