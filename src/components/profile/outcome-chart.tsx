"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { OutcomeBreakdown } from "@/lib/profile/stats";

const COLORS = [
  "oklch(0.796 0.133 86.3)",  // gold — exact
  "oklch(0.65 0.15 145)",     // green — correct only
  "oklch(0.55 0.18 25)",      // red — wrong
];

const LABELS = ["Exact (3 pts)", "Correct (1 pt)", "Wrong (0 pts)"];

interface Props {
  data: OutcomeBreakdown;
}

export function OutcomeChart({ data }: Props) {
  const total = data.exact + data.correctOnly + data.wrong;

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
        Outcome breakdown appears once picks are graded.
      </div>
    );
  }

  const chartData = [
    { name: LABELS[0], value: data.exact },
    { name: LABELS[1], value: data.correctOnly },
    { name: LABELS[2], value: data.wrong },
  ].filter((d) => d.value > 0);

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius="45%"
            outerRadius="70%"
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, idx) => {
              const colorIdx = LABELS.indexOf(entry.name);
              return (
                <Cell
                  key={entry.name}
                  fill={COLORS[colorIdx >= 0 ? colorIdx : idx]}
                />
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
            formatter={(value) => (
              <span style={{ color: "oklch(0.708 0.004 286)", fontSize: 11 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
