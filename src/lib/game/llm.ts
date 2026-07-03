// Unified LLM client — multi-provider fallback chain.
//
// PRIMARY: GLM-4.6 (z.ai) — best Russian quality.
// FALLBACK CHAIN (tried in order if the primary provider fails):
//   1. GLM (z.ai)     — glm-4.6 → glm-4-plus → glm-4-air → glm-4-flash
//   2. Gemini (Google)— gemini-2.0-flash → gemini-1.5-flash
//   3. OpenRouter     — qwen3 → nvidia nemotron → llama-3.3 → gpt-oss
//   4. Ollama (local) — configurable model (default llama3.2)
//   5. z-ai-web-dev-sdk sandbox config (last resort, only inside z.ai sandbox)
//
// === ENVIRONMENT VARIABLES (one set per provider) ===
//
// GLM (primary, recommended):
//   GLM_API_KEY=...                        (z.ai API key)
//
// Gemini (fallback 1):
//   GEMINI_API_KEY=...                     (https://aistudio.google.com/apikey)
//
// OpenRouter (fallback 2 — free models incl. NVIDIA Nemotron, Qwen3, Llama 3.3):
//   OPENROUTER_API_KEY=sk-or-v1-...        (https://openrouter.ai/keys)
//
// Ollama (fallback 3, local, no key needed):
//   OLLAMA_BASE_URL=http://localhost:11434/v1
//   OLLAMA_MODEL=llama3.2
//
// If LLM_PROVIDER is set to a specific provider, ONLY that provider is used.

import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import os from "os";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  provider: string; // internal tag for request body customization
  model: string;
  fallbackModels: string[];
}

function parseList(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

/** GLM (z.ai) — primary provider. */
function glmConfig(): ProviderConfig | null {
  const apiKey = process.env.GLM_API_KEY || process.env.LLM_API_KEY || process.env.ZAI_PUBLIC_KEY || "";
  if (!apiKey) return null;
  return {
    name: "glm",
    provider: "zai",
    baseUrl: process.env.GLM_BASE_URL || process.env.LLM_BASE_URL || "https://api.z.ai/api/paas/v4",
    apiKey,
    model: process.env.GLM_MODEL || process.env.LLM_MODEL || "glm-4.6",
    fallbackModels: parseList(process.env.LLM_FALLBACK_MODELS).length
      ? parseList(process.env.LLM_FALLBACK_MODELS)
      : ["glm-4-plus", "glm-4-air", "glm-4-flash"],
  };
}

/** Gemini (Google) — fallback 1. */
function geminiConfig(): ProviderConfig | null {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) return null;
  return {
    name: "gemini",
    provider: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey,
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    fallbackModels: ["gemini-1.5-flash", "gemini-1.5-flash-8b"],
  };
}

/**
 * OpenRouter — fallback 2. Provides free access to NVIDIA Nemotron, Qwen3,
 * Llama 3.3, GPT-OSS, and other open models via a single API key.
 */
function openRouterConfig(): ProviderConfig | null {
  // Accept OPENROUTER_API_KEY, or detect an OpenRouter key in QWEN_API_KEY/LLM_API_KEY.
  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    (process.env.QWEN_API_KEY?.startsWith("sk-or-v1-") ? process.env.QWEN_API_KEY : "") ||
    (process.env.LLM_API_KEY?.startsWith("sk-or-v1-") ? process.env.LLM_API_KEY : "") ||
    "";
  if (!apiKey) return null;
  return {
    name: "openrouter",
    provider: "openrouter",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    apiKey,
    model: process.env.OPENROUTER_MODEL || "qwen/qwen3-next-80b-a3b-instruct:free",
    fallbackModels: parseList(process.env.OPENROUTER_FALLBACK_MODELS).length
      ? parseList(process.env.OPENROUTER_FALLBACK_MODELS)
      : [
          "nvidia/nemotron-3-super-120b-a12b:free",
          "meta-llama/llama-3.3-70b-instruct:free",
          "openai/gpt-oss-120b:free",
          "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
        ],
  };
}

