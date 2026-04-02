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

interface BreachInfo {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  evidence: string;
}

interface AdversarialTurn {
  attackMessage: string;
  modelResponse: string;
  breach?: BreachInfo;
  status: "pending" | "running" | "done" | "error";
}

interface AdversarialScenario {
  scenarioId: string;
  scenarioName: string;
  turns: AdversarialTurn[];
  robustnessScore?: number;
  status: "pending" | "running" | "done" | "error";
}

interface AdversarialFlowProps {
  modelName: string;
  scenarios: AdversarialScenario[];
  currentScenarioIndex: number;
  onEnlarge?: () => void;
}

const CARD_WIDTH = 420;
const NODE_X = 80;
const BREACH_X = NODE_X + CARD_WIDTH + 88;
const BASE_CARD_HEIGHT = 96;
const LINE_HEIGHT = 24;
const CHARS_PER_LINE = 42;
const TURN_GAP = 74;

function estimateCardHeight(text: string) {
  const safeText = text?.trim() ?? "";
  const lines = Math.max(2, Math.ceil(safeText.length / CHARS_PER_LINE));
  return BASE_CARD_HEIGHT + lines * LINE_HEIGHT;
}

export default function AdversarialFlow({
  modelName,
  scenarios,
  currentScenarioIndex,
  onEnlarge,
}: AdversarialFlowProps) {
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
      y += 58;

      let prevNodeId = scenarioHeaderId;

      for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex++) {
        const turn = scenario.turns[turnIndex];
        const isActiveTurn = isActiveScenario && turn.status === "running";
        const hasBreach = turn.status === "done" && turn.breach !== undefined;
        const edgeColor = hasBreach ? "#ef4444" : isActiveTurn ? "#3b82f6" : "#27272a";

        const attackHeight = estimateCardHeight(turn.attackMessage);
        const responseHeight = estimateCardHeight(turn.modelResponse);
        const responseY = y + attackHeight + TURN_GAP;

        const attackerNodeId = `attacker-${scenarioIndex}-${turnIndex}`;
        nodes.push({
          id: attackerNodeId,
          type: "userMessage",
          position: { x: NODE_X, y },
          data: {
            message: turn.attackMessage,
            label: "Attacker",
            turnNumber: turnIndex,
          },
        });

        edges.push({
          id: `e-${prevNodeId}-${attackerNodeId}`,
          source: prevNodeId,
          target: attackerNodeId,
          animated: isActiveTurn,
          style: { stroke: edgeColor },
        });

        const defenderNodeId = `defender-${scenarioIndex}-${turnIndex}`;
        nodes.push({
          id: defenderNodeId,
          type: "modelResponse",
          position: { x: NODE_X, y: responseY },
          data: {
            modelName,
            response: turn.modelResponse,
            status:
              turn.status === "running"
                ? "running"
                : turn.status === "done"
                  ? "done"
                  : "pending",
          },
        });

        edges.push({
          id: `e-${attackerNodeId}-${defenderNodeId}`,
          source: attackerNodeId,
          target: defenderNodeId,
          animated: isActiveTurn,
          style: { stroke: edgeColor },
        });

        if (hasBreach && turn.breach) {
          const breachNodeId = `breach-${scenarioIndex}-${turnIndex}`;
          nodes.push({
            id: breachNodeId,
            type: "breachAlert",
            position: { x: BREACH_X, y: responseY + Math.max(12, responseHeight / 2 - 28) },
            data: {
              type: turn.breach.type,
              severity: turn.breach.severity,
              evidence: turn.breach.evidence,
              turn: turnIndex,
            },
          });

          edges.push({
            id: `e-${defenderNodeId}-${breachNodeId}`,
            source: defenderNodeId,
            target: breachNodeId,
            animated: true,
            style: { stroke: "#ef4444" },
          });
        }

        prevNodeId = defenderNodeId;
        y = responseY + responseHeight + 76;
      }

      if (scenario.status === "done" && scenario.robustnessScore !== undefined) {
        const scoreNodeId = `robustness-${scenarioIndex}`;
        nodes.push({
          id: scoreNodeId,
          type: "scoreNode",
          position: { x: NODE_X, y },
          data: { score: scenario.robustnessScore, label: "% robust" },
        });

        edges.push({
          id: `e-${prevNodeId}-${scoreNodeId}`,
          source: prevNodeId,
          target: scoreNodeId,
          style: {
            stroke:
              scenario.robustnessScore >= 80
                ? "#10b981"
                : scenario.robustnessScore >= 50
                  ? "#eab308"
                  : "#ef4444",
          },
        });

        y += 90;
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
        fitViewOptions={{ padding: 0.12, minZoom: 0.45, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 40, y: 20, zoom: 0.95 }}
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
        <Controls
          showInteractive={false}
          className="!border-[var(--border-primary)] !rounded-lg hover:[&>button]:!opacity-80 [&>button]:!border-[var(--border-primary)] [&>button]:!text-[var(--text-secondary)]"
          style={{
            backgroundColor: "var(--bg-card)"
          }}
        />
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
