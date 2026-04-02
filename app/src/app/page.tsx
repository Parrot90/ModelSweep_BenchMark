"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Play, Plus, Trophy, Zap, Clock, Cpu,
  AlertCircle, ChevronRight, TrendingUp, Info, RotateCw,
} from "lucide-react";
import Link from "next/link";
import { useModelsStore } from "@/store/models-store";
import { useConnectionStore } from "@/store/connection-store";
import { GlowCard } from "@/components/ui/glow-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBar } from "@/components/ui/score-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ModelRadarChart } from "@/components/charts/radar-chart";
import { getModelColor, detectModelFamily } from "@/lib/model-colors";
import { formatBytes, formatRelativeTime, cn } from "@/lib/utils";

type SuiteType = "standard" | "tool_calling" | "conversation" | "adversarial";

const SUITE_TYPE_BADGE: Record<SuiteType, { label: string; color: string; bg: string; border: string }> = {
  standard: { label: "Standard", color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
  tool_calling: { label: "Tools", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  conversation: { label: "Convo", color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  adversarial: { label: "Attack", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
};

interface RunSummary {
  id: string;
  suite_name: string;
  suite_type?: SuiteType;
  started_at: string;
  status: string;
  model_count: number;
}

interface ModelScore {
  modelName: string;
  overallScore: number;
  runId: string;
  runDate: string;
  categoryScores: { coding: number | null; creative: number | null; reasoning: number | null; instruction: number | null; speed: number | null };
  avgTokensPerSec: number;
  avgTTFT: number;
  family: string;
  eloRating?: number;
  eloConfidence?: number;
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info size={12} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-help" />
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded bg-[var(--tooltip-bg)] border border-[var(--tooltip-border)] text-[var(--text-secondary)] text-[10px] font-mono leading-relaxed whitespace-nowrap shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

export default function DashboardPage() {
  const { models, loading: modelsLoading } = useModelsStore();
  const { status: connStatus, ollamaVersion } = useConnectionStore();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [topModels, setTopModels] = useState<ModelScore[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [eloRatings, setEloRatings] = useState<Record<string, { rating: number; confidence: number }>>({});

  // Fetch Elo ratings
  useEffect(() => {
    fetch("/api/elo")
      .then((r) => r.json())
      .then((data) => {
        if (data.ratings) {
          const map: Record<string, { rating: number; confidence: number }> = {};
          for (const r of data.ratings) {
            map[r.modelName] = { rating: r.rating, confidence: r.confidence };
          }
          setEloRatings(map);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetch("/api/results")
      .then((r) => r.json())
      .then((data) => {
        if (data.runs) setRuns(data.runs);
      })
      .catch(() => { })
      .finally(() => setRunsLoading(false));
  }, []);

  useEffect(() => {
    if (runs.length === 0) return;
    Promise.all(
      runs.slice(0, 5).map((r) =>
        fetch(`/api/results/${r.id}`)
          .then((res) => res.json())
          .catch(() => ({ run: null }))
      )
    ).then((results) => {
      const scores: Record<string, ModelScore> = {};
      for (const { run } of results) {
        if (!run?.models) continue;
        for (const model of run.models) {
          if (!model.skipped && model.overall_score > 0) {
            const existing = scores[model.model_name];
            if (!existing || model.overall_score > existing.overallScore) {
              const cats = model.categoryScores || {};
              scores[model.model_name] = {
                modelName: model.model_name,
                overallScore: model.overall_score,
                runId: run.id,
                runDate: run.started_at,
                categoryScores: {
                  coding: cats.coding !== undefined ? cats.coding : null,
                  creative: cats.creative !== undefined ? cats.creative : null,
                  reasoning: cats.reasoning !== undefined ? cats.reasoning : null,
                  instruction: cats.instruction !== undefined ? cats.instruction : null,
                  speed: cats.speed !== undefined ? cats.speed : null,
                },
                avgTokensPerSec: model.avg_tokens_per_sec ?? 0,
                avgTTFT: model.avg_ttft ?? 0,
                family: model.family ?? detectModelFamily(model.model_name),
                eloRating: eloRatings[model.model_name]?.rating,
                eloConfidence: eloRatings[model.model_name]?.confidence,
              };
            }
          }
        }
      }
      const sorted = Object.values(scores)
        .sort((a, b) => b.overallScore - a.overallScore)
        .slice(0, 7);
      setTopModels(sorted);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, eloRatings]);


  const champion = topModels[0];
  const disconnected = connStatus === "disconnected";
  const connected = connStatus === "connected";
  const totalSize = models.reduce((a, m) => a + m.size, 0);
  const recentRuns = runs.slice(0, 5);
  const showFirstRun = !runsLoading && runs.length === 0 && models.length > 0;

  // Stats
  const avgBestScore = topModels.length > 0
    ? Math.round(topModels.reduce((a, m) => a + m.overallScore, 0) / topModels.length)
    : null;
  const fastestModel = topModels.length > 0
    ? topModels.reduce((best, m) => m.avgTokensPerSec > best.avgTokensPerSec ? m : best, topModels[0])
    : null;

  // Radar chart data: top 3 models
  const radarModels = topModels.slice(0, 3).map((m) => ({
    name: m.modelName,
    categoryScores: m.categoryScores as Record<string, number>,
  }));

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-8 space-y-12 pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex bg-[var(--accent-muted)] border border-[var(--accent-border)] rounded-full px-5 py-2 w-fit items-center gap-2.5 mb-6">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${connected ? "bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" :
            disconnected ? "bg-red-500" : "bg-yellow-500 animate-pulse"
            }`} />
          <span className="text-[var(--accent)] text-sm font-mono font-medium uppercase tracking-widest">
            {connected ? "System Active" : disconnected ? "System Offline" : "Connecting..."}
          </span>
        </div>
        <h1 className="text-5xl md:text-7xl font-sans font-bold tracking-tighter text-[var(--text-primary)] uppercase leading-none mb-4">
          ModelSweep
        </h1>
        <p className="text-[var(--text-muted)] font-mono text-sm uppercase tracking-widest">
          {models.length} Nodes · {models.length > 0 && `${formatBytes(totalSize)}`}
          {ollamaVersion && ` · Ollama ${ollamaVersion}`}
        </p>
      </motion.div>

      {/* Disconnected banner */}
      {disconnected && (
        <ErrorState message="Ollama is not running. Start Ollama and ModelPilot will reconnect automatically." />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-[var(--border-primary)] border border-[var(--border-primary)]">
        <div className="bg-[var(--bg-card)] p-10 flex flex-col justify-between min-h-[240px]">
          <div className="flex items-center justify-between mb-8">
            <span className="text-[var(--accent)] font-mono text-sm tracking-widest uppercase flex items-center gap-2">
              Runs
              <InfoTooltip text="Total evaluation runs completed across all test suites" />
            </span>
          </div>
          {runsLoading ? (
            <Skeleton className="h-16 w-24 bg-[var(--bg-surface)]" />
          ) : (
            <div>
              <p className="text-6xl md:text-7xl font-sans font-light tracking-tighter text-[var(--accent)] mb-2">{runs.length}</p>
              <h3 className="text-[var(--text-primary)] font-medium text-base mb-1">Execution Cycles</h3>
              <p className="text-[var(--text-muted)] text-sm">Total number of standardized prompt evaluations completed.</p>
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-card)] p-10 flex flex-col justify-between min-h-[240px]">
          <div className="flex items-center justify-between mb-8">
            <span className="text-[var(--accent)] font-mono text-sm tracking-widest uppercase flex items-center gap-2">
              Avg
              <InfoTooltip text="Mean best score across all models that have been evaluated" />
            </span>
          </div>
          {runsLoading ? (
            <Skeleton className="h-16 w-24 bg-[var(--bg-surface)]" />
          ) : (
            <div>
              <p className="text-6xl md:text-7xl font-sans font-light tracking-tighter text-[var(--accent)] mb-2">
                {avgBestScore !== null ? `${avgBestScore}%` : "--"}
              </p>
              <h3 className="text-[var(--text-primary)] font-medium text-base mb-1">Mean Performance</h3>
              <p className="text-[var(--text-muted)] text-sm">Average high score across all executed test suites to date.</p>
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-card)] p-10 flex flex-col justify-between min-h-[240px]">
          <div className="flex items-center justify-between mb-8">
            <span className="text-[var(--accent)] font-mono text-sm tracking-widest uppercase flex items-center gap-2">
              Speed
              <InfoTooltip text="Tokens per second of the fastest model measured during evaluation" />
            </span>
          </div>
          {runsLoading ? (
            <Skeleton className="h-16 w-24 bg-[var(--bg-surface)]" />
          ) : fastestModel ? (
            <div>
              <p className="text-6xl md:text-7xl font-sans font-light tracking-tighter text-[var(--accent)] mb-2">
                {fastestModel.avgTokensPerSec.toFixed(0)}<span className="text-4xl text-[var(--accent)]/80">t/s</span>
              </p>
              <h3 className="text-[var(--text-primary)] font-medium text-base mb-1 truncate">{fastestModel.modelName}</h3>
              <p className="text-[var(--text-muted)] text-sm truncate">Current highest throughput model recorded.</p>
            </div>
          ) : (
            <div>
              <p className="text-6xl md:text-7xl font-sans font-light tracking-tighter text-[var(--accent)] mb-2">--</p>
              <h3 className="text-[var(--text-primary)] font-medium text-base mb-1 truncate">N/A</h3>
              <p className="text-[var(--text-muted)] text-sm truncate">Run tests to calculate speed.</p>
            </div>
          )}
        </div>
      </div>

      {/* First-Run Onboarding */}
      {showFirstRun && (
        <GlowCard className="p-12 border-zinc-800 bg-[#020202]" delay={0.1}>
          <div className="max-w-lg mx-auto text-center">
            <div className="text-[var(--accent)] mb-6 flex justify-center drop-shadow-[0_0_40px_var(--accent-glow)]">
              <Trophy size={48} />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-3 uppercase">Initialize Telemetry</h2>
            <p className="text-[var(--text-secondary)] mb-10">
              {models.length} model{models.length !== 1 ? "s" : ""} online. Awaiting automated evaluation protocols to establish baseline metrics.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/suite" className="w-full sm:w-auto">
                <Button className="w-full bg-[var(--accent)] text-black hover:bg-[var(--accent)]/90 rounded-none px-8 py-6 font-mono uppercase tracking-widest text-xs font-bold transition-all shadow-[0_0_40px_var(--accent-glow)]">
                  <Play size={14} className="mr-2" />
                  Initiate Suite
                </Button>
              </Link>
              <Link href="/playground" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full border-zinc-700 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#00FF66] hover:bg-[var(--accent)]/10 rounded-none px-8 py-6 font-mono uppercase tracking-widest text-xs transition-all">
                  <Zap size={14} className="mr-2" />
                  Manual Override
                </Button>
              </Link>
            </div>
          </div>
        </GlowCard>
      )}

      {/* Champion + Radar row */}
      {!showFirstRun && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[1px] bg-[var(--border-primary)] border border-[var(--border-primary)]">
          {/* Champion card */}
          <div className="lg:col-span-2 p-10 bg-[var(--bg-card)] flex flex-col justify-between">
            <div className="flex items-start justify-between mb-10">
              <div className="flex items-center gap-2.5 text-[var(--accent)] text-sm font-mono tracking-widest uppercase">
                <Trophy size={16} />
                <span>Top Performer</span>
                <InfoTooltip text="The model with the highest overall score across all evaluation runs" />
              </div>
              {champion && (
                <Link
                  href={`/results/${champion.runId}`}
                  className="text-sm font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1.5 transition-colors"
                >
                  View full results <ChevronRight size={14} />
                </Link>
              )}
            </div>

            {champion ? (
              <div className="flex-1 flex flex-col justify-end">
                <div className="flex flex-col md:flex-row gap-10 items-start md:items-end justify-between mb-10">
                  <div>
                    <h2 className="text-5xl md:text-6xl font-sans font-bold text-[var(--text-primary)] tracking-tighter uppercase mb-3">
                      {champion.modelName}
                    </h2>
                    <div className="flex gap-5 font-mono text-base text-[var(--text-muted)]">
                      <span>{champion.avgTokensPerSec.toFixed(1)} t/s</span>
                      <span>{champion.avgTTFT.toFixed(0)}ms TTFT</span>
                      <span>Rank #01</span>
                    </div>
                  </div>
                  <div className="flex items-baseline text-right shrink-0">
                    <span className="text-8xl md:text-9xl font-sans font-light tracking-tighter text-[var(--accent)]">
                      {champion.overallScore}
                    </span>
                    <span className="text-4xl text-[var(--accent)]/50 ml-1">%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {champion.categoryScores.coding !== null && <ScoreBar score={champion.categoryScores.coding} label="Coding" color="#00FF66" />}
                  {champion.categoryScores.creative !== null && <ScoreBar score={champion.categoryScores.creative} label="Creative" color="#00FF66" />}
                  {champion.categoryScores.reasoning !== null && <ScoreBar score={champion.categoryScores.reasoning} label="Logic" color="#00FF66" />}
                  {champion.categoryScores.instruction !== null && <ScoreBar score={champion.categoryScores.instruction} label="Instruct" color="#00FF66" />}
                  {champion.categoryScores.speed !== null && <ScoreBar score={champion.categoryScores.speed} label="Speed" color="#00FF66" />}
                </div>
                {champion.eloRating && (
                  <div className="mt-5 flex items-center gap-2.5">
                    <span className="text-[var(--text-muted)] font-mono text-xs uppercase tracking-widest">Elo</span>
                    <span className="text-[var(--accent)] font-mono text-base tabular-nums">{Math.round(champion.eloRating)}</span>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<Trophy size={36} className="text-[var(--text-primary)]" />}
                title="No Top Performer Yet"
                description="Execute an evaluation suite to benchmark the installed models."
                action={
                  <Link href="/suite">
                    <Button className="bg-[var(--accent)] text-black hover:bg-[var(--accent)]/80 rounded-none font-mono uppercase text-sm tracking-widest px-8 py-5 shadow-[0_0_40px_var(--accent-glow)]">
                      <Play size={15} className="mr-2" />
                      Initiate Run
                    </Button>
                  </Link>
                }
              />
            )}
          </div>

          {/* Radar Chart */}
          <div className="p-10 bg-[var(--bg-card)] flex flex-col justify-between">
            <h3 className="text-[var(--accent)] font-mono text-sm tracking-widest uppercase mb-8 flex justify-between items-center">
              <span>Performance Radar</span>
            </h3>
            <div className="flex-1 flex items-center justify-center">
              {radarModels.length > 0 ? (
                <ModelRadarChart models={radarModels} height={300} showLegend />
              ) : (
                <div className="flex items-center justify-center h-[300px] text-[var(--text-muted)] font-mono text-sm uppercase tracking-widest">
                  Awaiting Data
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard + Quick Actions + Recent Activity */}
      {!showFirstRun && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-[1px] bg-[var(--border-primary)] border border-[var(--border-primary)]">
          {/* Leaderboard */}
          <div className="p-10 bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2.5 text-[var(--accent)] text-sm font-mono tracking-widest uppercase">
                <TrendingUp size={16} />
                <span>Rankings</span>
                <InfoTooltip text="Leaderboard of models ranked by their best evaluation scores" />
              </div>
            </div>

            {topModels.length === 0 ? (
              <div className="py-12 text-center text-[var(--text-muted)] font-mono text-sm uppercase tracking-widest">
                Benchmarking Required
              </div>
            ) : (
              <div className="space-y-[1px] bg-[var(--border-primary)] border-y border-[var(--border-primary)]">
                <div className="flex items-center gap-5 px-5 py-3.5 bg-[var(--bg-card-alt)] text-[var(--text-muted)] font-mono text-xs uppercase tracking-widest">
                  <span className="w-10 shrink-0">Rank</span>
                  <span className="flex-1">Model ID</span>
                  <span className="w-20 shrink-0 hidden lg:block text-center">Elo</span>
                  <span className="w-28 shrink-0 hidden sm:block">Score</span>
                  <span className="w-24 shrink-0 text-right hidden md:block">Speed</span>
                </div>
                {topModels.map((model, i) => {
                  return (
                    <Link key={model.modelName} href={`/results/${model.runId}`} className="block">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.05 * i }}
                        className="flex items-center gap-5 px-5 py-5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-colors group"
                      >
                        <span className={`w-10 text-2xl font-sans font-light tracking-tighter shrink-0 ${i === 0 ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 text-[var(--text-secondary)] text-base font-medium truncate min-w-0 group-hover:text-[var(--text-primary)] transition-colors">
                          {model.modelName}
                        </span>
                        <span className="w-20 text-center font-mono text-sm tabular-nums shrink-0 hidden lg:block" style={{ color: model.eloRating ? '#a1a1aa' : '#3f3f46' }}>
                          {model.eloRating ? Math.round(model.eloRating) : '—'}
                        </span>
                        <div className="w-28 flex items-center gap-3 shrink-0 hidden sm:flex">
                          <span className="text-[var(--accent)] font-mono text-base tabular-nums">{model.overallScore}%</span>
                        </div>
                        <span className="text-sm font-mono tabular-nums text-[var(--text-muted)] w-24 text-right hidden md:block">
                          {model.avgTokensPerSec.toFixed(1)} t/s
                        </span>
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column: Quick Actions + Recent Activity */}
          <div className="flex flex-col gap-[1px] lg:sticky lg:top-0 lg:self-start">
            {/* Quick Actions */}
            <div className="p-8 bg-[var(--bg-card)] flex-1">
              <h3 className="text-[var(--accent)] font-mono text-sm tracking-widest uppercase mb-7 flex items-center gap-2.5">
                Operations
                <InfoTooltip text="Quick actions to run suites, create new tests, or manually test models" />
              </h3>
              <div className="space-y-4">
                <Link href="/suite" className="block">
                  <button className="w-full flex items-center justify-between px-7 py-5 bg-[var(--bg-hover)] border border-[var(--accent-border)] text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]">
                    <span className="font-mono text-sm uppercase tracking-widest font-bold">Run Full Suite</span>
                    <Play size={16} />
                  </button>
                </Link>
                <Link href="/suite" className="block">
                  <button className="w-full flex items-center justify-between px-7 py-5 bg-[var(--bg-surface)] border border-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]">
                    <span className="font-mono text-sm uppercase tracking-widest">New Protocol</span>
                    <Plus size={16} />
                  </button>
                </Link>
                <Link href="/playground" className="block">
                  <button className="w-full flex items-center justify-between px-7 py-5 bg-[var(--bg-surface)] border border-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]">
                    <span className="font-mono text-sm uppercase tracking-widest">Manual Testing</span>
                    <Zap size={16} />
                  </button>
                </Link>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="p-8 bg-[var(--bg-card)] flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-7">
                <h3 className="text-[var(--accent)] font-mono text-sm tracking-widest uppercase flex items-center gap-2.5">
                  <Clock size={16} />
                  Syslogs
                  <InfoTooltip text="Recent evaluation runs with status and timing information" />
                </h3>
                <Link href="/results" className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  [ View All ]
                </Link>
              </div>

              {runsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full bg-[var(--bg-surface)]" />
                  ))}
                </div>
              ) : recentRuns.length === 0 ? (
                <div className="py-6 text-center text-[var(--text-muted)] font-mono text-sm uppercase tracking-widest">
                  No execution logs
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRuns.map((run, i) => (
                    <Link key={run.id} href={`/results/${run.id}`} className="block">
                      <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i }}
                        className="flex items-start gap-4 p-5 border border-[var(--border-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-surface)]/50 transition-colors group"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${run.status === "completed" ? "bg-[var(--accent)]" :
                          run.status === "running" ? "bg-amber-500 animate-pulse" : "bg-zinc-600"
                          }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[var(--text-secondary)] font-mono text-sm tracking-wide truncate group-hover:text-[var(--text-primary)] transition-colors">{run.suite_name}</p>
                            {(() => {
                              const st = (run.suite_type || "standard") as SuiteType;
                              const badge = SUITE_TYPE_BADGE[st];
                              return (
                                <span className={cn(
                                  "text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border flex-shrink-0",
                                  badge.color, badge.bg, badge.border
                                )}>
                                  {badge.label}
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-[var(--text-muted)] text-xs font-mono mt-1.5 uppercase tracking-wider">
                            {run.model_count} nodes · {formatRelativeTime(run.started_at)}
                          </p>
                        </div>
                        <Link
                          href="/suite"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-2 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 border border-transparent hover:border-[var(--accent-border)]"
                          title="Re-run suite"
                        >
                          <RotateCw size={14} />
                        </Link>
                      </motion.div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Installed Models Grid */}
      {!modelsLoading && models.length > 0 && (
        <div className="p-10 bg-[var(--bg-card)]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[var(--accent)] font-mono text-sm tracking-widest uppercase flex items-center gap-2.5">
              <Cpu size={16} />
              Model Inventory
              <InfoTooltip text="All Ollama models installed on this machine with size and quantization details" />
            </h3>
            <Link href="/models" className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
              [ View Directory ]
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-[1px] bg-[var(--border-primary)] border border-[var(--border-primary)]">
            {models.slice(0, 24).map((model) => {
              const color = getModelColor(model.name);
              return (
                <Link key={model.name} href={`/models/${encodeURIComponent(model.name)}`}>
                  <div className="bg-[var(--bg-card-alt)] p-5 hover:bg-[var(--bg-hover)] transition-colors h-full flex flex-col justify-center">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: color.hex, boxShadow: `0 0 8px ${color.hex}80` }}
                      />
                      <span className="text-[var(--text-secondary)] font-mono text-xs uppercase tracking-wider truncate group-hover:text-[var(--text-primary)] transition-colors">{model.name}</span>
                    </div>
                    <p className="text-[10px] font-mono text-[var(--text-muted)] pl-4.5 uppercase tracking-widest">
                      {model.details?.parameter_size || ""}
                      {model.details?.quantization_level ? ` · ${model.details.quantization_level}` : ""}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
          {models.length > 24 && (
            <div className="mt-6 text-center">
              <Link href="/models" className="text-xs font-mono uppercase tracking-widest text-[var(--accent)] px-5 py-2.5 border border-[var(--accent-border)] bg-[var(--accent)]/5 hover:bg-[var(--accent)]/10 transition-colors inline-block">
                View {models.length - 24} Additional Models
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Ollama not detected */}
      {disconnected && models.length === 0 && (
        <GlowCard className="p-6" delay={0.1}>
          <div className="flex items-start gap-4">
            <AlertCircle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[var(--text-primary)] font-medium mb-1">Ollama not detected</h3>
              <p className="text-[var(--text-muted)] text-sm mb-3">
                ModelPilot requires Ollama running on your machine. Install it, then run{" "}
                <code className="text-[var(--text-secondary)] bg-[var(--skeleton-bg)] px-1.5 py-0.5 rounded text-xs">ollama serve</code>.
              </p>
              <Link href="/settings">
                <Button variant="secondary" size="sm">Configure Ollama URL</Button>
              </Link>
            </div>
          </div>
        </GlowCard>
      )}
    </div>
  );
}
