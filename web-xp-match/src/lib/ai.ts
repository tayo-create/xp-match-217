const TOOLKIT_URL = (import.meta.env.EXPO_PUBLIC_TOOLKIT_URL as string | undefined) ?? "https://toolkit.rork.com";

const PRIMARY_MODEL = "google/gemini-3.8-flash";
const FALLBACK_MODELS = ["google/gemini-3.7-flash", "google/gemini-3.5-flash-lite"];

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const extractJson = (text: string): unknown => {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The AI response was not valid JSON.");
  }
};

/**
 * Calls the Rork Toolkit chat-completions proxy and parses a JSON object reply.
 * Browser auth is injected by the Rork runtime, so no secret is sent from here.
 */
export async function chatJson<T>(messages: AiMessage[], opts?: { temperature?: number; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`${TOOLKIT_URL}/v2/vercel/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts?.signal,
    body: JSON.stringify({
      model: PRIMARY_MODEL,
      messages,
      temperature: opts?.temperature ?? 0.7,
      response_format: { type: "json_object" },
      providerOptions: { gateway: { models: FALLBACK_MODELS } },
    }),
  });
  if (!res.ok) {
    console.warn("[ai] request failed", res.status);
    throw new Error(res.status === 429 ? "The concierge is busy — try again in a moment." : "The concierge couldn't respond right now.");
  }
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content
      .map((part: unknown) => (typeof part === "object" && part !== null && "text" in part ? String((part as { text: unknown }).text) : ""))
      .join("");
  }
  if (!text) throw new Error("The concierge sent an empty reply.");
  return extractJson(text) as T;
}
