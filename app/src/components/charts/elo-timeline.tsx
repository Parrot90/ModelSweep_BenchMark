"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { getModelColor } from "@/lib/model-colors";
import { useThemeStore } from "@/store/theme-store";

interface EloTimelineProps {
    /** Each entry = a run snapshot: { date, ratings: { modelName: rating } } */
    snapshots: Array<{
        date: string;
        ratings: Record<string, number>;
    }>;
    models: string[];
    height?: number;
}

export function EloTimeline({ snapshots, models, height = 300 }: EloTimelineProps) {
    const { theme } = useThemeStore();
    const accent = theme === "dark" ? "#00FF66" : "#059033";
    const textMuted = theme === "dark" ? "#52525b" : "#a1a1aa";
    const tooltipBg = theme === "dark" ? "#050505" : "#ffffff";
    const tooltipText = theme === "dark" ? "#fff" : "#18181b";
    const tooltipBorder = theme === "dark" ? "rgba(0,255,102,0.2)" : "rgba(5,144,51,0.2)";
    const gridStroke = theme === "dark" ? "rgba(0,255,102,0.06)" : "rgba(5,144,51,0.08)";

    if (snapshots.length === 0) {
        return (
            <div className="flex items-center justify-center text-[var(--text-muted)] font-mono text-xs uppercase tracking-widest" style={{ height }}>
                No Elo Data — Run a multi-model test to generate rankings
            </div>
        );
    }

    // Transform data for recharts
    const data = snapshots.map((s) => {
        const point: Record<string, string | number> = {
            date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        };
        for (const name of models) {
            point[name] = Math.round(s.ratings[name] ?? 1500);
        }
        return point;
    });

    // Compute y-axis domain
    const allRatings = snapshots.flatMap((s) => models.map((m) => s.ratings[m] ?? 1500));
    const minRating = Math.floor((Math.min(...allRatings) - 50) / 50) * 50;
    const maxRating = Math.ceil((Math.max(...allRatings) + 50) / 50) * 50;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid vertical={false} stroke={gridStroke} />
                <XAxis
                    dataKey="date"
                    tick={{ fill: textMuted, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    domain={[minRating, maxRating]}
                    tick={{ fill: textMuted, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                />
                <Tooltip
                    contentStyle={{
                        background: tooltipBg,
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: 0,
                        fontSize: 10,
                        fontFamily: "monospace",
                        textTransform: "uppercase" as const,
                        color: tooltipText,
                    }}
                />
                {/* Reference line at 1500 */}
                <Line
                    dataKey={() => 1500}
                    stroke={accent}
                    strokeOpacity={0.15}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                    name="Baseline"
                />
                {models.map((name, i) => {
                    const color = i === 0 ? accent : getModelColor(name).hex;
                    return (
                        <Line
                            key={name}
                            dataKey={name}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ fill: color, r: 3, strokeWidth: 0 }}
                            isAnimationActive
                            animationDuration={800}
                        />
                    );
                })}
            </LineChart>
        </ResponsiveContainer>
    );
}
