"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { PensBreakdown } from "@/lib/profile/stats";

const COLORS = [
  "oklch(0.65 0.15 145)", // green — correct
  "oklch(0.55 0.18 25)",  // red — wrong
];
const LABELS = ["Correct winner (+1)", "Wrong"];

export function PensChart({ data }: { data: PensBreakdown }) {
  const total = data.correct + data.wrong;

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/60 px-4 text-center text-sm text-muted-foreground">
        Penalty-pick accuracy appears once a knockout match you picked goes to pens.
      </div>
    );
  }

  const chartData = [
    { name: LABELS[0], value: data.correct },
    { name: LABELS[1], value: data.wrong },
  ].filter((d) => d.value > 0);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius="48%"
            outerRadius="78%"
            paddingAngle={3}
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            {chartData.map((entry, idx) => {
              const colorIdx = LABELS.indexOf(entry.name);
              return (
                <Cell key={entry.name} fill={COLORS[colorIdx >= 0 ? colorIdx : idx]} />
              );
            })}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "oklch(0.2 0 0)",
              border: "1px solid oklch(1 0 0 / 0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "oklch(0.985 0 0)" }}
            formatter={(v) => [`${v} picks`, ""]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            height={28}
            formatter={(value) => (
              <span style={{ color: "oklch(0.708 0.004 286)", fontSize: 11 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
