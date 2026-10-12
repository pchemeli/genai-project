import { performance } from "node:perf_hooks";
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from "@google/genai";
import type {
  AgentLogEntry,
  AgentRunInput,
  AgentRunResult,
  AgentStatus,
  LibraryState,
  TextStep,
} from "@workspace/api-zod";
import { inputTextSession, startTextSession } from "./textSessionService";
import { readLibraryState } from "./libraryService";
import { acquireAgentRunLease, getAgentRunStatus, type AgentRunLease } from "./agentRunStore";
import { fixtureHash, recognize, verifyCommittedState } from "./verificationService";
import { getBrowserCapability, markBrowserUnavailable, openShelfBrowser } from "./shelfBrowser";

const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite";
const APPROVED_FREE_MODEL_ID = "gemini-3.1-flash-lite";
const TEXT_TURN_LIMIT = 12;
const VISUAL_TURN_LIMIT = 20;
const VISUAL_TIME_LIMIT_MS = 90_000;
const MODEL_CALL_TIMEOUT_MS = 30_000;

const TEXT_FUNCTIONS: FunctionDeclaration[] = [
  {
    name: "dial",
    description: "Start the Shelf text-menu web simulation using its displayed code *123#.",
    parameters: {
      type: Type.OBJECT,
      properties: { code: { type: Type.STRING, description: "The displayed session code *123#." } },
      required: ["code"],
    },
  },
  {
    name: "reply",
    description: "Enter exactly one digit shown on the current menu, or give a short final reply to the reader.",
    parameters: {
      type: Type.OBJECT,
      properties: { value: { type: Type.STRING, description: "A visible menu digit or a final plain-language response." } },
      required: ["value"],
    },
  },
  {
    name: "endSession",
    description: "End the current Shelf text-menu session using its 9 End option.",
  },
];
const TEXT_TOOL_NAMES = ["dial", "reply", "endSession"];

const VISUAL_FUNCTIONS: FunctionDeclaration[] = [
  {
    name: "click",
    description: "Click one visible point using 0 to 1000 normalized screenshot coordinates for both x and y.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.INTEGER, description: "Normalized horizontal position: 0 is left edge, 1000 is right edge." },
        y: { type: Type.INTEGER, description: "Normalized vertical position: 0 is top edge, 1000 is bottom edge." },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "type",
    description: "Type visible text into the currently focused field.",
    parameters: {
      type: Type.OBJECT,
      properties: { text: { type: Type.STRING, description: "Text to type into the focused field." } },
      required: ["text"],
    },
  },
  {
    name: "scroll",
    description: "Scroll the current page vertically.",
    parameters: {
      type: Type.OBJECT,
      properties: { deltaY: { type: Type.INTEGER, description: "Vertical scroll amount in pixels; positive scrolls down." } },
      required: ["deltaY"],
    },
  },
  {
    name: "press",
    description: "Press one ordinary keyboard key.",
    parameters: {
      type: Type.OBJECT,
      properties: { key: { type: Type.STRING, description: "A key such as Enter, Tab, Escape, Backspace, or an arrow key." } },
      required: ["key"],
    },
  },
  {
    name: "finish",
    description: "Finish after the visible page confirms the requested outcome or after deciding the request is unsupported.",
  },
];
const VISUAL_TOOL_NAMES = ["click", "type", "scroll", "press", "finish"];

const TEXT_SYSTEM_INSTRUCTION = [
  "You are Shelf's text-menu assistant for a fictional library class demo.",
  "The user task and the exact current visible text-menu screen are supplied on every turn.",
  "Use only the supplied dial(code), reply(value), and endSession() tools. Do not invent a menu, use hidden library data, or claim an action succeeded before its result is visible.",
  "Choose menu digits yourself from the exact current screen. Make one tool call per turn.",
  "Use reply(value) with one visible digit to navigate. Use reply(value) with a concise natural-language sentence for your final answer, then call endSession().",
  "If the request is unsupported, politely say so with reply(value) and endSession(); do not change any library records.",
  "For a renewal, inspect the confirmation screen and confirm only if it names the requested title and new due date.",
].join(" ");

