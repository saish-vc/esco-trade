/* eslint-disable @typescript-eslint/no-explicit-any */import { Worker, Queue, type Job } from "bullmq";import { getRedisClient } from "../db/redis";import { getPrismaClient } from "../db/client";import { Decimal } from "decimal.js";


interface AlertJobData {
  alertId: string;
  instrumentId: string;
  timeframe: string;
  session: string;
  userId: string;
}


interface AlertResult {
  triggered: boolean;
  alertId: string;
  triggeredAt?: number;
  error?: string;
}


const alertQueue = new Queue("alerts", {
  connection: getRedisClient(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});


function calculateIndicatorValue(
  candles: { close: number; high: number; low: number; volume: number }[],
  indicatorType: string,
  params: { period?: number; fastPeriod?: number; slowPeriod?: number; signalPeriod?: number }
): number | undefined {
  if (candles.length < 2) return undefined;

  if (indicatorType === "sma" && params.period) {
    const period = params.period;
    if (candles.length < period) return undefined;
    const sum = candles.slice(-period).reduce((acc, c) => acc + c.close, 0);
    return sum / period;
  }

  if (indicatorType === "rsi" && params.period) {
    const period = params.period;
    if (candles.length < period + 1) return undefined;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length - 1; i++) {
      const ci = candles[i]!;
      const c = candles[i + 1]!;
      const diff = c.close - ci.close;
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  if (indicatorType === "macd") {
    const fastPeriod = params.fastPeriod ?? 12;
    const slowPeriod = params.slowPeriod ?? 26;
    const signalPeriod = params.signalPeriod ?? 9;

    if (candles.length < slowPeriod + signalPeriod) return undefined;

    const ema = (data: number[], period: number): number | undefined => {
      if (data.length < period) return undefined;
      const k = 2 / (period + 1);
      let result = data[0]!;
      for (let i = 1; i < data.length; i++) {
        result = data[i]! * k + result * (1 - k);
      }
      return result;
    };

    const closes = candles.map((c: any) => c.close);
    const fastEMA = ema(closes.slice(-fastPeriod), fastPeriod) as number;
    const slowEMA = ema(closes.slice(-slowPeriod), slowPeriod) as number;

    const macd = fastEMA - slowEMA;

    const macdValues: number[] = [];
    for (let i = slowPeriod; i < closes.length; i++) {
      const fast = ema(closes.slice(i - fastPeriod, i + 1), fastPeriod) as number;
      const slow = ema(closes.slice(i - slowPeriod, i + 1), slowPeriod) as number;
      macdValues.push(fast - slow);
    }

    const signalResult = ema(macdValues.slice(-signalPeriod), signalPeriod) as number;
    const signal = signalResult ?? 0;

    return macd - signal;
  }

  return undefined;
}


async function processAlert(job: Job<AlertJobData, AlertResult>): Promise<AlertResult> {
  const { alertId, instrumentId, timeframe, session, userId } = job.data;

  const prisma = getPrismaClient();

  try {
    // Get alert configuration
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { conditions: true },
    });

    if (!alert) {
      return { triggered: false, alertId, error: "Alert not found" };
    }

    // Get recent candles
    const candles = await prisma.historicalCandle.findMany({
      where: {
        instrumentId,
        timeframe,
        session,
      },
      orderBy: { timestamp: "desc" },
      take: 200,
    });
    if (!candles || candles.length === 0) return { triggered: false, alertId, error: "No candle data available" };

    if (candles.length === 0) {
      return { triggered: false, alertId, error: "No candle data available" };
    }

    // Evaluate conditions
    const conditions = alert.conditions;
    let triggered = false;

    for (const condition of conditions) {
      // @ts-ignore - type narrowing for calculateIndicatorValue
      const value = calculateIndicatorValue(
        candles.map((c: any) => ({ close: Number(c.close), high: Number(c.high), low: Number(c.low), volume: Number(c.volume) })),
        condition.indicatorType,
        // @ts-ignore
        { period: condition.period, fastPeriod: condition.fastPeriod, slowPeriod: condition.slowPeriod, signalPeriod: condition.signalPeriod }
      );

      if (value === undefined) continue;

      const valueNum = value;

      if (condition.type === "crosses_above") {
        // Check if value crossed above threshold
        const prevCandles = candles.slice(0, -1);
        // @ts-ignore - type narrowing for calculateIndicatorValue
        const prevValue = calculateIndicatorValue(
          prevCandles.map((c: any) => ({ close: Number(c.close), high: Number(c.high), low: Number(c.low), volume: Number(c.volume) })),
          condition.indicatorType,
          // @ts-ignore
          { period: condition.period, fastPeriod: condition.fastPeriod, slowPeriod: condition.slowPeriod, signalPeriod: condition.signalPeriod }
        );

        if (prevValue !== undefined && prevValue <= Number(condition.threshold ?? 0) && valueNum > Number(condition.threshold ?? 0)) {
          triggered = true;
          break;
        }
      } else if (condition.type === "crosses_below") {
        // Check if value crossed below threshold
        const prevCandles = candles.slice(0, -1);
        // @ts-ignore - type narrowing for calculateIndicatorValue
        const prevValue = calculateIndicatorValue(
          prevCandles.map((c: any) => ({ close: Number(c.close), high: Number(c.high), low: Number(c.low), volume: Number(c.volume) })),
          // @ts-ignore
          condition.indicatorType,
          // @ts-ignore
          { period: condition.period, fastPeriod: condition.fastPeriod, slowPeriod: condition.slowPeriod, signalPeriod: condition.signalPeriod }
        );

        if (prevValue !== undefined && prevValue >= Number(condition.threshold ?? 0) && valueNum < Number(condition.threshold ?? 0)) {
          triggered = true;
          break;
        }
      } else if (condition.type === "enters_range") {
        // @ts-ignore - type narrowing for minThreshold/maxThreshold comparison
        if (valueNum >= (condition.minThreshold ?? condition.threshold ?? 0) && valueNum <= (condition.maxThreshold ?? condition.threshold ?? 0)) {
          triggered = true;
          break;
        }
      }
    }

    if (triggered) {
      // Check cooldown
      const lastTriggered = await prisma.alertEvent.findFirst({
        where: { alertId, status: "triggered" },
        orderBy: { triggeredAt: "desc" },
      });

      if (lastTriggered) {
        const cooldownMs = (alert.cooldownSeconds ?? 0) * 1000;
        const timeSinceLast = Date.now() - lastTriggered.triggeredAt!.getTime();

        if (timeSinceLast < cooldownMs) {
          return { triggered: false, alertId, error: "Cooldown active" };
        }
      }

      // Create alert event
      await prisma.alertEvent.create({
        data: {
          alertId,
          triggeredAt: new Date(),
          price: Number((candles[0]?.close ?? 0).toFixed(2)),
          status: alert.repeatable ? "triggered" : "triggered",
        },
      });

      // Update alert state
      await prisma.alert.update({
        where: { id: alertId },
        data: {
          state: alert.repeatable ? "enabled" : "expired",
          lastTriggeredAt: new Date(),
        },
      });

      return { triggered: true, alertId, triggeredAt: Date.now() };
    }

    return { triggered: false, alertId };
  } catch (error: any) {
    console.error("Alert processing error:", error);
    return { triggered: false, alertId, error: String(error) };
  }
}


export function startAlertWorker(): Worker<AlertJobData> {
  const worker = new Worker<AlertJobData>(
    "alerts",
    processAlert,
    {
      connection: getRedisClient(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`Alert job ${job?.id} failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`Alert job ${job.id} completed successfully`);
  });

  return worker;
}

export { alertQueue };