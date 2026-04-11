"use client";

import { Sidebar } from "@/components/Sidebar";
import { useClient } from "@/lib/client-context";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const { familyName, membersCount, loading } = useClient();

  return (
    <>
      <Sidebar
        familyName={loading ? "טוען..." : familyName}
        membersCount={membersCount}
        advisorName="ניר יפרח"
      />
      <main className="mr-[280px] min-h-screen px-10 py-8">{children}</main>
    </>
  );
}
