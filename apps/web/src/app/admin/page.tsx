import type { Metadata } from "next";
import { AdminPanel } from "./AdminPanel";

export const metadata: Metadata = { title: "Yönetim", robots: { index: false } };

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <AdminPanel />
    </main>
  );
}