const VISUAL_SYSTEM_INSTRUCTION = [
  "You are operating the fictional Shelf library website for a class demo.",
  "The user task and a fresh screenshot of only this app's /library page are supplied on every turn.",
  "The screenshot is your only observation: do not assume DOM, selectors, hidden state, source code, or off-screen text.",
  "The viewport is exactly 1280 by 800 CSS pixels. For click(x,y), return normalized coordinates from 0 to 1000 on each axis; x=0 is left, x=1000 right, y=0 top, y=1000 bottom. The runner maps them proportionally to viewport pixels. Use the center of a clearly visible control, not the edge or empty page.",
  "Use only click(x,y), type(text), scroll(deltaY), press(key), and finish(). Make one tool call per turn.",
  "After each action, inspect the next screenshot. Do not finish a mutation until the screenshot visibly shows its receipt or the changed loan/hold state. A click alone is not success.",
  "For a renewal, confirm only after the page visibly identifies the requested title and new due date; then verify the updated loan or receipt before finishing.",
  "For a due-date lookup, finish only after the requested title and due date are visible. If the expected result is not visible, keep working from the screenshot or finish without claiming success.",
  "If the request is unsupported or the visible UI blocks the requested action, do not try another action; call finish().",
].join(" ");

type UsageCall = AgentRunResult["usage"]["calls"][number];
type PublicRunStatus = AgentRunResult["status"];
type ModelClient = GoogleGenAI;

let cachedClient: ModelClient | null = null;

export function currentModelId(): string {
  return process.env.MODEL_ID?.trim() || DEFAULT_MODEL_ID;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) && currentModelId() === APPROVED_FREE_MODEL_ID;
}

function getGeminiClient(): ModelClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini is not configured. Add GEMINI_API_KEY through Replit Secrets.");
  }
  if (currentModelId() !== APPROVED_FREE_MODEL_ID) {
    throw new Error(`MODEL_ID must remain ${APPROVED_FREE_MODEL_ID}, the selected free-tier model.`);
  }
  cachedClient ??= new GoogleGenAI({ apiKey });
  return cachedClient;
}

function log(message: string, kind: AgentLogEntry["kind"] = "info"): AgentLogEntry {
  return { message, kind };
}

function toTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function safeProviderError(error: unknown): string {
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : null;
  if (status === 429) return "Gemini rejected this request with HTTP 429; the free-tier request limit may have been reached.";
  if (status === 403) return "Gemini rejected this request with HTTP 403; check free-tier access for the configured model.";
  if (status === 404) return "Gemini could not find the configured model.";
  if (status) return `Gemini request failed with HTTP ${status}. Provider details were not logged.`;
  if (error instanceof Error && error.name === "TimeoutError") return "Gemini request exceeded its server-side timeout.";
  return "Gemini request failed. Provider details were not logged.";
}

function safeRunError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (
    message.startsWith("Gemini rejected this request") ||
    message.startsWith("Gemini request failed") ||
    message.startsWith("Gemini could not find") ||
    message.startsWith("Gemini request exceeded")
  ) return message;
  return "The agent run stopped unexpectedly. Provider and database details were not logged.";
}

