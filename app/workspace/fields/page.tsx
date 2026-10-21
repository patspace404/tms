import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import FieldsClient from "./FieldsClient";

export const metadata = {
  title: "Fields - Workspace Settings | QMaster",
};

export default async function FieldsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex-1 bg-background text-text-main h-full overflow-y-auto">
      <FieldsClient />
    </div>
  );
}
