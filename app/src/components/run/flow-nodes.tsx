"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, Wrench, AlertTriangle, CheckCircle2, XCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── User Message Node ──────────────────────────────────────────────────────

interface UserMessageData {
  message: string;
  turnNumber?: number;
  label?: string;
}

export const UserMessageNode = memo(function UserMessageNode({ data }: NodeProps & { data: UserMessageData }) {
  return (
    <div 
      className="w-[420px] backdrop-blur-xl border rounded-xl px-6 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-[var(--border-strong)] transition-colors"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-primary)",
        color: "var(--text-primary)"
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-0" style={{ backgroundColor: "var(--border-strong)" }} />
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={14} style={{ color: "var(--text-secondary)" }} />
        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--text-secondary)" }}>
          {data.label ?? "User"} {data.turnNumber !== undefined ? `(Turn ${data.turnNumber + 1})` : ""}
        </span>
      </div>
      <p className="text-sm leading-7 whitespace-pre-wrap break-words font-medium">{data.message}</p>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-0" style={{ backgroundColor: "var(--border-strong)" }} />
    </div>
  );
});

// ─── Model Response Node ────────────────────────────────────────────────────

interface ModelResponseData {
  response: string;
  modelName?: string;
  tokensPerSec?: number;
  ttft?: number;
  score?: number;
  status?: "pending" | "running" | "done" | "error";
}

