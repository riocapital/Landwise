import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F4F0E7]">
      <Sidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
