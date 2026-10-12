import { chromium, type Browser, type Page } from "playwright-core";

export type ShelfBrowser = { browser: Browser; page: Page };
export type BrowserCapability = { available: boolean; reason: string | null };

let capabilityPromise: Promise<BrowserCapability> | null = null;

function appOrigin(): string {
  const configured = process.env.QURUS_APP_ORIGIN ?? "http://127.0.0.1";
  const parsed = new URL(configured);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("QURUS_APP_ORIGIN must use HTTP or HTTPS.");
  }
  return parsed.origin;
}

function redactBrowserError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown Chromium error.";
  const key = process.env.GEMINI_API_KEY;
  return (key ? raw.split(key).join("[redacted]") : raw).slice(0, 400);
}

export async function openShelfBrowser(deadlineMs = Date.now() + 90_000): Promise<ShelfBrowser> {
  const remainingMs = Math.floor(deadlineMs - Date.now());
  if (remainingMs <= 0) throw new Error("The 90-second visual run limit was reached before Chromium started.");

  const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    timeout: Math.max(1, Math.min(15_000, remainingMs)),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const origin = appOrigin();
    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const request = route.request();
      if (
        requestUrl.origin !== origin ||
        (request.resourceType() === "document" && requestUrl.pathname !== "/library")
      ) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    const navigationTimeout = Math.floor(deadlineMs - Date.now());
    if (navigationTimeout <= 0) {
      throw new Error("The 90-second visual run limit was reached while opening /library.");
    }
    const response = await page.goto(new URL("/library", origin).toString(), {
      waitUntil: "networkidle",
      timeout: navigationTimeout,
    });
    if (!response?.ok()) {
      throw new Error(`/library returned HTTP ${response?.status() ?? "no response"}.`);
    }
    return { browser, page };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}

export async function getBrowserCapability(): Promise<BrowserCapability> {
  if (!capabilityPromise) {
    capabilityPromise = (async () => {
      try {
        const opened = await openShelfBrowser(Date.now() + 20_000);
        await opened.browser.close();
        return { available: true, reason: null };
      } catch (error) {
        return { available: false, reason: redactBrowserError(error) };
      }
    })();
  }
  return capabilityPromise;
}

export function markBrowserUnavailable(reason: string): void {
  capabilityPromise = Promise.resolve({
    available: false,
    reason: redactBrowserError(new Error(reason)),
  });
}