async function callModel(
  client: ModelClient,
  modelId: string,
  contents: Content[],
  systemInstruction: string,
  functions: FunctionDeclaration[],
  functionNames: string[],
  timeoutMs: number,
  lease: AgentRunLease,
  usageCalls: UsageCall[],
  retryTransient503 = true,
  deadlineMs: number | null = null,
): Promise<GenerateContentResponse> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const remainingMs = deadlineMs === null
      ? timeoutMs
      : Math.floor(deadlineMs - Date.now());
    if (remainingMs <= 0) {
      throw new Error("The visual route reached its 90-second limit.");
    }
    let response: GenerateContentResponse;
    try {
      response = await client.models.generateContent({
        model: modelId,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: functions }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: functionNames,
            },
          },
          temperature: 0.1,
          maxOutputTokens: 256,
          abortSignal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remainingMs))),
        },
      });
    } catch (error) {
      usageCalls.push({
        promptTokens: null,
        outputTokens: null,
        cachedTokens: null,
        providerUsageMetadata: null,
      });
      await lease.appendUsageMetadata(null);
      const status =
        error && typeof error === "object" && "status" in error && typeof error.status === "number"
          ? error.status
          : null;
      const retryDelayMs = attempt === 0 ? 1000 : 2000;
      const enoughVisualTime = deadlineMs === null || Date.now() + retryDelayMs + 1000 < deadlineMs;
      if (status === 503 && retryTransient503 && attempt < 2 && timeoutMs > 1000 && enoughVisualTime) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      throw new Error(safeProviderError(error));
    }

    const metadata = response.usageMetadata ? { ...response.usageMetadata } : null;
    usageCalls.push({
      promptTokens: toTokenCount(metadata?.promptTokenCount),
      outputTokens: toTokenCount(metadata?.candidatesTokenCount),
      cachedTokens: toTokenCount(metadata?.cachedContentTokenCount),
      providerUsageMetadata: metadata,
    });
    await lease.appendUsageMetadata(metadata);
    return response;
  }
  throw new Error("Gemini request failed. Provider details were not logged.");
}

function toolCalls(response: GenerateContentResponse) {
  const content = response.candidates?.[0]?.content;
  const calls = content?.parts?.flatMap((part) => part.functionCall ? [part.functionCall] : []) ?? [];
  return { content, calls };
}

function aggregatedTokenCount(calls: UsageCall[], key: "promptTokens" | "outputTokens" | "cachedTokens"): number | null {
  if (calls.length === 0 || calls.some((call) => call[key] === null)) return null;
  return calls.reduce((sum, call) => sum + (call[key] ?? 0), 0);
}

function makeUsage(
  routeMode: "live" | "simulated",
  modelCalls: number,
  elapsedMs: number,
  calls: UsageCall[],
): AgentRunResult["usage"] {
  return {
    simulated: routeMode === "simulated",
    promptTokens: aggregatedTokenCount(calls, "promptTokens"),
    outputTokens: aggregatedTokenCount(calls, "outputTokens"),
    cachedTokens: aggregatedTokenCount(calls, "cachedTokens"),
    modelCalls,
    elapsedMs,
    estimatedCostUsd: null,
    calls,
  };
}

function finalStatus(
  prompt: string,
  before: LibraryState,
  completed: boolean,
): PublicRunStatus {
  if (!completed) return "failed";
  const intent = recognize(prompt, before);
  if (intent.action === "unsupported") return "unsupported";
  if (intent.action === "renew" && intent.bookId) {
    const loan = before.loans.find((item) => item.bookId === intent.bookId);
    if (loan?.renewalBlockedReason || (loan && loan.renewalsUsed >= loan.renewalLimit)) return "refused";
  }
  if (intent.action === "reserve" && intent.bookId) {
    if (before.books.find((item) => item.id === intent.bookId)?.availability !== "available") return "refused";
  }
  return "completed";
}

function toResult(
  input: AgentRunInput,
  runId: string,
  modelId: string,
  mode: "live" | "simulated",
  status: PublicRunStatus,
  entries: AgentLogEntry[],
  textSteps: TextStep[],
  verification: AgentRunResult["verification"],
  usage: AgentRunResult["usage"],
  before: LibraryState,
): AgentRunResult {
  return {
    runId,
    route: input.route,
    routeMode: mode,
    modelId,
    fixtureHash: fixtureHash(before),
    status: verification.passed ? status : "failed",
    log: entries,
    textSteps,
    verification,
    usage,
  };
}

