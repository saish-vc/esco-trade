"use client";

import type { GatewayStatusEvent } from "@esco-trade/shared";

interface Props {
  status: GatewayStatusEvent | null;
  dataClassification: "live" | "delayed" | "simulated" | "stale" | "missing";
  lastUpdateTime?: number | null;
}

export function MarketDataStatus({ status, dataClassification, lastUpdateTime }: Props) {
  const getBadgeStyle = (classification: string) => {
    switch (classification) {
      case "live":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse";
      case "simulated":
        return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "delayed":
        return "bg-blue-500/20 text-blue-300 border-blue-500/40";
      case "stale":
        return "bg-rose-500/20 text-rose-400 border-rose-500/40";
      case "missing":
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/40";
    }
  };

  const providerLabel = status?.provider?.toUpperCase() ?? "DEMO";
  const statusLabel = status?.status?.toUpperCase() ?? "CONNECTED";
  const activeSubs = status?.activeSubscriptions ?? 0;
  const maxSymbols = status?.maxSymbols ?? 50;

  const formattedTime = lastUpdateTime
    ? new Date(lastUpdateTime).toLocaleTimeString()
    : "None";

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs font-mono">
      {/* Classification badge */}
      <div className={`px-2 py-0.5 rounded border uppercase font-bold tracking-wide ${getBadgeStyle(dataClassification)}`}>
        {dataClassification}
      </div>

      {/* Provider & state */}
      <div className="flex items-center gap-1.5 text-slate-300">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-slate-400">Feed:</span>
        <span className="font-semibold text-slate-200">{providerLabel}</span>
      </div>

      {/* Subscriptions capacity indicator */}
      <div className="text-slate-400">
        <span>Capacity:</span>{" "}
        <span className={activeSubs >= maxSymbols ? "text-amber-400 font-bold" : "text-slate-200"}>
          {activeSubs}/{maxSymbols} symbols
        </span>
      </div>

      {/* Last update */}
      <div className="text-slate-400">
        <span>Updated:</span> <span className="text-slate-200">{formattedTime}</span>
      </div>

      {/* Public redistribution warning */}
      {status?.provider !== "demo" && (
        <span className="text-[10px] text-amber-400/80 italic">
          (Personal/Dev Plan • Display only)
        </span>
      )}
    </div>
  );
}