/** Ollama (local) — fallback 3. No key required. */
function ollamaConfig(): ProviderConfig | null {
  const baseUrl = process.env.OLLAMA_BASE_URL || "";
  if (!baseUrl) return null;
  return {
    name: "ollama",
    provider: "ollama",
    baseUrl,
    apiKey: "ollama",
    model: process.env.OLLAMA_MODEL || "llama3.2",
    fallbackModels: [],
  };
}

/** Legacy single-provider mode. */
function legacyConfig(): ProviderConfig | null {
  const provider = (process.env.LLM_PROVIDER || "").toLowerCase();
  const apiKey = process.env.LLM_API_KEY || "";
  if (!provider || !apiKey) return null;

  if (provider === "groq") {
    return {
      name: "groq", provider: "groq",
      baseUrl: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
      apiKey, model: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
      fallbackModels: parseList(process.env.LLM_FALLBACK_MODELS),
    };
  }
  if (provider === "openai") {
    return {
      name: "openai", provider: "openai",
      baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
      apiKey, model: process.env.LLM_MODEL || "gpt-4o-mini",
      fallbackModels: parseList(process.env.LLM_FALLBACK_MODELS),
    };
  }
  if (provider === "custom") {
    return {
      name: "custom", provider: "custom",
      baseUrl: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
      apiKey,
      model: process.env.LLM_MODEL || "qwen/qwen3-next-80b-a3b-instruct:free",
      fallbackModels: parseList(process.env.LLM_FALLBACK_MODELS).length
        ? parseList(process.env.LLM_FALLBACK_MODELS)
        : [
            "nvidia/nemotron-3-super-120b-a12b:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "openai/gpt-oss-120b:free",
          ],
    };
  }
  return null;
}

/**
 * Resolve the ordered list of providers to try.
 * If LLM_PROVIDER is set → only that provider (legacy/test mode).
 * Otherwise → [GLM, Gemini, OpenRouter, Ollama] (skipping any without keys/config).
 */
function getProviderChain(): ProviderConfig[] {
  const legacy = legacyConfig();
  if (legacy) return [legacy];

  const chain: ProviderConfig[] = [];
  const glm = glmConfig();
  if (glm) chain.push(glm);
  const gemini = geminiConfig();
  if (gemini) chain.push(gemini);
  const openrouter = openRouterConfig();
  if (openrouter) chain.push(openrouter);
  const ollama = ollamaConfig();
  if (ollama) chain.push(ollama);
  return chain;
}

// ---------------------------------------------------------------------------
// Core: try every provider → every model within provider
// ---------------------------------------------------------------------------

async function callWithProviderChain(
  messages: ChatMessage[],
  stream: boolean,
  signal?: AbortSignal
): Promise<{ text: string | AsyncGenerator<string>; providerUsed: string; modelUsed: string }> {
  const chain = getProviderChain();
  if (chain.length === 0) {
    throw new Error(
      "No LLM provider configured. Set GLM_API_KEY (recommended), GEMINI_API_KEY, OPENROUTER_API_KEY, or OLLAMA_BASE_URL."
    );
  }

  let lastErr: any = null;
  for (const cfg of chain) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const models = [cfg.model, ...cfg.fallbackModels];
    for (const model of models) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        if (stream) {
          const gen = chatStreamProviderSingle(cfg.baseUrl, model, cfg.apiKey, cfg.provider, messages, signal);
          const first = await gen.next();
          if (first.done) continue;
          const rest = gen;
          async function* combined() {
            yield first.value as string;
            yield* rest;
          }
          console.log(`[LLM] ✓ ${cfg.name}/${model} (stream)`);
          return { text: combined(), providerUsed: cfg.name, modelUsed: model };
        } else {
          const text = await chatCompleteProviderSingle(cfg.baseUrl, model, cfg.apiKey, cfg.provider, messages, signal);
          if (text && text.trim().length > 0) {
            console.log(`[LLM] ✓ ${cfg.name}/${model} (${text.length} chars)`);
            return { text, providerUsed: cfg.name, modelUsed: model };
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        const msg = e?.message ?? "";
        console.error(`[LLM] ✗ ${cfg.name}/${model}: ${msg.slice(0, 100)}`);
        lastErr = e;
        continue;
      }
    }
  }
  throw lastErr ?? new Error("All LLM providers failed");
}

