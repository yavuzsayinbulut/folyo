import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ChatApp } from "@/components/chat/ChatApp";
import { getMe } from "@/lib/server-api";

export const metadata = { title: "Sohbetler", robots: { index: false, follow: false } };

/** Sohbet listesi ve acik konusma ayni yerlesimde kalir; konusmalar arasi geciste baglanti ve liste korunur. */
export default function ChatLayout({ children }: LayoutProps<"/sohbet">) {
  return (
    <Suspense fallback={<p className="p-8 text-ink-3">Yükleniyor…</p>}>
      <Chat />
      {children}
    </Suspense>
  );
}

async function Chat() {
  const me = await getMe();
  if (!me) redirect("/login?next=/sohbet");
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader me={me} />
      <ChatApp me={me} />
    </div>
  );
}
