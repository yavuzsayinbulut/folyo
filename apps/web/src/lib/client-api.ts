import type { Me } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/** Spring Security SPA CSRF: XSRF-TOKEN cookie'sini X-XSRF-TOKEN header'i olarak geri gonder. */
async function csrfToken(): Promise<string> {
  let token = readCookie("XSRF-TOKEN");
  if (!token) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
    token = readCookie("XSRF-TOKEN");
  }
  return token ?? "";
}

export async function api<T = void>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-XSRF-TOKEN"] = await csrfToken();

  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    let message = "Bir şeyler ters gitti, tekrar dene";
    try {
      const problem = await res.json();
      if (problem?.detail) message = problem.detail;
    } catch {
      // gövde JSON degilse genel mesaj kalir
    }
    if (res.status === 401) message = "Önce giriş yap";
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Tek dosya yukler (multipart). Content-Type'i tarayici boundary ile kendisi koyar. Buyuk dosyalarda (video)
 * ilerleme gosterilebilsin diye XMLHttpRequest kullanilir; fetch yukleme ilerlemesi vermez.
 */
export async function upload<T>(
  path: string,
  file: File | Blob,
  options: { method?: "POST" | "PUT"; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const token = await csrfToken();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? "POST", path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-XSRF-TOKEN", token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((xhr.responseText ? JSON.parse(xhr.responseText) : undefined) as T);
        } catch {
          reject(new ApiError(xhr.status, "Yanıt okunamadı"));
        }
        return;
      }
      let message = xhr.status === 413 ? "Dosya çok büyük" : "Yüklenemedi";
      try {
        const problem = JSON.parse(xhr.responseText);
        if (problem?.detail) message = problem.detail;
      } catch {
        // govde JSON degil
      }
      if (xhr.status === 401) message = "Önce giriş yap";
      reject(new ApiError(xhr.status, message));
    };
    xhr.onerror = () => reject(new ApiError(0, "Bağlantı koptu, tekrar dene"));
    xhr.onabort = () => reject(new ApiError(0, "Yükleme iptal edildi"));
    options.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

/** Giris yoksa null doner. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await api<Me>("/api/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