// ---------------------------------------------------------------------------
// SDK sandbox (last resort)
// ---------------------------------------------------------------------------

function hasSDKConfig(): boolean {
  const cwd = process.cwd();
  const home = os.homedir();
  for (const p of [path.join(cwd, ".z-ai-config"), path.join(home, ".z-ai-config"), "/etc/.z-ai-config"]) {
    try {
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (cfg.baseUrl && cfg.token) return true;
      }
    } catch {}
  }
  return false;
}

let sdkPromise: Promise<any> | null = null;
async function getSDK() {
  if (!sdkPromise) {
    sdkPromise = ZAI.create().catch((e: any) => {
      sdkPromise = null;
      throw e;
    });
  }
  return sdkPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Non-streaming chat completion. Tries the full provider chain. */
export async function chatComplete(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  try {
    const { text } = await callWithProviderChain(messages, false, signal);
    return text as string;
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    if (hasSDKConfig()) {
      console.warn("[LLM] all providers failed, trying z-ai-web-dev-sdk:", (e as Error)?.message?.slice(0, 80));
      try {
        return await chatCompleteSDK(messages);
      } catch (e2) {
        console.error("[LLM] SDK fallback also failed:", (e2 as Error)?.message?.slice(0, 80));
      }
    }
    throw e;
  }
}

/** Streaming chat completion. Yields text chunks. Tries the full provider chain. */
export async function* chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  try {
    const { text } = await callWithProviderChain(messages, true, signal);
    yield* text as AsyncGenerator<string>;
    return;
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    if (hasSDKConfig()) {
      console.warn("[LLM] all providers failed, trying z-ai-web-dev-sdk:", (e as Error)?.message?.slice(0, 80));
      try {
        yield* chatStreamSDK(messages);
        return;
      } catch (e2) {
        console.error("[LLM] SDK fallback also failed:", (e2 as Error)?.message?.slice(0, 80));
      }
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Provider single-model calls (OpenAI-compatible)
// ---------------------------------------------------------------------------

async function chatCompleteProviderSingle(
  baseUrl: string, model: string, apiKey: string, provider: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const body: any = { model, messages, stream: false };
  if (provider === "zai") body.thinking = { type: "disabled" };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://duskfall.app", "X-Title": "DUSKFALL" } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${provider} ${model} ${res.status}: ${errText.slice(0, 120)}`);
  }
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function* chatStreamProviderSingle(
  baseUrl: string, model: string, apiKey: string, provider: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const body: any = { model, messages, stream: true };
  if (provider === "zai") body.thinking = { type: "disabled" };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://duskfall.app", "X-Title": "DUSKFALL" } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${provider} ${model} stream ${res.status}: ${errText.slice(0, 120)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* skip malformed */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SDK (z.ai sandbox fallback)
// ---------------------------------------------------------------------------

async function chatCompleteSDK(messages: ChatMessage[]): Promise<string> {
  const zai = await getSDK();
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
  });
  return completion.choices[0]?.message?.content ?? "";
}

async function* chatStreamSDK(messages: ChatMessage[]): AsyncGenerator<string> {
  const zai = await getSDK();
  const streamBody: any = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
    stream: true,
  });
  if (streamBody && typeof streamBody.getReader === "function") {
    const reader = streamBody.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

export function logLLMMode() {
  const chain = getProviderChain();
  if (chain.length > 0) {
    const summary = chain.map(
      (c) => `${c.name}(${c.model}${c.fallbackModels.length ? "+" + c.fallbackModels.length : ""})`
    ).join(" → ");
    console.log(`[LLM] chain: ${summary}`);
    if (hasSDKConfig()) console.log("[LLM] last-resort: z-ai-web-dev-sdk (sandbox config)");
  } else if (hasSDKConfig()) {
    console.log("[LLM] provider: z-ai-web-dev-sdk (config file) — no API keys set");
  } else {
    console.log("[LLM] WARNING: no provider configured. Set GLM_API_KEY (recommended).");
  }
}