function textToolScreen(sessionMenu: string | null): string {
  return sessionMenu ?? "No session is open. Dial *123# to display the Shelf home menu.";
}

async function runTextRoute(
  prompt: string,
  before: LibraryState,
  lease: AgentRunLease,
  client: ModelClient,
  modelId: string,
  usageCalls: UsageCall[],
  onModelCall: () => void,
): Promise<{
  entries: AgentLogEntry[];
  textSteps: TextStep[];
  completed: boolean;
  modelCalls: number;
}> {
  const entries: AgentLogEntry[] = [];
  const textSteps: TextStep[] = [];
  const intent = recognize(prompt, before);
  let sessionId: string | null = null;
  let screen: string | null = null;
  let completed = false;
  let modelCalls = 0;
  const contents: Content[] = [{ role: "user", parts: [{ text: `User task: ${prompt}` }] }];

  for (let turn = 1; turn <= TEXT_TURN_LIMIT; turn += 1) {
    contents.push({
      role: "user",
      parts: [{ text: `Exact current visible menu screen:\n${textToolScreen(screen)}` }],
    });
    onModelCall();
    modelCalls += 1;
    let response: GenerateContentResponse;
    try {
      response = await callModel(
        client,
        modelId,
        contents,
        TEXT_SYSTEM_INSTRUCTION,
        TEXT_FUNCTIONS,
        TEXT_TOOL_NAMES,
        MODEL_CALL_TIMEOUT_MS,
        lease,
        usageCalls,
      );
    } catch (error) {
      entries.push(log(safeRunError(error), "error"));
      break;
    }
    const { content, calls } = toolCalls(response);
    if (!content || calls.length !== 1 || !calls[0]?.name) {
      entries.push(log(`Turn ${turn}: Gemini did not return exactly one allowed menu tool call.`, "error"));
      break;
    }
    contents.push(content);
    const functionCall = calls[0];
    const functionName = functionCall.name;
    if (!functionName) break;
    const args = functionCall.args ?? {};
    let toolResult: Record<string, unknown>;

    if (functionName === "dial") {
      const code = typeof args.code === "string" ? args.code : "";
      if (code !== "*123#") {
        toolResult = { error: "Only the displayed *123# demo code is supported.", visibleScreen: textToolScreen(screen) };
        entries.push(log("The agent supplied a code other than *123#; no session was started.", "error"));
      } else if (sessionId) {
        toolResult = { visibleScreen: textToolScreen(screen), alreadyConnected: true };
      } else {
        const started = await startTextSession(code);
        sessionId = started.sessionId;
        screen = started.menu;
        textSteps.push({ digit: code, menu: started.menu, error: null });
        toolResult = { visibleScreen: started.menu };
        entries.push(log("Dialed *123# and received the current Shelf menu.", "action"));
      }
    } else if (functionName === "reply") {
      const value = typeof args.value === "string" ? args.value.trim() : "";
      if (!value || value.length > 500) {
        toolResult = { error: "Reply must be 1–500 characters.", visibleScreen: textToolScreen(screen) };
        entries.push(log("The agent returned an empty or oversized reply.", "error"));
      } else if (/^\d$/.test(value)) {
        if (intent.action === "unsupported") {
          toolResult = { error: "This request is outside Shelf's supported actions; no menu digit was entered.", visibleScreen: textToolScreen(screen) };
          entries.push(log("Blocked a menu digit because the request is unsupported; no library records changed.", "refusal"));
        } else if (!sessionId) {
          toolResult = { error: "Dial *123# before entering a menu digit.", visibleScreen: textToolScreen(screen) };
          entries.push(log("The agent tried to enter a digit before dialing.", "error"));
        } else {
          const inputResult = await inputTextSession(sessionId, value, `agent:${lease.runId}:turn:${turn}`);
          screen = inputResult.menu;
          textSteps.push({ digit: value, menu: inputResult.menu, error: inputResult.error });
          toolResult = {
            visibleScreen: inputResult.menu,
            ...(inputResult.error ? { error: inputResult.error } : {}),
            ...(inputResult.result ? { receipt: inputResult.result.receipt.message } : {}),
          };
          entries.push(log(`Entered menu digit ${value}.`, "action"));
          if (inputResult.error) entries.push(log(inputResult.error, "refusal"));
          if (inputResult.result) entries.push(log(inputResult.result.receipt.message, "success"));
        }
      } else {
        entries.push(log(`Agent reply: ${value}`, "info"));
        toolResult = { replyDelivered: true, visibleScreen: textToolScreen(screen) };
      }
    } else if (functionName === "endSession") {
      if (sessionId && screen !== "Session ended.") {
        const ended = await inputTextSession(sessionId, "9", `agent:${lease.runId}:end`);
        screen = ended.menu;
        textSteps.push({ digit: "9", menu: ended.menu, error: null });
      }
      toolResult = { ended: true, visibleScreen: textToolScreen(screen) };
      entries.push(log("Ended the text-menu session.", "action"));
      completed = true;
    } else {
      toolResult = { error: "Unknown text-menu function.", visibleScreen: textToolScreen(screen) };
      entries.push(log("Gemini selected an unrecognized function.", "error"));
    }

    contents.push({
      role: "user",
      parts: [{ functionResponse: { name: functionName, response: toolResult } }],
    });
    if (completed) break;
  }

  if (!completed) {
    entries.push(log(`Text route stopped at its ${TEXT_TURN_LIMIT}-turn limit or after an invalid model response.`, "error"));
  }
  return { entries, textSteps, completed, modelCalls: usageCalls.length };
}

