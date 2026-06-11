import "server-only";

export function getPerplexityKey(): string | undefined {
  return process.env.PERPLEXITY_API_KEY;
}

export interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PerplexityResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
}

export async function createPerplexityCompletion(
  messages: PerplexityMessage[],
  model: string = "sonar-pro"
): Promise<PerplexityResponse> {
  const apiKey = getPerplexityKey();
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set");
  }

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Perplexity API error: ${res.status} ${res.statusText} - ${errorText}`);
  }

  return res.json();
}
