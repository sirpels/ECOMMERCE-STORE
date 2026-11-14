// lib/rate-limit.ts

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export interface RateLimitConfig {
  url: string;
  // Token is validated for presence/non-emptiness only.
  // It is never logged, printed, or exposed to the browser.
  _token: string;
}

export interface RateLimiter {
  limit: (identifier: string) => Promise<{
    success: boolean;
    reason?: string;
    limit: number;
    remaining: number;
    reset: number;
  }>;
}

export function resolveRateLimitConfig(): RateLimitConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const trimmedUrl = url.trim();
  const trimmedToken = token.trim();

  if (!trimmedUrl || !trimmedToken) {
    return null;
  }

  try {
    const parsed = new URL(trimmedUrl);

    if (parsed.protocol !== "https:") {
      return null;
    }

    if (!parsed.hostname) {
      return null;
    }
  } catch {
    return null;
  }

  return { url: trimmedUrl, _token: trimmedToken };
}

export function createProductionRateLimiter(): RateLimiter | null {
  const config = resolveRateLimitConfig();
  if (!config) {
    return null;
  }

  const signal = AbortSignal.timeout(5000);

  const redis = new Redis({
    url: config.url,
    token: config._token,
    signal,
  });

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "ratelimit:chat",
    timeout: 6000,
  });
}