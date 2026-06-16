"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PointsPoint } from "@/lib/profile/stats";

/** Gold area chart of cumulative points by matchday. */
export function PointsChart({ data }: { data: PointsPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
        Your progress chart appears once matches are graded.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: `MD${d.matchday}`,
    points: d.cumulativePoints,
  }));

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.796 0.133 86.3)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="oklch(0.796 0.133 86.3)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            cursor={{ stroke: "oklch(0.796 0.133 86.3)", strokeOpacity: 0.3 }}
            contentStyle={{
              background: "oklch(0.2 0 0)",
              border: "1px solid oklch(1 0 0 / 0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "oklch(0.985 0 0)" }}
            formatter={(v) => [`${v} pts`, "Total"]}
          />
          <Area
            type="monotone"
            dataKey="points"
            stroke="oklch(0.796 0.133 86.3)"
            strokeWidth={2.5}
            fill="url(#goldFill)"
            dot={{ r: 2.5, fill: "oklch(0.796 0.133 86.3)" }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
