import { Suspense } from "react";
import { Editor } from "@/components/editor/Editor";

export const metadata = { title: "Sayfanı düzenle" };

export default function EditPage() {
  return (
    <Suspense fallback={<p className="p-8 text-ink-3">Yükleniyor…</p>}>
      <Editor />
    </Suspense>
  );
}