export const ModelResponseNode = memo(function ModelResponseNode({ data }: NodeProps & { data: ModelResponseData }) {
  const isRunning = data.status === "running";
  return (
    <div 
      className="w-[420px] backdrop-blur-xl border rounded-xl px-6 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-[var(--border-strong)] transition-colors"
      style={{
        backgroundColor: isRunning ? "rgba(59, 130, 246, 0.1)" : "var(--bg-card)",
        borderColor: isRunning ? "rgba(59, 130, 246, 0.4)" : "var(--border-primary)",
        color: "var(--text-primary)"
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-0" style={{ backgroundColor: "#3b82f6" }} />
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-3 h-3 rounded-full flex-shrink-0", isRunning ? "bg-blue-400 animate-pulse" : "bg-zinc-400")} />
        <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--text-secondary)" }}>
          {data.modelName ?? "Model"}
        </span>
        {data.score !== undefined && (
          <span className={cn(
            "ml-auto text-lg font-mono font-bold",
            data.score >= 80 ? "text-emerald-500" : data.score >= 50 ? "text-yellow-500" : "text-red-500"
          )}>
            {data.score}%
          </span>
        )}
      </div>
      {data.response ? (
        <p className="text-sm leading-7 whitespace-pre-wrap break-words font-medium">{data.response}</p>
      ) : (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {isRunning && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
          <span className="font-medium">{isRunning ? "Generating..." : "Waiting..."}</span>
        </div>
      )}
      {data.tokensPerSec !== undefined && data.tokensPerSec > 0 && (
        <div className="mt-3 text-xs font-mono space-y-1" style={{ color: "var(--text-muted)" }}>
          <div>{data.tokensPerSec.toFixed(2)} tokens/sec</div>
          {data.ttft && <div>TTFT: {data.ttft.toFixed(0)}ms</div>}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-0" style={{ backgroundColor: "#3b82f6" }} />
    </div>
  );
});

// ─── Tool Call Node ─────────────────────────────────────────────────────────

interface ToolCallData {
  functionName: string;
  arguments: Record<string, unknown>;
  correct?: boolean;
  hallucinated?: boolean;
}

export const ToolCallNode = memo(function ToolCallNode({ data }: NodeProps & { data: ToolCallData }) {
  return (
    <div 
      className="backdrop-blur-xl border rounded-xl px-4 py-3 max-w-[260px] shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: data.hallucinated ? "#fca5a5" : data.correct ? "#86efac" : "#93c5fd",
        color: "var(--text-primary)"
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-0" style={{ backgroundColor: "#3b82f6" }} />
      <div className="flex items-center gap-2 mb-1.5">
        <Wrench size={12} style={{ color: "#3b82f6" }} />
        <span className="text-xs font-mono" style={{ color: "#3b82f6" }}>{data.functionName}</span>
        {data.correct !== undefined && (
          data.correct
            ? <CheckCircle2 size={11} className="ml-auto text-emerald-500" />
            : <XCircle size={11} className="ml-auto text-red-500" />
        )}
        {data.hallucinated && (
          <AlertTriangle size={11} className="ml-auto text-red-500" />
        )}
      </div>
      <div className="space-y-0.5">
        {Object.entries(data.arguments).slice(0, 4).map(([key, val]) => (
          <div key={key} className="text-[10px] flex gap-1">
            <span className="font-mono" style={{ color: "var(--text-muted)" }}>{key}:</span>
            <span style={{ color: "var(--text-secondary)" }} className="truncate">{JSON.stringify(val)}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-0" style={{ backgroundColor: "#3b82f6" }} />
    </div>
  );
});

// ─── Score Node ─────────────────────────────────────────────────────────────

interface ScoreNodeData {
  score: number;
  label?: string;
}

export const ScoreNode = memo(function ScoreNode({ data }: NodeProps & { data: ScoreNodeData }) {
  return (
    <div 
      className="flex items-center gap-2 backdrop-blur-xl border shadow-sm rounded-lg px-3 py-2"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-primary)",
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-0" style={{ backgroundColor: "var(--border-strong)" }} />
      <span className={cn(
        "text-lg font-mono font-semibold",
        data.score >= 80 ? "text-emerald-500" : data.score >= 50 ? "text-yellow-500" : "text-red-500"
      )}>
        {data.score}
      </span>
      {data.label && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{data.label}</span>}
    </div>
  );
});

// ─── Breach Alert Node ──────────────────────────────────────────────────────

interface BreachAlertData {
  type: string;
  severity: string;
  evidence: string;
  turn: number;
}

export const BreachAlertNode = memo(function BreachAlertNode({ data }: NodeProps & { data: BreachAlertData }) {
  return (
    <div 
      className="backdrop-blur-xl border rounded-xl px-4 py-3 max-w-[260px] shadow-[0_8px_30px_rgb(239,68,68,0.1)]"
      style={{
        backgroundColor: "rgba(239, 68, 68, 0.05)",
        borderColor: "#fca5a5",
        color: "#991b1b"
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-0" style={{ backgroundColor: "#ef4444" }} />
      <div className="flex items-center gap-2 mb-1.5">
        <Shield size={12} style={{ color: "#ef4444" }} />
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#7f1d1d" }}>
          Breach — {data.severity}
        </span>
        <span style={{ color: "var(--text-muted)" }} className="ml-auto text-[10px]">Turn {data.turn + 1}</span>
      </div>
      <p className="font-medium text-xs">{data.type.replace("_", " ")}</p>
      <p className="text-[10px] mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{data.evidence}</p>
    </div>
  );
});

// ─── Turn Divider Node ──────────────────────────────────────────────────────

interface TurnDividerData {
  turn: number;
  contextUsage?: number;
}

export const TurnDividerNode = memo(function TurnDividerNode({ data }: NodeProps & { data: TurnDividerData }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1 min-w-[180px]">
      <div className="h-px w-10" style={{ backgroundColor: "var(--border-primary)" }} />
      <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>Turn {data.turn + 1}</span>
      {data.contextUsage !== undefined && (
        <span className={cn(
          "text-[10px] font-mono",
          data.contextUsage > 85 ? "text-amber-500" : ""
        )}
        style={{ color: data.contextUsage > 85 ? undefined : "var(--text-muted)" }}>
          {data.contextUsage}% ctx
        </span>
      )}
      <div className="h-px w-10" style={{ backgroundColor: "var(--border-primary)" }} />
    </div>
  );
});

// ─── Export node types map ──────────────────────────────────────────────────

export const nodeTypes = {
  userMessage: UserMessageNode,
  modelResponse: ModelResponseNode,
  toolCall: ToolCallNode,
  scoreNode: ScoreNode,
  breachAlert: BreachAlertNode,
  turnDivider: TurnDividerNode,
};
