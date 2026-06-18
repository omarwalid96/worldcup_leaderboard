"use client";

import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ParticipationPoint } from "@/lib/profile/stats";

interface Props {
  data: ParticipationPoint[];
}

export function ParticipationChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
        Participation chart appears once matches kick off.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: `MD${d.matchday}`,
    predicted: d.predicted,
    missed: d.missed,
  }));

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
          barCategoryGap="30%"
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "oklch(0.708 0.004 286)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "oklch(0.708 0.004 286)" }}
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
            contentStyle={{
              background: "oklch(0.2 0 0)",
              border: "1px solid oklch(1 0 0 / 0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "oklch(0.985 0 0)" }}
            formatter={(v, name) => [
              `${v} match${Number(v) !== 1 ? "es" : ""}`,
              name === "predicted" ? "Predicted" : "Missed",
            ]}
          />
          <Bar
            dataKey="predicted"
            stackId="a"
            fill="oklch(0.65 0.15 145)"
            radius={[0, 0, 0, 0]}
            maxBarSize={56}
            isAnimationActive={false}
          />
          <Bar
            dataKey="missed"
            stackId="a"
            fill="oklch(0.35 0.02 286)"
            radius={[3, 3, 0, 0]}
            maxBarSize={56}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
