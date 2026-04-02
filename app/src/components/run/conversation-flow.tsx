"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize2 } from "lucide-react";
import { nodeTypes } from "./flow-nodes";

interface ConversationTurn {
  userMessage: string;
  modelResponse: string;
  score?: number;
  tokensPerSec?: number;
  ttft?: number;
  contextUsage?: number;
  status: "pending" | "running" | "done" | "error";
}

interface ConversationScenario {
  scenarioId: string;
  scenarioName: string;
  turns: ConversationTurn[];
  overallScore?: number;
  status: "pending" | "running" | "done" | "error";
}

interface ConversationFlowProps {
  modelName: string;
  scenarios: ConversationScenario[];
  currentScenarioIndex: number;
  onEnlarge?: () => void;
}

const CARD_WIDTH = 420;
const CARD_GAP = 52;
const NODE_X = 80;
const SCORE_X = NODE_X + CARD_WIDTH + 72;
const BASE_CARD_HEIGHT = 96;
const LINE_HEIGHT = 24;
const CHARS_PER_LINE = 42;

function estimateCardHeight(text: string, extra = 0) {
  const safeText = text?.trim() ?? "";
  const lines = Math.max(2, Math.ceil(safeText.length / CHARS_PER_LINE));
  return BASE_CARD_HEIGHT + lines * LINE_HEIGHT + extra;
}

export default function ConversationFlow({
  modelName,
  scenarios,
  currentScenarioIndex,
  onEnlarge,
}: ConversationFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 24;

    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
      const scenario = scenarios[scenarioIndex];

      if (scenario.status === "pending" && scenarioIndex > currentScenarioIndex + 1) continue;

      const isActiveScenario = scenarioIndex === currentScenarioIndex;
      const scenarioHeaderId = `scenario-header-${scenarioIndex}`;

      nodes.push({
        id: scenarioHeaderId,
        type: "turnDivider",
        position: { x: NODE_X + 60, y },
        data: { turn: scenarioIndex, contextUsage: undefined },
      });
      y += 56;

      let prevNodeId = scenarioHeaderId;

      for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex++) {
        const turn = scenario.turns[turnIndex];
        const isActiveTurn = isActiveScenario && turn.status === "running";

        if (turnIndex > 0) {
          const dividerId = `divider-${scenarioIndex}-${turnIndex}`;
          nodes.push({
            id: dividerId,
            type: "turnDivider",
            position: { x: NODE_X + 60, y },
            data: {
              turn: turnIndex,
              contextUsage: turn.contextUsage,
            },
          });

          edges.push({
            id: `e-${prevNodeId}-${dividerId}`,
            source: prevNodeId,
            target: dividerId,
            style: { stroke: "var(--border-primary)" },
          });

          prevNodeId = dividerId;
          y += 64;
        }

        const userHeight = estimateCardHeight(turn.userMessage);
        const modelHeight = estimateCardHeight(turn.modelResponse, turn.tokensPerSec ? 18 : 0);
        const modelY = y + userHeight + CARD_GAP;

        const userNodeId = `user-${scenarioIndex}-${turnIndex}`;
        nodes.push({
          id: userNodeId,
          type: "userMessage",
          position: { x: NODE_X, y },
          data: {
            message: turn.userMessage,
            label: "User",
            turnNumber: turnIndex,
          },
        });

        edges.push({
          id: `e-${prevNodeId}-${userNodeId}`,
          source: prevNodeId,
          target: userNodeId,
          animated: isActiveTurn,
          style: { stroke: isActiveTurn ? "#3b82f6" : "var(--border-primary)" },
        });

        const modelNodeId = `model-${scenarioIndex}-${turnIndex}`;
        nodes.push({
          id: modelNodeId,
          type: "modelResponse",
          position: { x: NODE_X, y: modelY },
          data: {
            modelName,
            response: turn.modelResponse,
            score: turn.status === "done" ? turn.score : undefined,
            tokensPerSec: turn.tokensPerSec,
            ttft: turn.ttft,
            status:
              turn.status === "running"
                ? "running"
                : turn.status === "done"
                  ? "done"
                  : "pending",
          },
        });

        edges.push({
          id: `e-${userNodeId}-${modelNodeId}`,
          source: userNodeId,
          target: modelNodeId,
          animated: isActiveTurn,
          style: { stroke: isActiveTurn ? "#3b82f6" : "var(--border-primary)" },
        });

        if (turn.status === "done" && turn.score !== undefined) {
          const scoreNodeId = `score-${scenarioIndex}-${turnIndex}`;
          nodes.push({
            id: scoreNodeId,
            type: "scoreNode",
            position: { x: SCORE_X, y: modelY + Math.max(12, modelHeight / 2 - 18) },
            data: { score: turn.score, label: "%" },
          });

          edges.push({
            id: `e-${modelNodeId}-${scoreNodeId}`,
            source: modelNodeId,
            target: scoreNodeId,
            style: {
              stroke:
                turn.score >= 80
                  ? "#10b981"
                  : turn.score >= 50
                    ? "#eab308"
                    : "#ef4444",
            },
          });
        }

        prevNodeId = modelNodeId;
        y = modelY + modelHeight + 56;
      }

      if (scenario.status === "done" && scenario.overallScore !== undefined) {
        const overallScoreId = `overall-${scenarioIndex}`;
        nodes.push({
          id: overallScoreId,
          type: "scoreNode",
          position: { x: NODE_X, y },
          data: { score: scenario.overallScore, label: "overall" },
        });

        edges.push({
          id: `e-${prevNodeId}-${overallScoreId}`,
          source: prevNodeId,
          target: overallScoreId,
          style: {
            stroke:
              scenario.overallScore >= 80
                ? "#10b981"
                : scenario.overallScore >= 50
                  ? "#eab308"
                  : "#ef4444",
          },
        });

        y += 88;
      }

      y += 36;
    }

    return { nodes, edges };
  }, [scenarios, currentScenarioIndex, modelName]);

  return (
    <div 
      className="w-full h-full rounded-xl border shadow-inner overflow-hidden relative"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-primary)"
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={2.5}
        defaultViewport={{ x: 60, y: 20, zoom: 0.6 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        selectionOnDrag={false}
      >
        <Background color="var(--border-subtle)" gap={24} size={1} variant={BackgroundVariant.Lines} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {onEnlarge && (
        <button
          onClick={onEnlarge}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg backdrop-blur-sm transition-colors hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-primary)",
            color: "var(--text-secondary)",
            border: "1px solid"
          }}
          title="Enlarge view"
        >
          <Maximize2 size={18} />
        </button>
      )}
    </div>
  );
}