function allowedPressKey(value: string): boolean {
  return new Set([
    "Enter", "Tab", "Escape", "Backspace", "Delete",
    "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageDown", "PageUp",
  ]).has(value);
}

async function executeVisualAction(
  name: string,
  args: Record<string, unknown>,
  page: Awaited<ReturnType<typeof openShelfBrowser>>["page"],
  allowActions: boolean,
): Promise<{ result: Record<string, unknown>; entry: AgentLogEntry; finish: boolean }> {
  if (name === "finish") {
    return { result: { finished: true }, entry: log("Gemini finished the screenshot-driven route.", "success"), finish: true };
  }
  if (!allowActions) {
    return {
      result: { blocked: true, reason: "This request is outside the supported Shelf actions; page controls were not activated." },
      entry: log("Blocked a visual action because the request is unsupported; no library records changed.", "refusal"),
      finish: false,
    };
  }

  if (name === "click") {
    const x = args.x;
    const y = args.y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 1000 || y < 0 || y > 1000) {
      return { result: { error: "Click coordinates must be integers from 0 to 1000 on both axes." }, entry: log("Rejected an out-of-range normalized coordinate.", "error"), finish: false };
    }
    const pixelX = Math.min(1279, Math.round((x / 1000) * 1279));
    const pixelY = Math.min(799, Math.round((y / 1000) * 799));
    await page.mouse.click(pixelX, pixelY);
    return {
      result: { clicked: true, normalized: { x, y }, pixels: { x: pixelX, y: pixelY } },
      entry: log(`Clicked screenshot position (${x}, ${y}) normalized → (${pixelX}, ${pixelY}) px.`, "action"),
      finish: false,
    };
  }
  if (name === "type") {
    const text = args.text;
    if (typeof text !== "string" || text.length > 500) {
      return { result: { error: "Type text must be at most 500 characters." }, entry: log("Rejected empty or oversized typed text.", "error"), finish: false };
    }
    await page.keyboard.insertText(text);
    return { result: { typed: true }, entry: log("Typed text into the focused website field.", "action"), finish: false };
  }
  if (name === "scroll") {
    const deltaY = args.deltaY;
    if (typeof deltaY !== "number" || !Number.isInteger(deltaY) || Math.abs(deltaY) > 1200) {
      return { result: { error: "Scroll delta must be an integer between -1200 and 1200." }, entry: log("Rejected an out-of-range scroll.", "error"), finish: false };
    }
    await page.mouse.wheel(0, deltaY);
    return { result: { scrolled: true, deltaY }, entry: log(`Scrolled ${deltaY > 0 ? "down" : "up"} ${Math.abs(deltaY)} pixels.`, "action"), finish: false };
  }
  if (name === "press") {
    const key = args.key;
    if (typeof key !== "string" || !allowedPressKey(key)) {
      return { result: { error: "That key is not allowed in the visual demo." }, entry: log("Rejected an unsupported keyboard key.", "error"), finish: false };
    }
    await page.keyboard.press(key);
    return { result: { pressed: key }, entry: log(`Pressed ${key}.`, "action"), finish: false };
  }
  return { result: { error: "Unknown visual function." }, entry: log("Gemini selected an unrecognized visual function.", "error"), finish: false };
}

