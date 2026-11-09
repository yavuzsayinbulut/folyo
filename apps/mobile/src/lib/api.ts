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
