"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Square, ChevronLeft, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle, ChevronDown, Gavel, Trophy, Maximize2,
} from "lucide-react";
import Link from "next/link";
import { useModelsStore } from "@/store/models-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { useCloudProvidersStore } from "@/store/cloud-providers-store";
import { GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { ModelColorDot } from "@/components/ui/model-badge";
import { getModelColor } from "@/lib/model-colors";
import { formatDuration, formatBytes, cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/ui/markdown-content";
import dynamic from "next/dynamic";

const ConversationFlow = dynamic(
  () => import("@/components/run/conversation-flow"),
  { ssr: false, loading: () => <div className="h-[400px] bg-white/5 rounded-2xl animate-pulse" /> }
);
const AdversarialFlow = dynamic(
  () => import("@/components/run/adversarial-flow"),
  { ssr: false, loading: () => <div className="h-[400px] bg-white/5 rounded-2xl animate-pulse" /> }
);
const ToolFlow = dynamic(
  () => import("@/components/run/tool-flow"),
  { ssr: false, loading: () => <div className="h-[400px] bg-white/5 rounded-2xl animate-pulse" /> }
);

interface Suite {
  id: string;
  name: string;
  suite_type?: string;
  prompts: Array<{ id: string; text: string; category: string }>;
  toolScenarios?: Array<{ id: string; name: string; userMessage: string; category: string }>;
  toolDefinitions?: Array<{ id: string; name: string }>;
  conversationScenarios?: Array<{ id: string; name: string; turnCount: number }>;
  adversarialScenarios?: Array<{ id: string; name: string; attackStrategy: string; maxTurns: number }>;
}

interface ConvoTurnState {
  role: "user" | "assistant";
  content: string;
  turnNumber: number;
}

interface ConvoScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: "pending" | "running" | "done" | "error";
  turns: ConvoTurnState[];
  overallScore: number;
  contextExhausted: boolean;
  contextTokensUsed?: number;
  contextLimit?: number;
  contextUtilization?: number;
}

interface ConvoModelState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: ConvoScenarioState[];
  overallScore: number;
}

interface AdvTurnState {
  role: "attacker" | "defender";
  content: string;
  turnNumber: number;
  breachDetected: boolean;
}

interface AdvScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: "pending" | "running" | "done" | "error";
  turns: AdvTurnState[];
  robustnessScore: number;
  survived: boolean;
  breachCount: number;
}

interface AdvModelState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: AdvScenarioState[];
  overallScore: number;
}

interface ScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: "pending" | "running" | "done" | "error";
  overallScore: number;
  textResponse: string;
  actualToolCalls: Array<{ functionName: string; arguments: Record<string, unknown> }>;
}

interface ToolModelState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: ScenarioState[];
  overallScore: number;
}

interface PromptState {
  promptId: string;
  status: "pending" | "loading" | "running" | "done" | "error" | "timeout";
  response: string;
  tokensPerSec: number;
  score: number;
  judgeScore?: number;
  judgeWon?: boolean;
}

interface ModelRunState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  prompts: PromptState[];
  overallScore: number;
  avgTokensPerSec: number;
  judgeOverallScore?: number;
  judgeWins?: number;
  judgeStatus?: "pending" | "scoring" | "done";
}

interface JudgeWinner {
  modelName: string;
  wins: number;
}