async function runVisualRoute(
  prompt: string,
  before: LibraryState,
  lease: AgentRunLease,
  client: ModelClient,
  modelId: string,
  usageCalls: UsageCall[],
  onModelCall: () => void,
  startedAt: number,
): Promise<{
  entries: AgentLogEntry[];
  textSteps: TextStep[];
  completed: boolean;
  modelCalls: number;
  routeMode: "live" | "simulated";
  status: PublicRunStatus;
}> {
  const intent = recognize(prompt, before);
  const entries: AgentLogEntry[] = [];
  let opened: Awaited<ReturnType<typeof openShelfBrowser>>;
  const deadline = Date.now() + Math.max(0, VISUAL_TIME_LIMIT_MS - (performance.now() - startedAt));
  const capability = await getBrowserCapability();

  if (!capability.available) {
    return runSimulatedFallback(prompt, before, lease, modelId, startedAt, capability.reason ?? "Playwright Chromium is unavailable.");
  }

  try {
    opened = await openShelfBrowser(deadline);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Chromium could not open /library.";
    markBrowserUnavailable(reason);
    return runSimulatedFallback(prompt, before, lease, modelId, startedAt, reason);
  }

  const { browser, page } = opened;
  const contents: Content[] = [];
  let completed = false;
  let modelCalls = 0;
  let interactions = 0;
  const rejectedClickCoordinates = new Set<string>();
  try {
    for (let turn = 1; turn <= VISUAL_TURN_LIMIT; turn += 1) {
      const remainingMs = Math.floor(deadline - Date.now());
      if (remainingMs <= 0) {
        entries.push(log("Visual route reached the 90-second limit.", "error"));
        break;
      }
      const screenshot = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      const imagePart = {
        inlineData: {
          mimeType: "image/png",
          data: screenshot.toString("base64"),
        },
      };
      if (turn === 1) {
        contents.push({
          role: "user",
          parts: [{ text: `User task: ${prompt}. Use the screenshot as your only view of the Shelf /library page.` }, imagePart],
        });
      } else {
        contents.push({
          role: "user",
          parts: [{ text: "Fresh screenshot of the current Shelf /library page:" }, imagePart],
        });
      }
      onModelCall();
      modelCalls += 1;
      let response: GenerateContentResponse;
      try {
        response = await callModel(
          client,
          modelId,
          contents,
          VISUAL_SYSTEM_INSTRUCTION,
          VISUAL_FUNCTIONS,
          VISUAL_TOOL_NAMES,
          Math.min(remainingMs, MODEL_CALL_TIMEOUT_MS),
          lease,
          usageCalls,
          true,
          deadline,
        );
      } catch (error) {
        entries.push(log(safeRunError(error), "error"));
        break;
      }
      const { content, calls } = toolCalls(response);
      if (!content || calls.length !== 1 || !calls[0]?.name) {
        entries.push(log(`Visual turn ${turn}: Gemini did not return exactly one allowed screen action.`, "error"));
        break;
      }
      contents.push(content);
      const functionCall = calls[0];
      const functionName = functionCall.name ?? "";
      const functionArgs = functionCall.args ?? {};
      let action: Awaited<ReturnType<typeof executeVisualAction>>;
      let clickedCoordinate: string | null = null;
      if (functionName === "finish") {
        const currentState = await readLibraryState();
        const expectedStatus = finalStatus(prompt, before, true);
        const verified = verifyCommittedState(prompt, before, currentState, expectedStatus).passed;
        if (verified && (expectedStatus !== "completed" || interactions > 0 || intent.action === "due")) {
          action = await executeVisualAction(functionName, functionArgs, page, false);
        } else {
          action = {
            result: { finished: false, verificationPending: true },
            entry: log("Finish was declined because the requested result has not been verified. Inspect the screenshot and continue.", "info"),
            finish: false,
          };
        }
      } else if (functionName === "click") {
        const coordinate =
          typeof functionArgs.x === "number" && typeof functionArgs.y === "number"
            ? `${functionArgs.x},${functionArgs.y}`
            : "";
        if (coordinate && rejectedClickCoordinates.has(coordinate)) {
          action = {
            result: { blocked: true, reason: "That screen point was already tried without a verified outcome. Choose a different visible control." },
            entry: log("Ignored a repeated click point that did not produce a verified outcome.", "info"),
            finish: false,
          };
        } else {
          action = await executeVisualAction(functionName, functionArgs, page, intent.action !== "unsupported");
          if (action.entry.kind === "action") {
            interactions += 1;
            if (intent.action !== "unsupported") clickedCoordinate = coordinate || null;
          }
        }
      } else {
        action = await executeVisualAction(functionName, functionArgs, page, intent.action !== "unsupported");
        if (action.entry.kind === "action") interactions += 1;
      }
      entries.push(action.entry);
      contents.push({
        role: "user",
        parts: [
          { functionResponse: { name: functionName, response: action.result } },
        ],
      });
      if (action.finish) {
        completed = true;
        break;
      }
      await page.waitForTimeout(350);
      if (clickedCoordinate) {
        const currentState = await readLibraryState();
        const expectedStatus = finalStatus(prompt, before, true);
        if (!verifyCommittedState(prompt, before, currentState, expectedStatus).passed) {
          rejectedClickCoordinates.add(clickedCoordinate);
        }
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  if (!completed) {
    entries.push(log(`Visual route stopped before finish (maximum ${VISUAL_TURN_LIMIT} turns or ${VISUAL_TIME_LIMIT_MS / 1000} seconds).`, "error"));
  }
  return {
    entries,
    textSteps: [],
    completed,
    modelCalls,
    routeMode: "live",
    status: finalStatus(prompt, before, completed),
  };
}

async function runSimulatedFallback(
  prompt: string,
  before: LibraryState,
  lease: AgentRunLease,
  modelId: string,
  startedAt: number,
  reason: string,
) {
  await lease.setRouteMode("simulated");
  const entries = [
    log(`Chromium screenshot route unavailable: ${reason}`, "error"),
    log("Visual route was not executed; no screenshot was sent to Gemini and no website controls were used.", "refusal"),
  ];
  const intent = recognize(prompt, before);
  const status: PublicRunStatus = intent.action === "unsupported" ? "unsupported" : "failed";
  return {
    entries,
    textSteps: [] as TextStep[],
    completed: false,
    modelCalls: 0,
    routeMode: "simulated" as const,
    status,
    modelId,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const [browser, runStatus] = await Promise.all([getBrowserCapability(), getAgentRunStatus()]);
  return {
    modelId: currentModelId(),
    modelConfigured: isGeminiConfigured(),
    visualRouteMode: browser.available ? "live" : "simulated",
    visualUnavailableReason: browser.reason,
    runsInLastHour: runStatus.runsInLastHour,
    maximumRunsPerHour: runStatus.maximumRunsPerHour,
    runInProgress: runStatus.runInProgress,
  };
}

export async function runGeminiAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const modelId = currentModelId();
  if (!isGeminiConfigured()) {
    throw Object.assign(
      new Error(process.env.GEMINI_API_KEY ? `Only ${APPROVED_FREE_MODEL_ID} is enabled for this demo.` : "Gemini is not configured. Add GEMINI_API_KEY through Replit Secrets."),
      { status: 503 },
    );
  }
  const client = getGeminiClient();
  const lease = await acquireAgentRunLease(input.route, modelId);
  const startedAt = performance.now();
  const usageCalls: UsageCall[] = [];
  let modelCalls = 0;
  let routeMode: "live" | "simulated" = "live";
  let status: PublicRunStatus = "failed";
  let entries: AgentLogEntry[] = [log(`Request received: “${input.prompt}”`)];
  let textSteps: TextStep[] = [];
  let before: LibraryState | null = null;
  let verification: AgentRunResult["verification"] = {
    passed: false,
    message: "Verification did not complete.",
  };
  let fallbackStatus: PublicRunStatus | null = null;

  const countModelCall = () => { modelCalls += 1; };
  try {
    before = await readLibraryState();
    entries.push(log(`Using ${modelId} via the ${input.route === "text" ? "text-menu" : "screenshot-driven visual"} route.`));
    if (input.route === "text") {
      const result = await runTextRoute(
        input.prompt,
        before,
        lease,
        client,
        modelId,
        usageCalls,
        countModelCall,
      );
      entries.push(...result.entries);
      textSteps = result.textSteps;
      status = finalStatus(input.prompt, before, result.completed);
    } else {
      const result = await runVisualRoute(
        input.prompt,
        before,
        lease,
        client,
        modelId,
        usageCalls,
        countModelCall,
        startedAt,
      );
      routeMode = result.routeMode;
      entries.push(...result.entries);
      textSteps = result.textSteps;
      modelCalls = result.modelCalls;
      if (result.routeMode === "simulated") fallbackStatus = result.status;
      status = result.status;
    }
  } catch (error) {
    entries.push(log(safeRunError(error), "error"));
    status = "failed";
  }

  try {
    if (!before) before = await readLibraryState();
    const after = await readLibraryState();
    verification = verifyCommittedState(input.prompt, before, after, status);
    if (!verification.passed && routeMode === "live" && status === "failed") {
      const intent = recognize(input.prompt, before);
      const committedAction = ["renew", "reserve", "cancel"].includes(intent.action);
      if (committedAction) {
        const committedVerification = verifyCommittedState(input.prompt, before, after, "completed");
        if (committedVerification.passed) {
          status = "completed";
          verification = committedVerification;
          entries.push(log("The requested library change was committed and verified before the model session stopped.", "success"));
        }
      }
    }
    if (!verification.passed && fallbackStatus) {
      status = "failed";
    } else if (!verification.passed && status !== "failed") {
      status = "failed";
      verification = verifyCommittedState(input.prompt, before, after, status);
    }
    entries.push(log(verification.message, verification.passed ? "success" : "error"));
  } catch {
    status = "failed";
    verification = { passed: false, message: "Verification failed because committed library records could not be read." };
    entries.push(log(verification.message, "error"));
  }

  const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
  const actualModelCalls = routeMode === "live" ? usageCalls.length : 0;
  const usage = makeUsage(routeMode, actualModelCalls, elapsedMs, usageCalls);
  const result = toResult(
    input,
    lease.runId,
    modelId,
    routeMode,
    status,
    entries,
    textSteps,
    verification,
    usage,
    before ?? await readLibraryState(),
  );
  try {
    await lease.complete(result.status, elapsedMs, verification.passed);
  } finally {
    await lease.release();
  }
  return result;
}
