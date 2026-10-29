export const MAX_VIDEO_DURATION_MS = 60_000;

export function validateVideoDuration(durationMs: number | null | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "Não foi possível verificar a duração do vídeo.";
  }
  return durationMs > MAX_VIDEO_DURATION_MS ? "O vídeo deve ter no máximo 1 minuto." : null;
}
