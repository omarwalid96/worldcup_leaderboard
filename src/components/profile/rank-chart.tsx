"use client";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RankPoint } from "@/lib/profile/stats";

interface Props {
  data: RankPoint[];
}

export function RankChart({ data }: Props) {
  if (data.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
        Rank history appears after two or more graded matchdays.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: `MD${d.matchday}`,
    rank: d.rank,
  }));

  // Compute domain: worst rank at bottom of chart, rank 1 at top.
  const maxRank = Math.max(...data.map((d) => d.rank));
  const domainMax = maxRank + 1;

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
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
            // Invert: rank 1 at the top (domain reversed — highest number at min).
            domain={[1, domainMax]}
            reversed
            tickFormatter={(v) => `#${v}`}
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
            formatter={(v) => [`#${v}`, "Rank"]}
          />
          <Line
            type="monotone"
            dataKey="rank"
            stroke="oklch(0.796 0.133 86.3)"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: "oklch(0.796 0.133 86.3)" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