export default function LiveRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { models } = useModelsStore();
  usePreferencesStore();
  const { providers, fetchProviders, loaded: cloudLoaded } = useCloudProvidersStore();

  const [suite, setSuite] = useState<Suite | null>(null);
  const [suiteLoading, setSuiteLoading] = useState(true);

  useEffect(() => {
    if (!cloudLoaded) fetchProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const judgeProviders = providers.filter((p) => p.useForJudging && p.selectedModel);

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [judgeEnabled, setJudgeEnabled] = useState(false);
  const [judgeModel, setJudgeModel] = useState("");

  // Resolve cloud:id to display name
  const judgeModelDisplay = (() => {
    if (!judgeModel.startsWith('cloud:')) return judgeModel;
    const pid = judgeModel.replace('cloud:', '');
    const provider = judgeProviders.find((p) => p.id === pid);
    return provider ? `${provider.selectedModel} (${provider.label})` : judgeModel;
  })();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [modelStates, setModelStates] = useState<ModelRunState[]>([]);
  const [currentModelIdx, setCurrentModelIdx] = useState(0);
  const [toolModelStates, setToolModelStates] = useState<ToolModelState[]>([]);
  const [convoModelStates, setConvoModelStates] = useState<ConvoModelState[]>([]);
  const [advModelStates, setAdvModelStates] = useState<AdvModelState[]>([]);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [judgePhase, setJudgePhase] = useState<"idle" | "loading" | "scoring" | "done" | "error">("idle");
  const [judgeWinner, setJudgeWinner] = useState<JudgeWinner | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [enlargedStandardModel, setEnlargedStandardModel] = useState<string | null>(null);
  const [enlargedToolModel, setEnlargedToolModel] = useState<string | null>(null);
  const [enlargedConversationModel, setEnlargedConversationModel] = useState<string | null>(null);
  const [enlargedAdversarialModel, setEnlargedAdversarialModel] = useState<string | null>(null);
  const [enlargedSidebarWidth, setEnlargedSidebarWidth] = useState(320);
  const [enlargedGraphHeight, setEnlargedGraphHeight] = useState(640);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isResizingSidebarRef = useRef(false);
  const isResizingGraphRef = useRef(false);

  useEffect(() => {
    fetch(`/api/suites/${id}`)
      .then((r) => r.json())
      .then((d) => setSuite(d.suite || null))
      .finally(() => setSuiteLoading(false));
  }, [id]);

  const toggleModel = (name: string) => {
    setSelectedModels((s) =>
      s.includes(name) ? s.filter((m) => m !== name) : [...s, name]
    );
  };

  useEffect(() => {
    if (!enlargedAdversarialModel && !enlargedToolModel && !enlargedStandardModel && !enlargedConversationModel) return;

    setEnlargedSidebarWidth(360);
    setEnlargedGraphHeight(Math.max(620, window.innerHeight - 210));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEnlargedAdversarialModel(null);
        setEnlargedToolModel(null);
        setEnlargedStandardModel(null);
        setEnlargedConversationModel(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enlargedAdversarialModel, enlargedConversationModel, enlargedStandardModel, enlargedToolModel]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (isResizingSidebarRef.current) {
        const nextWidth = window.innerWidth - event.clientX;
        setEnlargedSidebarWidth(Math.max(320, Math.min(720, nextWidth)));
      }

      if (isResizingGraphRef.current) {
        const maxHeight = Math.max(420, window.innerHeight - 240);
        setEnlargedGraphHeight(Math.max(360, Math.min(maxHeight, event.clientY - 140)));
      }
    };

    const onMouseUp = () => {
      isResizingSidebarRef.current = false;
      isResizingGraphRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const isToolCalling = suite?.suite_type === "tool_calling";
  const isConversation = suite?.suite_type === "conversation";
  const isAdversarial = suite?.suite_type === "adversarial";

  const mapAdversarialScenariosForFlow = (model: AdvModelState) =>
    model.scenarios.map((sc) => ({
      scenarioId: sc.scenarioId,
      scenarioName: sc.scenarioName,
      status: sc.status,
      robustnessScore: sc.robustnessScore,
      turns: (() => {
        const turns: {
          attackMessage: string;
          modelResponse: string;
          breach?: { type: string; severity: "low" | "medium" | "high" | "critical"; evidence: string };
          status: "pending" | "running" | "done" | "error";
        }[] = [];

        for (let i = 0; i < sc.turns.length; i += 2) {
          const attacker = sc.turns[i];
          const defender = sc.turns[i + 1];
          if (attacker) {
            turns.push({
              attackMessage: attacker.content,
              modelResponse: defender?.content ?? "",
              breach: (attacker.breachDetected || defender?.breachDetected)
                ? { type: "breach", severity: "critical", evidence: "" }
                : undefined,
              status: defender ? "done" : sc.status === "running" ? "running" : "pending",
            });
          }
        }

        return turns;
      })(),
    }));

  const mapToolScenariosForFlow = (model: ToolModelState) =>
    model.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      scenarioName: scenario.scenarioName,
      userMessage:
        suite?.toolScenarios?.find((item) => item.id === scenario.scenarioId)?.userMessage ??
        scenario.scenarioName,
      status: scenario.status,
      overallScore: scenario.overallScore,
      textResponse: scenario.textResponse,
      actualToolCalls: scenario.actualToolCalls,
    }));

  const startSidebarResize = () => {
    isResizingSidebarRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const startGraphResize = () => {
    isResizingGraphRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const startRun = async () => {
    if (!suite || selectedModels.length === 0) return;

    if (isToolCalling) {
      // Initialize tool calling model states
      const scenarios = suite.toolScenarios ?? [];
      const toolStates: ToolModelState[] = selectedModels.map((name) => ({
        name,
        status: "pending",
        scenarios: scenarios.map((s) => ({
          scenarioId: s.id,
          scenarioName: s.name,
          status: "pending",
          overallScore: 0,
          textResponse: "",
          actualToolCalls: [],
        })),
        overallScore: 0,
      }));
      setToolModelStates(toolStates);
    }

    if (isConversation) {
      const scenarios = suite.conversationScenarios ?? [];
      setConvoModelStates(selectedModels.map((name) => ({
        name,
        status: "pending",
        scenarios: scenarios.map((s) => ({
          scenarioId: s.id,
          scenarioName: s.name,
          status: "pending",
          turns: [],
          overallScore: 0,
          contextExhausted: false,
        })),
        overallScore: 0,
      })));
    }

    if (isAdversarial) {
      const scenarios = suite.adversarialScenarios ?? [];
      setAdvModelStates(selectedModels.map((name) => ({
        name,
        status: "pending",
        scenarios: scenarios.map((s) => ({
          scenarioId: s.id,
          scenarioName: s.name,
          status: "pending",
          turns: [],
          robustnessScore: 0,
          survived: true,
          breachCount: 0,
        })),
        overallScore: 0,
      })));
    }

    const initialStates: ModelRunState[] = selectedModels.map((name) => ({
      name,
      status: "pending",
      prompts: (suite.prompts ?? []).map((p) => ({
        promptId: p.id,
        status: "pending",
        response: "",
        tokensPerSec: 0,
        score: 0,
      })),
      overallScore: 0,
      avgTokensPerSec: 0,
    }));
    setModelStates(initialStates);
    setRunning(true);
    setDone(false);
    setJudgePhase("idle");
    setJudgeWinner(null);
    setJudgeError(null);
    setRunError(null);
    setCurrentModelIdx(0);
    setElapsedSec(0);

    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suiteId: id,
          models: selectedModels,
          temperature,
          maxTokens,
          judgeEnabled,
          judgeModel: judgeEnabled ? judgeModel : undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Run failed" }));
        const errMsg = errData.error || `Run failed (${res.status})`;
        setRunError(errMsg);
        console.error("Run API error:", errMsg);
        return;
      }

      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            wrappedHandleEvent(event);
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Run failed:", err);
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRunning(false);
    }
  };

  const handleEvent = (event: Record<string, unknown>) => {
    switch (event.type) {
      case "run_started":
        setRunId(event.runId as string);
        break;

      case "model_loading":
      case "model_start":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = { ...next[idx], status: "loading" };
          setCurrentModelIdx(idx);
          return next;
        });
        break;

      case "model_loaded":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = { ...next[idx], status: "running" };
          return next;
        });
        break;

      case "model_skipped":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = { ...next[idx], status: "skipped" };
          return next;
        });
        break;

      case "prompt_start":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const prompts = [...next[idx].prompts];
          prompts[event.promptIndex as number] = {
            ...prompts[event.promptIndex as number],
            status: "running",
          };
          next[idx] = { ...next[idx], prompts };
          return next;
        });
        break;

      case "token":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const prompts = [...next[idx].prompts];
          prompts[event.promptIndex as number] = {
            ...prompts[event.promptIndex as number],
            response: (prompts[event.promptIndex as number].response || "") + (event.token as string),
          };
          next[idx] = { ...next[idx], prompts };
          return next;
        });
        break;

      case "prompt_done":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const prompts = [...next[idx].prompts];
          prompts[event.promptIndex as number] = {
            ...prompts[event.promptIndex as number],
            status: (event.timedOut ? "timeout" : "done") as PromptState["status"],
            tokensPerSec: event.tokensPerSec as number,
            score: event.score as number,
          };
          next[idx] = { ...next[idx], prompts };
          return next;
        });
        break;

      case "model_done":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = {
            ...next[idx],
            status: "done",
            overallScore: event.overallScore as number,
            avgTokensPerSec: event.avgTokensPerSec as number,
          };
          return next;
        });
        break;

      // ── Judge events ────────────────────────────────────────────
      case "judge_start":
        setJudgePhase("loading");
        setModelStates((s) => s.map((m) =>
          m.status === "done" ? { ...m, judgeStatus: "pending", judgeWins: 0 } : m
        ));
        break;

      case "judge_prompt_comparing":
        setJudgePhase("scoring");
        break;

      case "judge_prompt_compared": {
        const scores = event.scores as Record<string, number>;
        const winner = event.winner as string;
        const pi = event.promptIndex as number;
        setModelStates((s) => s.map((m) => {
          const score = scores[m.name];
          if (score === undefined) return m;
          const prompts = [...m.prompts];
          prompts[pi] = {
            ...prompts[pi],
            judgeScore: score,
            judgeWon: m.name === winner,
          };
          return {
            ...m,
            judgeStatus: "scoring",
            judgeWins: (m.judgeWins ?? 0) + (m.name === winner ? 1 : 0),
          };
        }));
        break;
      }

      case "judge_error":
        setJudgePhase("error");
        setJudgeError(event.error as string);
        break;

      case "judge_done":
        setJudgePhase("done");
        if (event.winner) setJudgeWinner(event.winner as JudgeWinner);
        // Mark all judged models as done
        setModelStates((s) => s.map((m) =>
          m.judgeStatus ? { ...m, judgeStatus: "done" } : m
        ));
        break;

      // ── Tool calling events ───────────────────────────────────
      case "scenario_start":
        setToolModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const scenarios = [...next[idx].scenarios];
          const si = event.scenarioIndex as number;
          if (scenarios[si]) {
            scenarios[si] = { ...scenarios[si], status: "running" };
          }
          next[idx] = { ...next[idx], status: "running", scenarios };
          return next;
        });
        break;

      case "scenario_done":
        setToolModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const scenarios = [...next[idx].scenarios];
          const si = event.scenarioIndex as number;
          if (scenarios[si]) {
            scenarios[si] = {
              ...scenarios[si],
              status: "done",
              overallScore: event.overallScore as number,
              textResponse: (event.textResponse as string) ?? "",
              actualToolCalls: (event.actualToolCalls as ScenarioState["actualToolCalls"]) ?? [],
            };
          }
          next[idx] = { ...next[idx], scenarios };
          return next;
        });
        break;

      case "scenario_error":
        setToolModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const scenarios = [...next[idx].scenarios];
          const si = event.scenarioIndex as number;
          if (scenarios[si]) {
            scenarios[si] = { ...scenarios[si], status: "error" };
          }
          next[idx] = { ...next[idx], scenarios };
          return next;
        });
        break;

      case "run_complete":
        setDone(true);
        if (timerRef.current) clearInterval(timerRef.current);
        // Update tool model overall scores from model_done events
        setToolModelStates((s) =>
          s.map((m) => ({
            ...m,
            status: m.status === "pending" ? m.status : "done",
          }))
        );
        break;
    }
  };

  // Also handle model_done for tool calling to update scores
  const origHandleEvent = handleEvent;
  // Merge into handleEvent by adding model_done handling for tool states
  const wrappedHandleEvent = (event: Record<string, unknown>) => {
    origHandleEvent(event);
    if (event.type === "model_done" && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = {
          ...next[idx],
          status: "done",
          overallScore: event.overallScore as number,
        };
        return next;
      });
    }
    if ((event.type === "model_loading" || event.type === "model_start") && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = { ...next[idx], status: "loading" };
        return next;
      });
    }
    if (event.type === "model_loaded" && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = { ...next[idx], status: "running" };
        return next;
      });
    }
    if (event.type === "model_skipped" && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = { ...next[idx], status: "skipped" };
        return next;
      });
    }

    // ── Conversation events ──────────────────────────────────────
    const convoModelUpdate = (fn: (states: ConvoModelState[]) => ConvoModelState[]) => setConvoModelStates(fn);
    if (isConversation) {
      if (event.type === "model_loading" || event.type === "model_start") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "loading" } : m));
      }
      if (event.type === "model_loaded") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "running" } : m));
      }
      if (event.type === "model_skipped") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "skipped" } : m));
      }
      if (event.type === "model_done") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "done", overallScore: event.overallScore as number } : m));
      }
      if (event.type === "convo_scenario_start") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "running" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_turn") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) => {
            if (sc.scenarioId !== event.scenarioId) return sc;
            const turns = [...sc.turns, {
              role: event.role as "user" | "assistant",
              content: event.content as string,
              turnNumber: event.turnNumber as number,
            }];
            return { ...sc, turns };
          });
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_context_update") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId
              ? {
                ...sc,
                contextTokensUsed: event.contextTokensUsed as number,
                contextLimit: event.contextLimit as number,
                contextUtilization: event.contextUtilization as number,
              }
              : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_scenario_done") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId
              ? {
                ...sc,
                status: "done" as const,
                overallScore: event.overallScore as number,
                contextExhausted: event.contextExhausted as boolean,
                contextTokensUsed: event.contextTokensUsed as number | undefined,
                contextLimit: event.contextLimit as number | undefined,
                contextUtilization: event.contextUtilization as number | undefined,
              }
              : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_scenario_error") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "error" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
    }

    // ── Adversarial events ───────────────────────────────────────
    const advModelUpdate = (fn: (states: AdvModelState[]) => AdvModelState[]) => setAdvModelStates(fn);
    if (isAdversarial) {
      if (event.type === "model_loading" || event.type === "model_start") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "loading" } : m));
      }
      if (event.type === "model_loaded") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "running" } : m));
      }
      if (event.type === "model_skipped") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "skipped" } : m));
      }
      if (event.type === "model_done") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "done", overallScore: event.overallScore as number } : m));
      }
      if (event.type === "adv_scenario_start") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "running" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "adv_turn") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) => {
            if (sc.scenarioId !== event.scenarioId) return sc;
            const turns = [...sc.turns, {
              role: event.role as "attacker" | "defender",
              content: event.content as string,
              turnNumber: event.turnNumber as number,
              breachDetected: event.breachDetected as boolean,
            }];
            return { ...sc, turns };
          });
          return { ...m, scenarios };
        }));
      }
      if (event.type === "adv_scenario_done") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId
              ? {
                ...sc,
                status: "done" as const,
                robustnessScore: event.robustnessScore as number,
                survived: event.survived as boolean,
                breachCount: event.breachCount as number,
              }
              : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "adv_scenario_error") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "error" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
    }
  };

  const stopRun = () => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
  };

  const togglePromptExpand = (key: string) => {
    setExpandedPrompts((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (suiteLoading) return <div className="p-8"><SkeletonList count={3} /></div>;
  if (!suite) return <div className="p-8 text-zinc-500">Suite not found.</div>;

  // ── Pre-run config ────────────────────────────────────────────────────────
  if (!running && !done) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Link href={`/suite/${id}`} className="flex items-center gap-1.5 text-zinc-500 text-xs hover:text-zinc-300 mb-6 transition-colors">
          <ChevronLeft size={13} />
          Back to suite
        </Link>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Run: {suite.name}</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {isToolCalling
                ? `${suite.toolScenarios?.length ?? 0} scenarios · ${suite.toolDefinitions?.length ?? 0} tools`
                : isConversation
                  ? `${suite.conversationScenarios?.length ?? 0} conversation scenarios`
                  : isAdversarial
                    ? `${suite.adversarialScenarios?.length ?? 0} adversarial scenarios`
                    : `${suite.prompts.length} prompts`
              }
            </p>
          </div>

          {/* Model selection */}
          <GlowCard className="p-5" animate={false}>
            <h2 className="text-zinc-400 text-sm font-medium mb-3">Select Models</h2>
            {models.length === 0 ? (
              <p className="text-zinc-600 text-sm">No models installed. Install models via Ollama first.</p>
            ) : (
              <div className="space-y-2">
                {models.map((model) => (
                  <label key={model.name} className="flex items-center gap-3 cursor-pointer group">
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                        selectedModels.includes(model.name)
                          ? "bg-blue-500 border-blue-500"
                          : "border-white/20 group-hover:border-white/40"
                      )}
                      onClick={() => toggleModel(model.name)}
                    >
                      {selectedModels.includes(model.name) && (
                        <CheckCircle2 size={10} className="text-white" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <ModelColorDot name={model.name} />
                      <span className="text-zinc-300 text-sm">{model.name}</span>
                    </div>
                    <span className="text-zinc-600 text-xs">{formatBytes(model.size)}</span>
                    <span className="text-zinc-700 text-xs">{model.details?.parameter_size}</span>
                  </label>
                ))}
              </div>
            )}
          </GlowCard>

          {/* Parameters */}
          <GlowCard className="p-5" animate={false}>
            <h2 className="text-zinc-400 text-sm font-medium mb-4">Parameters</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-zinc-500">Temperature</span>
                  <span className="text-zinc-300 font-mono">{temperature}</span>
                </div>
                <input
                  type="range" min={0} max={2} step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  aria-label="Temperature"
                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-zinc-500">Max Tokens</span>
                  <span className="text-zinc-300 font-mono">{maxTokens}</span>
                </div>
                <input
                  type="range" min={128} max={4096} step={128}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  aria-label="Max Tokens"
                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Judge toggle */}
              <div className="space-y-3 pt-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      judgeEnabled ? "bg-violet-500 border-violet-500" : "border-white/20"
                    )}
                    onClick={() => setJudgeEnabled((j) => !j)}
                  >
                    {judgeEnabled && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <Gavel size={14} className={judgeEnabled ? "text-violet-400" : "text-zinc-600"} />
                  <span className="text-zinc-400 text-sm">LLM-as-Judge scoring</span>
                  <span className="text-zinc-600 text-xs">(slower, higher quality)</span>
                </label>

                <AnimatePresence>
                  {judgeEnabled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-7 space-y-2 pt-1">
                        <label className="text-zinc-500 text-xs block">Judge Model</label>
                        {models.length > 0 || judgeProviders.length > 0 ? (
                          <select
                            value={judgeModel}
                            onChange={(e) => setJudgeModel(e.target.value)}
                            title="Select a judge model"
                            className="w-full bg-white/5 border border-violet-500/30 rounded-xl px-3 py-2 text-zinc-300 text-sm appearance-none outline-none focus:border-violet-500/60"
                          >
                            <option value="">Select a judge model...</option>
                            {models.length > 0 && (
                              <optgroup label="LOCAL MODELS">
                                {models.map((m) => (
                                  <option key={m.name} value={m.name}>{m.name}</option>
                                ))}
                              </optgroup>
                            )}
                            {judgeProviders.length > 0 && (
                              <optgroup label="CLOUD MODELS">
                                {judgeProviders.map((p) => (
                                  <option key={`cloud:${p.id}`} value={`cloud:${p.id}`}>
                                    {p.selectedModel} ({p.label})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        ) : (
                          <input
                            value={judgeModel}
                            onChange={(e) => setJudgeModel(e.target.value)}
                            placeholder="e.g. llama3:8b"
                            className="w-full bg-white/5 border border-violet-500/30 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-violet-500/60 placeholder:text-zinc-600"
                          />
                        )}
                        <p className="text-zinc-600 text-xs">
                          This model scores each response after all tests complete. Larger models give better judgements.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </GlowCard>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={
              selectedModels.length === 0 ||
              (isToolCalling && !(suite.toolScenarios?.length)) ||
              (isConversation && !(suite.conversationScenarios?.length)) ||
              (isAdversarial && !(suite.adversarialScenarios?.length)) ||
              (!isToolCalling && !isConversation && !isAdversarial && !(suite.prompts?.length))
            }
            onClick={startRun}
          >
            <Play size={15} />
            Start Run — {selectedModels.length} model{selectedModels.length !== 1 ? "s" : ""},{" "}
            {isToolCalling ? `${suite.toolScenarios?.length ?? 0} scenarios`
              : isConversation ? `${suite.conversationScenarios?.length ?? 0} scenarios`
                : isAdversarial ? `${suite.adversarialScenarios?.length ?? 0} scenarios`
                  : `${suite.prompts.length} prompts`}
          </Button>
        </motion.div>

        {runError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm"
          >
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <span className="text-red-300">{runError}</span>
          </motion.div>
        )}
      </div>
    );
  }

  // ── Tool Calling Running / done view ──────────────────────────────────────
  if (isToolCalling) {
    const enlargedModel = enlargedToolModel
      ? toolModelStates.find((model) => model.name === enlargedToolModel) ?? null
      : null;

    return (
      <>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-zinc-100">{suite.name}</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded text-blue-300 bg-blue-500/10 border border-blue-500/20">
                Tools
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Clock size={11} />
                {formatDuration(elapsedSec)}
              </span>
              <span>{selectedModels.length} models · {suite.toolScenarios?.length ?? 0} scenarios</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {running && (
              <Button variant="danger" size="sm" onClick={stopRun}>
                <Square size={13} />
                Stop
              </Button>
            )}
            {done && runId && (
              <Button variant="primary" size="sm" onClick={() => router.push(`/results/${runId}`)}>
                View Results
              </Button>
            )}
          </div>
        </div>

        {/* Tool calling model cards */}
        <div className="space-y-4">
          {toolModelStates.map((model, mi) => (
            <motion.div
              key={model.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * mi }}
            >
              <GlowCard className="p-5" animate={false}>
                <div className="flex items-center gap-3 mb-4">
                  <ModelColorDot name={model.name} />
                  <span className="text-zinc-200 text-sm font-medium flex-1">{model.name}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border",
                    model.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" :
                      model.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10" :
                        model.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10" :
                          model.status === "skipped" ? "text-red-400 border-red-500/20 bg-red-500/10" :
                            "text-zinc-600 border-white/10"
                  )}>
                    {model.status}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEnlargedToolModel(model.name)}
                    className="ml-auto text-zinc-400 hover:text-zinc-100"
                  >
                    <Maximize2 size={13} />
                    Enlarge View
                  </Button>
                  {model.status === "done" && (
                    <span className="text-zinc-300 font-mono text-sm">{model.overallScore}%</span>
                  )}
                </div>

                <div className="mb-4 h-[350px] rounded-xl overflow-hidden border border-white/[0.06]">
                  <ToolFlow
                    modelName={model.name}
                    currentScenarioIndex={model.scenarios.findIndex((sc) => sc.status === "running")}
                    scenarios={mapToolScenariosForFlow(model)}
                    onEnlarge={() => setEnlargedToolModel(model.name)}
                  />
                </div>

                <div className="space-y-3">
                  {model.scenarios.map((scenario, si) => (
                    <div key={scenario.scenarioId} className="bg-white/[0.03] rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-700 text-xs font-mono w-4">{si + 1}</span>
                      {scenario.status === "pending" && <Clock size={12} className="text-zinc-700" />}
                      {scenario.status === "running" && <Loader2 size={12} className="text-blue-400 animate-spin" />}
                      {scenario.status === "done" && <CheckCircle2 size={12} className="text-emerald-400" />}
                      {scenario.status === "error" && <XCircle size={12} className="text-red-400" />}

                      <span className="text-zinc-400 text-sm flex-1 truncate">{scenario.scenarioName}</span>

                      {scenario.status === "done" && (
                        <>
                          <span className={cn(
                            "font-mono text-xs",
                            scenario.overallScore >= 80 ? "text-emerald-400" :
                              scenario.overallScore >= 50 ? "text-yellow-400" :
                                "text-red-400"
                          )}>
                            {scenario.overallScore}%
                          </span>
                          {scenario.actualToolCalls.length > 0 && (
                            <span className="text-blue-400/60 text-[10px]">
                              {scenario.actualToolCalls.map(c => c.functionName).join(" → ")}
                            </span>
                          )}
                        </>
                      )}
                      </div>
                      <p className="mt-3 text-sm text-zinc-500 leading-6">
                        {suite.toolScenarios?.find((item) => item.id === scenario.scenarioId)?.userMessage ?? scenario.scenarioName}
                      </p>
                    </div>
                  ))}
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {enlargedModel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-lg"
          >
            <div className="h-full w-full min-w-0 overflow-hidden flex flex-col" style={{ backgroundColor: "rgba(0, 0, 0, 0.05)" }}>
              <div className="px-8 py-5 border-b border-white/[0.08] shrink-0" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)", backdropFilter: "blur(10px)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-zinc-100">
                      {done ? "Run Complete" : "Running"}: {suite.name}
                    </h1>
                    <p className="text-zinc-400 text-sm mt-2">
                      <span className="text-blue-400 font-semibold">Tool Calling Mode</span> Â· {formatDuration(elapsedSec)} elapsed
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {running && (
                      <Button variant="danger" size="md" onClick={stopRun}>
                        <Square size={14} />
                        Stop Run
                      </Button>
                    )}
                    <Button variant="secondary" size="md" onClick={() => setEnlargedToolModel(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>

              <div
                className="flex-1 min-h-0 overflow-hidden grid"
                style={{ gridTemplateColumns: `minmax(0, 1fr) ${enlargedSidebarWidth}px` }}
              >
                <div className="min-w-0 overflow-hidden border-r border-white/[0.08]">
                  <div className="p-6 h-full min-h-0">
                    <div className="h-full min-h-0 flex flex-col">
                      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/[0.08] shrink-0">
                        <ModelColorDot name={enlargedModel.name} size={8} />
                        <div className="flex-1">
                          <h2 className="text-xl font-semibold text-zinc-100">{enlargedModel.name}</h2>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={cn(
                              "text-xs px-3 py-1.5 rounded-full font-semibold border",
                              enlargedModel.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                                : enlargedModel.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                                  : enlargedModel.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                                    : "text-zinc-600 border-white/10"
                            )}>
                              {enlargedModel.status.charAt(0).toUpperCase() + enlargedModel.status.slice(1)}
                            </span>
                            {enlargedModel.status === "done" && (
                              <span className={cn(
                                "text-lg font-mono font-bold",
                                enlargedModel.overallScore >= 80 ? "text-emerald-400" : enlargedModel.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                              )}>
                                {enlargedModel.overallScore}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="min-h-0">
                        <div
                          className="relative rounded-xl overflow-hidden border border-white/[0.08]"
                          style={{ height: enlargedGraphHeight }}
                        >
                          <ToolFlow
                            modelName={enlargedModel.name}
                            currentScenarioIndex={enlargedModel.scenarios.findIndex((sc) => sc.status === "running")}
                            scenarios={mapToolScenariosForFlow(enlargedModel)}
                          />
                          <button
                            type="button"
                            aria-label="Resize workflow graph height"
                            onMouseDown={startGraphResize}
                            className="absolute bottom-0 left-0 h-4 w-full cursor-row-resize bg-transparent"
                          >
                            <span className="absolute bottom-1.5 left-1/2 h-[2px] w-24 -translate-x-1/2 rounded-full bg-white/12" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative min-w-0 overflow-y-auto bg-white/[0.02]">
                  <button
                    type="button"
                    aria-label="Resize test scenarios panel"
                    onMouseDown={startSidebarResize}
                    className="absolute left-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
                  >
                    <span className="absolute left-1/2 top-1/2 h-24 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/12" />
                  </button>
                  <div className="p-6 space-y-4 min-h-full">
                    <h3 className="text-lg font-bold text-zinc-200 uppercase tracking-wider mb-5 px-1">Test Scenarios</h3>
                    {enlargedModel.scenarios.map((scenario, si) => (
                      <div key={scenario.scenarioId} className="bg-white/[0.05] rounded-lg p-4 border border-white/[0.08]">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-zinc-500 text-sm">#{si + 1}</span>
                          <span className="text-zinc-300 text-base font-medium">{scenario.scenarioName}</span>
                          {scenario.status === "running" && <Loader2 size={12} className="text-blue-400 animate-spin" />}
                          {scenario.status === "done" && <CheckCircle2 size={12} className="text-emerald-400" />}
                          {scenario.status === "error" && <XCircle size={12} className="text-red-400" />}
                          {scenario.status === "done" && (
                            <span className={cn(
                              "ml-auto text-sm font-mono",
                              scenario.overallScore >= 80 ? "text-emerald-400" : scenario.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                            )}>
                              {scenario.overallScore}%
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-zinc-400 leading-6 mb-4">
                          {suite.toolScenarios?.find((item) => item.id === scenario.scenarioId)?.userMessage ?? scenario.scenarioName}
                        </p>

                        <div className="space-y-2">
                          {scenario.actualToolCalls.length > 0 ? (
                            scenario.actualToolCalls.map((call, ci) => (
                              <div key={`${call.functionName}-${ci}`} className="flex gap-3 text-sm leading-6">
                                <span className="w-16 text-right font-mono text-blue-400">Tool</span>
                                <div className="min-w-0 flex-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-blue-200">
                                  <div className="font-medium">{call.functionName}</div>
                                  <div className="text-xs text-blue-200/70 mt-1 break-all">
                                    {Object.keys(call.arguments ?? {}).length > 0 ? JSON.stringify(call.arguments) : "No arguments"}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-zinc-500">No tool calls recorded for this scenario.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
    );
  }

  // ── Conversation Running / done view ────────────────────────────────────
  if (isConversation) {
    const enlargedModel = enlargedConversationModel
      ? convoModelStates.find((model) => model.name === enlargedConversationModel) ?? null
      : null;

    return (
      <>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
              <h1 className="text-xl font-semibold text-zinc-800">
                {done ? "Run Complete" : "Running"}: {suite.name}
              </h1>
              <p className="text-zinc-600 text-sm mt-2">
                <span className="text-violet-400 font-semibold">Conversation Mode</span> · {formatDuration(elapsedSec)} elapsed
                {runId && done && (
                  <Link href={`/results/${runId}`} className="ml-4 text-blue-400 hover:text-blue-300 text-sm font-medium">
                    View Full Results →
                  </Link>
                )}
              </p>
          </div>
          {running && (
            <Button variant="danger" size="md" onClick={stopRun}>
              <Square size={14} />
              Stop Run
            </Button>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white/90 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          {/* Left: Graph Canvas */}
          <div className="min-w-0 overflow-hidden">
            <div className="p-5">
              {convoModelStates.map((model) => (
                <motion.div key={model.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full min-h-0 flex flex-col">
                  {/* Model Header */}
                  <div className="flex items-center gap-4 mb-4 shrink-0">
                    <ModelColorDot name={model.name} size={8} />
                    <div className="flex-1">
                      <h2 className="text-base font-semibold text-zinc-700">{model.name}</h2>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={cn(
                          "text-xs px-3 py-1.5 rounded-full font-semibold border",
                          model.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                            : model.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                              : model.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                                : "text-zinc-500 border-zinc-200 bg-zinc-100/70"
                        )}>
                          {model.status.charAt(0).toUpperCase() + model.status.slice(1)}
                        </span>
                        {model.status === "done" && (
                          <span className={cn(
                            "text-lg font-mono font-bold",
                            model.overallScore >= 80 ? "text-emerald-400" : model.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                          )}>
                            {model.overallScore}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Graph Canvas */}
                  {model.scenarios.some((sc) => sc.turns.length > 0) && (
                    <div className="h-[310px] rounded-2xl overflow-hidden border border-zinc-200/80">
                      <ConversationFlow
                        modelName={model.name}
                        currentScenarioIndex={model.scenarios.findIndex((sc) => sc.status === "running")}
                        scenarios={model.scenarios.map((sc) => ({
                          scenarioId: sc.scenarioId,
                          scenarioName: sc.scenarioName,
                          status: sc.status,
                          overallScore: sc.overallScore,
                          turns: (() => {
                            const turns: { userMessage: string; modelResponse: string; score?: number; contextUsage?: number; status: "pending" | "running" | "done" | "error" }[] = [];
                            for (let i = 0; i < sc.turns.length; i += 2) {
                              const user = sc.turns[i];
                              const assistant = sc.turns[i + 1];
                              if (user) {
                                turns.push({
                                  userMessage: user.content,
                                  modelResponse: assistant?.content ?? "",
                                  score: undefined,
                                  contextUsage: sc.contextUtilization ? Math.round(sc.contextUtilization * 100) : undefined,
                                  status: assistant ? "done" : sc.status === "running" ? "running" : "pending",
                                });
                              }
                            }
                            return turns;
                          })(),
                        }))}
                        onEnlarge={() => setEnlargedConversationModel(model.name)}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right: Test Cases Sidebar */}
          <div className="min-w-0 overflow-y-auto border-t border-zinc-200/80 bg-transparent">
            <div className="p-5 space-y-3 min-h-full">
              <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-[0.18em] px-1">Test Scenarios</h3>
              {convoModelStates[0]?.scenarios.map((sc, si) => (
                <div
                  key={sc.scenarioId}
                  className="rounded-xl p-4 border border-zinc-200/80 bg-zinc-50/70 transition-colors cursor-default"
                >
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                        {si + 1}
                      </span>
                      <h4 className="text-sm font-medium text-zinc-700 leading-snug mt-0.5 line-clamp-2">
                        {sc.scenarioName}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 pl-9">
                      {sc.status === "running" && <Loader2 size={13} className="text-blue-400 animate-spin" />}
                      {sc.status === "done" && <CheckCircle2 size={13} className="text-emerald-400" />}
                      {sc.status === "error" && <XCircle size={13} className="text-red-400" />}
                      {sc.status === "done" && sc.overallScore !== undefined && (
                        <span className={cn(
                          "text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex-shrink-0",
                          sc.overallScore >= 80 ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                            : sc.overallScore >= 50 ? "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20"
                              : "text-red-400 bg-red-500/10 border border-red-500/20"
                        )}>
                          {sc.overallScore}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Turns Preview */}
                  {sc.turns.length > 0 && (
                    <div className="space-y-2 pl-3 border-l border-zinc-200">
                      {sc.turns.slice(0, 2).map((turn, ti) => (
                        <div key={ti} className="text-xs leading-relaxed">
                          <span className={cn(
                            "font-semibold mr-2",
                            turn.role === "user" ? "text-zinc-500" : "text-violet-400"
                          )}>
                            {turn.role === "user" ? "👤" : "🤖"}
                          </span>
                          <span className="text-zinc-500 line-clamp-1">
                            {turn.content.substring(0, 120)}{turn.content.length > 120 ? "..." : ""}
                          </span>
                        </div>
                      ))}
                      {sc.turns.length > 2 && (
                        <div className="text-xs text-zinc-400 italic pl-3 font-medium">+{sc.turns.length - 2} more messages</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {enlargedModel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-lg"
          >
            <div className="h-full w-full min-w-0 overflow-hidden flex flex-col" style={{ backgroundColor: "rgba(0, 0, 0, 0.05)" }}>
              <div className="px-8 py-5 border-b border-white/[0.08] shrink-0" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)", backdropFilter: "blur(10px)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-zinc-100">
                      {done ? "Run Complete" : "Running"}: {suite.name}
                    </h1>
                    <p className="text-zinc-400 text-sm mt-2">
                      <span className="text-violet-400 font-semibold">Conversation Mode</span> Â· {formatDuration(elapsedSec)} elapsed
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {running && (
                      <Button variant="danger" size="md" onClick={stopRun}>
                        <Square size={14} />
                        Stop Run
                      </Button>
                    )}
                    <Button variant="secondary" size="md" onClick={() => setEnlargedConversationModel(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>

              <div
                className="flex-1 min-h-0 overflow-hidden grid"
                style={{ gridTemplateColumns: `minmax(0, 1fr) ${enlargedSidebarWidth}px` }}
              >
                <div className="min-w-0 overflow-hidden border-r border-white/[0.08]">
                  <div className="p-6 h-full min-h-0">
                    <div className="h-full min-h-0 flex flex-col">
                      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/[0.08] shrink-0">
                        <ModelColorDot name={enlargedModel.name} size={8} />
                        <div className="flex-1">
                          <h2 className="text-xl font-semibold text-zinc-100">{enlargedModel.name}</h2>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={cn(
                              "text-xs px-3 py-1.5 rounded-full font-semibold border",
                              enlargedModel.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                                : enlargedModel.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                                  : enlargedModel.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                                    : "text-zinc-600 border-white/10"
                            )}>
                              {enlargedModel.status.charAt(0).toUpperCase() + enlargedModel.status.slice(1)}
                            </span>
                            {enlargedModel.status === "done" && (
                              <span className={cn(
                                "text-lg font-mono font-bold",
                                enlargedModel.overallScore >= 80 ? "text-emerald-400" : enlargedModel.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                              )}>
                                {enlargedModel.overallScore}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="min-h-0">
                        <div
                          className="relative rounded-xl overflow-hidden border border-white/[0.08]"
                          style={{ height: enlargedGraphHeight }}
                        >
                          <ConversationFlow
                            modelName={enlargedModel.name}
                            currentScenarioIndex={enlargedModel.scenarios.findIndex((sc) => sc.status === "running")}
                            scenarios={enlargedModel.scenarios.map((sc) => ({
                              scenarioId: sc.scenarioId,
                              scenarioName: sc.scenarioName,
                              status: sc.status,
                              overallScore: sc.overallScore,
                              turns: (() => {
                                const turns: { userMessage: string; modelResponse: string; score?: number; contextUsage?: number; status: "pending" | "running" | "done" | "error" }[] = [];
                                for (let i = 0; i < sc.turns.length; i += 2) {
                                  const user = sc.turns[i];
                                  const assistant = sc.turns[i + 1];
                                  if (user) {
                                    turns.push({
                                      userMessage: user.content,
                                      modelResponse: assistant?.content ?? "",
                                      score: undefined,
                                      contextUsage: sc.contextUtilization ? Math.round(sc.contextUtilization * 100) : undefined,
                                      status: assistant ? "done" : sc.status === "running" ? "running" : "pending",
                                    });
                                  }
                                }
                                return turns;
                              })(),
                            }))}
                          />
                          <button
                            type="button"
                            aria-label="Resize workflow graph height"
                            onMouseDown={startGraphResize}
                            className="absolute bottom-0 left-0 h-4 w-full cursor-row-resize bg-transparent"
                          >
                            <span className="absolute bottom-1.5 left-1/2 h-[2px] w-24 -translate-x-1/2 rounded-full bg-white/12" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative min-w-0 overflow-y-auto bg-white/[0.02]">
                  <button
                    type="button"
                    aria-label="Resize test scenarios panel"
                    onMouseDown={startSidebarResize}
                    className="absolute left-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
                  >
                    <span className="absolute left-1/2 top-1/2 h-24 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/12" />
                  </button>
                  <div className="p-6 space-y-4 min-h-full">
                    <h3 className="text-lg font-bold text-zinc-200 uppercase tracking-wider mb-5 px-1">Test Scenarios</h3>
                    {enlargedModel.scenarios.map((sc, si) => (
                      <div key={sc.scenarioId} className="bg-white/[0.05] rounded-lg p-4 border border-white/[0.08]">
                        <div className="flex items-start gap-3 mb-3">
                          <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px] font-bold shrink-0 border border-white/[0.05]">
                            {si + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium text-zinc-100 leading-snug">{sc.scenarioName}</h4>
                              {sc.status === "running" && <Loader2 size={13} className="text-blue-400 animate-spin" />}
                              {sc.status === "done" && <CheckCircle2 size={13} className="text-emerald-400" />}
                              {sc.status === "error" && <XCircle size={13} className="text-red-400" />}
                              {sc.status === "done" && sc.overallScore !== undefined && (
                                <span className={cn(
                                  "ml-auto text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex-shrink-0",
                                  sc.overallScore >= 80 ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                                    : sc.overallScore >= 50 ? "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20"
                                      : "text-red-400 bg-red-500/10 border border-red-500/20"
                                )}>
                                  {sc.overallScore}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {sc.turns.length > 0 && (
                          <div className="space-y-2 pl-3 border-l border-white/[0.1]">
                            {sc.turns.map((turn, ti) => (
                              <div key={ti} className="text-sm leading-6">
                                <span className={cn(
                                  "font-semibold mr-2",
                                  turn.role === "user" ? "text-zinc-500" : "text-violet-400"
                                )}>
                                  {turn.role === "user" ? "User" : "Model"}
                                </span>
                                <span className="text-zinc-300">{turn.content}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
    );
  }

  // ── Adversarial Running / done view ───────────────────────────────────
  if (isAdversarial) {
    const enlargedModel = enlargedAdversarialModel
      ? advModelStates.find((model) => model.name === enlargedAdversarialModel) ?? null
      : null;

    return (
      <>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">
              {done ? "Run Complete" : "Running"}: {suite.name}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              <span className="text-rose-400">Adversarial</span> · {formatDuration(elapsedSec)}
              {runId && done && (
                <Link href={`/results/${runId}`} className="ml-3 text-blue-400 hover:text-blue-300 text-xs">
                  View Results →
                </Link>
              )}
            </p>
          </div>
          {running && (
            <Button variant="secondary" size="sm" onClick={stopRun}>
              <Square size={12} />
              Stop
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {advModelStates.map((model) => (
            <motion.div key={model.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <GlowCard className="p-5" animate={false}>
                <div className="flex items-center gap-3 mb-4">
                  <ModelColorDot name={model.name} />
                  <span className="text-zinc-200 font-medium text-sm">{model.name}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border",
                    model.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                      : model.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                        : model.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                          : "text-zinc-600 border-white/10"
                  )}>
                    {model.status}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    {model.scenarios.some((sc) => sc.turns.length > 0) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEnlargedAdversarialModel(model.name)}
                        className="text-zinc-400 hover:text-zinc-100"
                      >
                        <Maximize2 size={13} />
                        Enlarge View
                      </Button>
                    )}
                    {model.status === "done" && (
                      <span className={cn(
                        "text-sm font-mono",
                        model.overallScore >= 80 ? "text-emerald-400" : model.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                      )}>
                        {model.overallScore}%
                      </span>
                    )}
                  </span>
                </div>

                {/* React Flow visualization */}
                {model.scenarios.some((sc) => sc.turns.length > 0) && (
                  <div className="mb-4 h-[350px] rounded-xl overflow-hidden border border-white/[0.06]">
                    <AdversarialFlow
                      modelName={model.name}
                      currentScenarioIndex={model.scenarios.findIndex((sc) => sc.status === "running")}
                      scenarios={mapAdversarialScenariosForFlow(model)}
                      onEnlarge={() => setEnlargedAdversarialModel(model.name)}
                    />
                  </div>
                )}

                <div className="space-y-3">
                  {model.scenarios.map((sc, si) => (
                    <div key={sc.scenarioId} className="bg-white/[0.03] rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-zinc-500 text-xs">#{si + 1}</span>
                        <span className="text-zinc-300 text-sm">{sc.scenarioName}</span>
                        {sc.status === "running" && <Loader2 size={12} className="text-blue-400 animate-spin" />}
                        {sc.status === "done" && (
                          sc.survived
                            ? <CheckCircle2 size={12} className="text-emerald-400" />
                            : <AlertTriangle size={12} className="text-red-400" />
                        )}
                        {sc.status === "error" && <XCircle size={12} className="text-red-400" />}
                        {sc.status === "done" && (
                          <>
                            <span className={cn(
                              "ml-auto text-xs font-mono",
                              sc.robustnessScore >= 80 ? "text-emerald-400" : sc.robustnessScore >= 50 ? "text-yellow-400" : "text-red-400"
                            )}>
                              {sc.robustnessScore}%
                            </span>
                            {sc.breachCount > 0 && (
                              <span className="text-red-400 text-[10px]">
                                {sc.breachCount} breach{sc.breachCount !== 1 ? "es" : ""}
                              </span>
                            )}
                            {sc.survived && (
                              <span className="text-emerald-400 text-[10px]">Survived</span>
                            )}
                          </>
                        )}
                      </div>

                      {sc.turns.length > 0 && (
                        <div className="space-y-1.5 ml-4">
                          {sc.turns.map((turn, ti) => (
                            <div key={ti} className={cn(
                              "flex gap-2 text-xs",
                              turn.breachDetected && "bg-red-500/10 rounded px-1.5 py-0.5"
                            )}>
                              <span className={cn(
                                "flex-shrink-0 w-16 text-right font-mono",
                                turn.role === "attacker" ? "text-rose-400" : "text-zinc-400"
                              )}>
                                {turn.role === "attacker" ? "Attack" : "Defend"}
                              </span>
                              <span className={cn(
                                "truncate",
                                turn.breachDetected ? "text-red-300" : "text-zinc-400"
                              )}>
                                {turn.content.substring(0, 200)}
                              </span>
                              {turn.breachDetected && (
                                <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {enlargedModel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-lg"
          >
            <div className="h-full w-full min-w-0 overflow-hidden flex flex-col" style={{ backgroundColor: "rgba(0, 0, 0, 0.05)" }}>
              <div className="px-8 py-5 border-b border-white/[0.08] shrink-0" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)", backdropFilter: "blur(10px)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-zinc-100">
                      {done ? "Run Complete" : "Running"}: {suite.name}
                    </h1>
                    <p className="text-zinc-400 text-sm mt-2">
                      <span className="text-rose-400 font-semibold">Adversarial Mode</span> • {formatDuration(elapsedSec)} elapsed
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {running && (
                      <Button variant="danger" size="md" onClick={stopRun}>
                        <Square size={14} />
                        Stop Run
                      </Button>
                    )}
                    <Button variant="secondary" size="md" onClick={() => setEnlargedAdversarialModel(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>

              <div
                className="flex-1 min-h-0 overflow-hidden grid"
                style={{ gridTemplateColumns: `minmax(0, 1fr) ${enlargedSidebarWidth}px` }}
              >
                <div className="min-w-0 overflow-hidden border-r border-white/[0.08]">
                  <div className="p-6 h-full min-h-0">
                    <div className="h-full min-h-0 flex flex-col">
                      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/[0.08] shrink-0">
                        <ModelColorDot name={enlargedModel.name} size={8} />
                        <div className="flex-1">
                          <h2 className="text-xl font-semibold text-zinc-100">{enlargedModel.name}</h2>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={cn(
                              "text-xs px-3 py-1.5 rounded-full font-semibold border",
                              enlargedModel.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                                : enlargedModel.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                                  : enlargedModel.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                                    : "text-zinc-600 border-white/10"
                            )}>
                              {enlargedModel.status.charAt(0).toUpperCase() + enlargedModel.status.slice(1)}
                            </span>
                            {enlargedModel.status === "done" && (
                              <span className={cn(
                                "text-lg font-mono font-bold",
                                enlargedModel.overallScore >= 80 ? "text-emerald-400" : enlargedModel.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                              )}>
                                {enlargedModel.overallScore}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="min-h-0">
                        <div
                          className="relative rounded-xl overflow-hidden border border-white/[0.08]"
                          style={{ height: enlargedGraphHeight }}
                        >
                          <AdversarialFlow
                            modelName={enlargedModel.name}
                            currentScenarioIndex={enlargedModel.scenarios.findIndex((sc) => sc.status === "running")}
                            scenarios={mapAdversarialScenariosForFlow(enlargedModel)}
                          />
                          <button
                            type="button"
                            aria-label="Resize workflow graph height"
                            onMouseDown={startGraphResize}
                            className="absolute bottom-0 left-0 h-4 w-full cursor-row-resize bg-transparent"
                          >
                            <span className="absolute bottom-1.5 left-1/2 h-[2px] w-24 -translate-x-1/2 rounded-full bg-white/12" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative min-w-0 overflow-y-auto bg-white/[0.02]">
                  <button
                    type="button"
                    aria-label="Resize test scenarios panel"
                    onMouseDown={startSidebarResize}
                    className="absolute left-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
                  >
                    <span className="absolute left-1/2 top-1/2 h-24 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/12" />
                  </button>
                  <div className="p-6 space-y-4 min-h-full">
                    <h3 className="text-lg font-bold text-zinc-200 uppercase tracking-wider mb-5 px-1">Test Scenarios</h3>
                    {enlargedModel.scenarios.map((sc, si) => (
                      <div key={sc.scenarioId} className="bg-white/[0.05] rounded-lg p-4 border border-white/[0.08]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-zinc-500 text-sm">#{si + 1}</span>
                          <span className="text-zinc-300 text-base font-medium">{sc.scenarioName}</span>
                          {sc.status === "running" && <Loader2 size={12} className="text-blue-400 animate-spin" />}
                          {sc.status === "done" && (
                            sc.survived
                              ? <CheckCircle2 size={12} className="text-emerald-400" />
                              : <AlertTriangle size={12} className="text-red-400" />
                          )}
                          {sc.status === "error" && <XCircle size={12} className="text-red-400" />}
                          {sc.status === "done" && (
                            <>
                              <span className={cn(
                                "ml-auto text-sm font-mono",
                                sc.robustnessScore >= 80 ? "text-emerald-400" : sc.robustnessScore >= 50 ? "text-yellow-400" : "text-red-400"
                              )}>
                                {sc.robustnessScore}%
                              </span>
                              {sc.breachCount > 0 && (
                                <span className="text-red-400 text-xs">
                                  {sc.breachCount} breach{sc.breachCount !== 1 ? "es" : ""}
                                </span>
                              )}
                              {sc.survived && <span className="text-emerald-400 text-xs">Survived</span>}
                            </>
                          )}
                        </div>

                        {sc.turns.length > 0 && (
                          <div className="space-y-1.5 ml-4">
                            {sc.turns.map((turn, ti) => (
                              <div key={ti} className={cn("flex gap-2 text-sm leading-6", turn.breachDetected && "bg-red-500/10 rounded px-1.5 py-0.5")}>
                                <span className={cn(
                                  "flex-shrink-0 w-16 text-right font-mono",
                                  turn.role === "attacker" ? "text-rose-400" : "text-zinc-400"
                                )}>
                                  {turn.role === "attacker" ? "Attack" : "Defend"}
                                </span>
                                <span className={turn.breachDetected ? "text-red-300" : "text-zinc-400"}>
                                  {turn.content}
                                </span>
                                {turn.breachDetected && <AlertTriangle size={10} className="text-red-400 flex-shrink-0 mt-0.5" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
    );
  }

  // ── Standard Running / done view ────────────────────────────────────────
  const enlargedModel = enlargedStandardModel
    ? modelStates.find((model) => model.name === enlargedStandardModel) ?? null
    : null;

  return (
    <>
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{suite.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Clock size={11} />
              {formatDuration(elapsedSec)}
            </span>
            <span>{selectedModels.length} models · {
              isToolCalling ? `${suite.toolScenarios?.length ?? 0} scenarios`
                : isConversation ? `${suite.conversationScenarios?.length ?? 0} scenarios`
                  : isAdversarial ? `${suite.adversarialScenarios?.length ?? 0} scenarios`
                    : `${suite.prompts.length} prompts`
            }</span>
            {judgeEnabled && judgeModel && (
              <span className="flex items-center gap-1 text-violet-400">
                <Gavel size={10} />
                Judge: {judgeModelDisplay}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <Button variant="danger" size="sm" onClick={stopRun}>
              <Square size={13} />
              Stop
            </Button>
          )}
          {done && runId && (
            <Button variant="primary" size="sm" onClick={() => router.push(`/results/${runId}`)}>
              View Results
            </Button>
          )}
        </div>
      </div>

      {/* Model pipeline */}
      <div className="space-y-4">
        {modelStates.map((model, mi) => {
          const color = getModelColor(model.name);
          const isActive = mi === currentModelIdx && running && model.status !== "done";
          const completedPrompts = model.prompts.filter((p) => p.status === "done" || p.status === "error").length;

          return (
            <GlowCard
              key={model.name}
              className="p-5"
              glowColor={isActive ? color.hex + "15" : undefined}
              animate={false}
            >
              {/* Model header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 rounded-full" style={{ background: color.hex }} />
                <span className="text-zinc-200 font-medium text-sm">{model.name}</span>
                <span className="ml-auto flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEnlargedStandardModel(model.name)}
                    className="text-zinc-400 hover:text-zinc-100"
                  >
                    <Maximize2 size={13} />
                    Enlarge View
                  </Button>
                  {/* Auto score status */}
                  {model.status === "loading" && (
                    <span className="flex items-center gap-1.5 text-yellow-400 text-xs">
                      <Loader2 size={12} className="animate-spin" />
                      Loading model...
                    </span>
                  )}
                  {model.status === "running" && (
                    <span className="text-xs text-zinc-500">
                      {completedPrompts}/{model.prompts.length} prompts
                    </span>
                  )}
                  {model.status === "done" && (
                    <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono">
                      <CheckCircle2 size={12} />
                      {model.overallScore}% · {model.avgTokensPerSec.toFixed(1)} t/s
                    </span>
                  )}
                  {model.status === "skipped" && (
                    <span className="flex items-center gap-1.5 text-zinc-500 text-xs">
                      <AlertTriangle size={12} />
                      Skipped
                    </span>
                  )}
                  {model.status === "pending" && (
                    <span className="text-zinc-600 text-xs">Waiting...</span>
                  )}

                  {/* Judge badge */}
                  {model.judgeStatus === "pending" && (
                    <span className="text-violet-600 text-xs">Waiting for judge...</span>
                  )}
                  {model.judgeStatus === "scoring" && (
                    <span className="flex items-center gap-1.5 text-violet-400 text-xs">
                      <Loader2 size={11} className="animate-spin" />
                      {model.judgeWins ?? 0} win{model.judgeWins !== 1 ? "s" : ""} so far
                    </span>
                  )}
                  {model.judgeStatus === "done" && (
                    <span className={cn(
                      "flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-lg border",
                      (model.judgeWins ?? 0) > 0
                        ? "text-violet-300 bg-violet-500/10 border-violet-500/20"
                        : "text-zinc-500 bg-white/5 border-white/10"
                    )}>
                      <Gavel size={10} />
                      {model.judgeWins ?? 0} win{model.judgeWins !== 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              </div>

              {/* Prompt nodes */}
              <div className="flex flex-wrap gap-2">
                {model.prompts.map((p, pi) => {
                  const key = `${model.name}-${pi}`;
                  const isExpanded = expandedPrompts.has(key);
                  const suitePrompt = suite.prompts[pi];

                  return (
                    <div key={pi} className="w-full">
                      <button
                        onClick={() => togglePromptExpand(key)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors",
                          p.status === "running" ? "bg-blue-500/10 border border-blue-500/20" :
                            p.status === "done" ? "bg-emerald-500/5 border border-emerald-500/10" :
                              p.status === "error" || p.status === "timeout" ? "bg-red-500/5 border border-red-500/10" :
                                "bg-white/3 border border-white/[0.04] hover:bg-white/5"
                        )}
                      >
                        {p.status === "pending" && <div className="w-2 h-2 rounded-full bg-zinc-700 flex-shrink-0" />}
                        {p.status === "loading" && <Loader2 size={12} className="animate-spin text-yellow-400 flex-shrink-0" />}
                        {p.status === "running" && <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                        {p.status === "done" && <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />}
                        {(p.status === "error" || p.status === "timeout") && <XCircle size={13} className="text-red-400 flex-shrink-0" />}

                        <span className="text-zinc-400 text-xs flex-1 truncate">
                          {suitePrompt?.text || `Prompt ${pi + 1}`}
                        </span>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.status === "done" && (
                            <span className="text-zinc-600 text-xs font-mono">{p.score}%</span>
                          )}
                          {p.judgeScore !== undefined && (
                            <span className={cn(
                              "text-xs font-mono flex items-center gap-0.5",
                              p.judgeWon ? "text-violet-300" : "text-zinc-600"
                            )}>
                              {p.judgeWon ? "👑" : <Gavel size={9} />}
                              {p.judgeScore}
                            </span>
                          )}
                          {p.status === "running" && p.response && (
                            <span className="text-blue-400 text-xs font-mono">
                              {p.tokensPerSec > 0 ? `${p.tokensPerSec.toFixed(1)} t/s` : "..."}
                            </span>
                          )}
                          {p.response && (
                            <ChevronDown
                              size={13}
                              className={cn("text-zinc-700 transition-transform flex-shrink-0", isExpanded && "rotate-180")}
                            />
                          )}
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && p.response && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mx-2 mt-1 p-3 bg-white/3 rounded-xl border border-white/[0.04] max-h-48 overflow-y-auto">
                              <MarkdownContent content={p.response} className="text-xs" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </GlowCard>
          );
        })}
      </div>

      {/* Judge phase indicator */}
      {judgeEnabled && judgePhase !== "idle" && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {judgePhase === "loading" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-violet-500/8 border border-violet-500/20 rounded-2xl">
                <Loader2 size={16} className="text-violet-400 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-violet-300 text-sm font-medium">Loading judge model…</p>
                  <p className="text-violet-500 text-xs mt-0.5">{judgeModelDisplay}</p>
                </div>
              </div>
            )}

            {judgePhase === "scoring" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-violet-500/8 border border-violet-500/20 rounded-2xl">
                <Gavel size={16} className="text-violet-400 flex-shrink-0" />
                <div>
                  <p className="text-violet-300 text-sm font-medium">Judge evaluating responses…</p>
                  <p className="text-violet-500 text-xs mt-0.5">
                    {modelStates.filter((m) => m.judgeStatus === "done").length} / {modelStates.filter((m) => m.status === "done").length} models scored
                  </p>
                </div>
              </div>
            )}

            {judgePhase === "done" && judgeWinner && (
              <div className="flex items-center gap-4 px-5 py-4 bg-violet-500/10 border border-violet-500/30 rounded-2xl">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Trophy size={18} className="text-violet-300" />
                </div>
                <div>
                  <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-0.5">Judge Verdict</p>
                  <p className="text-zinc-100 text-base font-semibold">{judgeWinner.modelName}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    won <span className="text-violet-400 font-mono">{judgeWinner.wins}</span> prompt{judgeWinner.wins !== 1 ? "s" : ""} according to {judgeModelDisplay}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-4">
                  {modelStates.filter((m) => m.judgeStatus === "done").map((m) => {
                    const color = getModelColor(m.name);
                    return (
                      <div key={m.name} className="text-center">
                        <div className="text-xl font-bold font-mono" style={{ color: color.hex }}>
                          {m.judgeWins ?? 0}
                        </div>
                        <div className="text-zinc-600 text-[10px] truncate max-w-[72px]">{m.name.split(":")[0]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {judgePhase === "error" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-red-500/8 border border-red-500/20 rounded-2xl">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-red-300 text-sm font-medium">Judge failed</p>
                  <p className="text-red-500 text-xs mt-0.5">{judgeError}</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
    <AnimatePresence>
      {enlargedModel && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-lg"
        >
          <div className="h-full w-full min-w-0 overflow-hidden flex flex-col" style={{ backgroundColor: "rgba(0, 0, 0, 0.05)" }}>
            <div className="px-8 py-5 border-b border-white/[0.08] shrink-0" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)", backdropFilter: "blur(10px)" }}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-zinc-100">
                    {done ? "Run Complete" : "Running"}: {suite.name}
                  </h1>
                  <p className="text-zinc-400 text-sm mt-2">
                    <span className="text-zinc-200 font-semibold">Standard Mode</span> Â· {formatDuration(elapsedSec)} elapsed
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {running && (
                    <Button variant="danger" size="md" onClick={stopRun}>
                      <Square size={14} />
                      Stop Run
                    </Button>
                  )}
                  <Button variant="secondary" size="md" onClick={() => setEnlargedStandardModel(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>

            <div
              className="flex-1 min-h-0 overflow-hidden grid"
              style={{ gridTemplateColumns: `minmax(0, 1fr) ${enlargedSidebarWidth}px` }}
            >
              <div className="min-w-0 overflow-y-auto border-r border-white/[0.08]">
                <div className="p-6 min-h-full">
                  <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/[0.08]">
                    <ModelColorDot name={enlargedModel.name} size={8} />
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-zinc-100">{enlargedModel.name}</h2>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={cn(
                          "text-xs px-3 py-1.5 rounded-full font-semibold border",
                          enlargedModel.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                            : enlargedModel.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                              : enlargedModel.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                                : "text-zinc-500 border-zinc-200 bg-zinc-100/70"
                        )}>
                          {enlargedModel.status.charAt(0).toUpperCase() + enlargedModel.status.slice(1)}
                        </span>
                        {enlargedModel.status === "done" && (
                          <span className="text-lg font-mono font-bold text-emerald-400">
                            {enlargedModel.overallScore}% Â· {enlargedModel.avgTokensPerSec.toFixed(1)} t/s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {enlargedModel.prompts.map((p, pi) => {
                      const key = `${enlargedModel.name}-${pi}`;
                      const suitePrompt = suite.prompts[pi];
                      const isExpanded = expandedPrompts.has(key);

                      return (
                        <div key={key} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
                          <button
                            onClick={() => togglePromptExpand(key)}
                            className={cn(
                              "w-full flex items-start gap-3 text-left",
                              p.response && "cursor-pointer"
                            )}
                          >
                            {p.status === "pending" && <div className="mt-2 h-2.5 w-2.5 rounded-full bg-zinc-700 flex-shrink-0" />}
                            {p.status === "loading" && <Loader2 size={14} className="mt-1 animate-spin text-yellow-400 flex-shrink-0" />}
                            {p.status === "running" && <div className="mt-2 h-2.5 w-2.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                            {p.status === "done" && <CheckCircle2 size={15} className="mt-1 text-emerald-400 flex-shrink-0" />}
                            {(p.status === "error" || p.status === "timeout") && <XCircle size={15} className="mt-1 text-red-400 flex-shrink-0" />}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-3">
                                <span className="text-zinc-500 text-xs font-mono">#{pi + 1}</span>
                                <span className="text-sm font-medium text-zinc-200">{suitePrompt?.category ?? "custom"}</span>
                                {p.status === "done" && (
                                  <span className="text-xs font-mono text-emerald-400">{p.score}%</span>
                                )}
                              </div>
                              <p className="mt-2 text-sm leading-6 text-zinc-300">
                                {suitePrompt?.text || `Prompt ${pi + 1}`}
                              </p>
                            </div>

                            {p.response && (
                              <ChevronDown
                                size={14}
                                className={cn("mt-1 text-zinc-500 transition-transform flex-shrink-0", isExpanded && "rotate-180")}
                              />
                            )}
                          </button>

                          <AnimatePresence>
                            {isExpanded && p.response && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                                  <MarkdownContent content={p.response} className="text-sm" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="relative min-w-0 overflow-y-auto bg-white/[0.02]">
                <button
                  type="button"
                  aria-label="Resize test scenarios panel"
                  onMouseDown={startSidebarResize}
                  className="absolute left-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
                >
                  <span className="absolute left-1/2 top-1/2 h-24 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/12" />
                </button>
                <div className="p-6 space-y-4 min-h-full">
                  <h3 className="text-lg font-bold text-zinc-200 uppercase tracking-wider mb-5 px-1">Test Prompts</h3>
                  {suite.prompts.map((prompt, pi) => {
                    const promptState = enlargedModel.prompts[pi];
                    return (
                      <div key={prompt.id} className="bg-white/[0.05] rounded-lg p-4 border border-white/[0.08]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-zinc-500 text-sm">#{pi + 1}</span>
                          <span className="text-zinc-300 text-base font-medium">{prompt.category}</span>
                          {promptState?.status === "running" && <Loader2 size={12} className="text-blue-400 animate-spin" />}
                          {promptState?.status === "done" && (
                            <span className="ml-auto text-sm font-mono text-emerald-400">{promptState.score}%</span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 leading-6">{prompt.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
