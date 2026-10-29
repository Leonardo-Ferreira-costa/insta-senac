import React, { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import { File, UploadType } from "expo-file-system";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
type ApiContextValue = {
  token: string | null;
  setToken: (token: string | null) => void;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  uploadFile: <T>(path: string, uri: string, mimeType: string, parameters: Record<string, string>) => Promise<T>;
};
const ApiContext = createContext<ApiContextValue | null>(null);

export function resolveMediaUrl(mediaUrl: string) {
  if (/^https?:\/\//i.test(mediaUrl) || !API_URL) return mediaUrl;
  return new URL(mediaUrl, API_URL).toString();
}

export function ApiProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    if (!API_URL) {
      throw new Error(
        "EXPO_PUBLIC_API_URL não configurada. Defina a URL da API acessível pelo dispositivo e reinicie o Expo.",
      );
    }
    const isMultipart = typeof FormData !== "undefined" && init.body instanceof FormData;
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(!isMultipart ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    }).catch((error: unknown) => {
      const cause = error instanceof Error ? error.message : "Erro de rede desconhecido";
      throw new Error(
        `Não foi possível conectar à API em ${API_URL}. ` +
          "Confira EXPO_PUBLIC_API_URL, a rede Wi-Fi e se o backend está acessível no computador. " +
          `Detalhe: ${cause}`,
      );
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Falha na solicitação (${response.status})`);
    }
    return response.status === 204 ? (undefined as T) : response.json();
  }, [token]);
  const uploadFile = useCallback(async <T,>(
    path: string,
    uri: string,
    mimeType: string,
    parameters: Record<string, string>,
  ): Promise<T> => {
    if (!API_URL) {
      throw new Error(
        "EXPO_PUBLIC_API_URL não configurada. Defina a URL da API acessível pelo dispositivo e reinicie o Expo.",
      );
    }
    const url = `${API_URL.replace(/\/+$/, "")}${path}`;
    let result: Awaited<ReturnType<File["upload"]>>;
    try {
      result = await new File(uri).upload(url, {
        uploadType: UploadType.MULTIPART,
        fieldName: "media",
        mimeType,
        headers: token ? { Authorization: "Bearer " + token } : {},
        parameters,
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : "Erro de rede desconhecido";
      throw new Error(
        `Não foi possível enviar o arquivo para ${url}. Confira a conexão e tente novamente. Detalhe: ${cause}`,
      );
    }
    let body: { error?: string } & Record<string, unknown>;
    try {
      body = JSON.parse(result.body);
    } catch {
      throw new Error(`A API retornou uma resposta inválida (HTTP ${result.status}).`);
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(body.error ?? `Falha na solicitação (${result.status})`);
    }
    return body as T;
  }, [token]);
  const value = useMemo(() => ({ token, setToken, request, uploadFile }), [token, request, uploadFile]);
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) throw new Error("useApi deve ser usado dentro de ApiProvider");
  return context;
}

export type User = {
  id: string;
  email: string;
  enrollment_number: string;
  name: string;
  bio: string;
  photo_url: string | null;
  category_id: string;
  category: string;
};

export type Post = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string;
  created_at: string;
  user_name?: string;
  user_photo_url?: string | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  relevance_score?: number;
  viewed?: boolean;
  comments_preview?: PostComment[];
};

export type PostComment = {
  id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
};
