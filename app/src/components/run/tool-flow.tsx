"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  BackgroundVariant,
  Controls,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Maximize2 } from "lucide-react";
import { nodeTypes } from "./flow-nodes";

interface ToolCallData {
  functionName: string;
  arguments: Record<string, unknown>;
}

interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  userMessage: string;
  status: "pending" | "running" | "done" | "error";
  overallScore: number;
  textResponse: string;
  actualToolCalls: ToolCallData[];
}

interface ToolFlowProps {
  modelName: string;
  scenarios: ScenarioResult[];
  currentScenarioIndex: number;
  onEnlarge?: () => void;
}

export default function ToolFlow({ modelName, scenarios, currentScenarioIndex, onEnlarge }: ToolFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 24;

    for (let si = 0; si < scenarios.length; si++) {
      const scenario = scenarios[si];
      if (scenario.status === "pending" && si > currentScenarioIndex + 1) continue;

      const baseY = y;
      const userNodeId = `user-${si}`;
      const modelNodeId = `model-${si}`;

      nodes.push({
        id: userNodeId,
        type: "userMessage",
        position: { x: 80, y: baseY },
        data: { message: scenario.userMessage || scenario.scenarioName, label: `Scenario ${si + 1}` },
      });

      nodes.push({
        id: modelNodeId,
        type: "modelResponse",
        position: { x: 520, y: baseY },
        data: {
          modelName,
          response: scenario.textResponse,
          score: scenario.status === "done" ? scenario.overallScore : undefined,
          status: scenario.status === "running" ? "running" : scenario.status === "done" ? "done" : "pending",
        },
      });

      edges.push({
        id: `e-user-model-${si}`,
        source: userNodeId,
        target: modelNodeId,
        animated: scenario.status === "running",
        style: { stroke: scenario.status === "running" ? "#3b82f6" : "var(--border-primary)" },
      });

      if (scenario.actualToolCalls.length > 0) {
        let toolX = 980;
        let prevId = modelNodeId;

        for (let ti = 0; ti < scenario.actualToolCalls.length; ti++) {
          const tc = scenario.actualToolCalls[ti];
          const toolNodeId = `tool-${si}-${ti}`;

          nodes.push({
            id: toolNodeId,
            type: "toolCall",
            position: { x: toolX, y: baseY + 12 },
            data: {
              functionName: tc.functionName,
              arguments: tc.arguments,
              correct: scenario.overallScore >= 60,
            },
          });

          edges.push({
            id: `e-${prevId}-${toolNodeId}`,
            source: prevId,
            target: toolNodeId,
            style: { stroke: "#3b82f6" },
          });

          prevId = toolNodeId;
          toolX += 300;
        }

        if (scenario.status === "done") {
          const scoreNodeId = `score-${si}`;
          nodes.push({
            id: scoreNodeId,
            type: "scoreNode",
            position: { x: toolX, y: baseY + 24 },
            data: { score: scenario.overallScore, label: "%" },
          });
          edges.push({
            id: `e-${prevId}-score-${si}`,
            source: prevId,
            target: scoreNodeId,
            style: { stroke: scenario.overallScore >= 60 ? "#10b981" : "#ef4444" },
          });
        }
      } else if (scenario.status === "done") {
        const scoreNodeId = `score-${si}`;
        nodes.push({
          id: scoreNodeId,
          type: "scoreNode",
          position: { x: 980, y: baseY + 24 },
          data: { score: scenario.overallScore, label: "%" },
        });
        edges.push({
          id: `e-model-score-${si}`,
          source: modelNodeId,
          target: scoreNodeId,
          style: { stroke: scenario.overallScore >= 60 ? "#10b981" : "#ef4444" },
        });
      }

      y += 180;
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
        fitViewOptions={{ padding: 0.14, minZoom: 0.25, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 40, y: 20, zoom: 0.75 }}
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
