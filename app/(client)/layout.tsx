import { Sidebar } from "@/components/Sidebar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar
        familyName="משפחת יפרח"
        membersCount={4}
        advisorName="ניר יפרח"
      />
      <main className="mr-[280px] min-h-screen px-10 py-8">{children}</main>
    </>
  );
}
