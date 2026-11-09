import { useCallback } from "react";
import { API_URL } from "./config";
import { useSession } from "./session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Init = { method?: string; body?: unknown; form?: FormData };

/** Bearer token'li API cagrisi. 401 gelirse token gecersizdir; oturum kapatilir ve giris ekranina donulur. */
export function useApi() {
  const { token, signOut } = useSession();

  return useCallback(
    async <T = void>(path: string, init: Init = {}): Promise<T> => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (init.body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(`${API_URL}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      });
      if (response.status === 401) {
        await signOut();
        throw new ApiError(401, "Oturumun sona erdi, tekrar giriş yap");
      }
      if (!response.ok) {
        let message = "Bir şeyler ters gitti, tekrar dene";
        try {
          const problem = await response.json();
          if (problem?.detail) message = problem.detail;
        } catch {
          // govde JSON degil
        }
        throw new ApiError(response.status, message);
      }
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    },
    [token, signOut],
  );
}

/** Gorsel isteklerine eklenecek kimlik: kitlesi kisitli kartlarin fotograflari sahibine de token'la gelir. */
export function useAuthHeaders(): Record<string, string> | undefined {
  const { token } = useSession();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export type PickedFile = { uri: string; name: string; type: string };

/**
 * Dosya yukler (multipart, Bearer). XMLHttpRequest yukleme ilerlemesi verir; buyuk videolarda yuzde gosterilir.
 * Dosya oldugu gibi gider: sikistirma yok, kalite sunucuda korunur.
 */
export function useUpload() {
  const { token, signOut } = useSession();
  return useCallback(
    <T,>(path: string, file: PickedFile, options: { method?: "POST" | "PUT"; onProgress?: (fraction: number) => void } = {}) =>
      new Promise<T>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file as unknown as Blob);
        const xhr = new XMLHttpRequest();
        xhr.open(options.method ?? "POST", `${API_URL}${path}`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
        };
        xhr.onload = () => {
          if (xhr.status === 401) {
            signOut();
            return reject(new ApiError(401, "Oturumun sona erdi, tekrar giriş yap"));
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              return resolve((xhr.responseText ? JSON.parse(xhr.responseText) : undefined) as T);
            } catch {
              return reject(new ApiError(xhr.status, "Yanıt okunamadı"));
            }
          }
          let message = xhr.status === 413 ? "Dosya çok büyük" : "Yüklenemedi";
          try {
            const problem = JSON.parse(xhr.responseText);
            if (problem?.detail) message = problem.detail;
          } catch {
            // govde JSON degil
          }
          reject(new ApiError(xhr.status, message));
        };
        xhr.onerror = () => reject(new ApiError(0, "Bağlantı koptu, tekrar dene"));
        xhr.send(form);
      }),
    [token, signOut],
  );
}
