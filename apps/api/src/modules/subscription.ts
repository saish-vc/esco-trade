import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";

export interface Subscription {
  id: string;
  instrumentId: string;
  timeframe: string;
  session: string;
  adjustment: string;
  connections: Map<string, number>; // userId -> ref count
  lastUpdate: number;
}

export class SubscriptionManager {
  private subscriptions: Map<string, Subscription> = new Map();
  private redis: Redis;
  private prisma: PrismaClient;
  private readonly MAX_SUBSCRIPTIONS_PER_CLIENT = 20;
  private readonly REFRESH_INTERVAL_MS = 1000;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  createSubscription(
    id: string,
    instrumentId: string,
    timeframe: string,
    session: string,
    adjustment: string
  ): Subscription {
    const sub: Subscription = {
      id,
      instrumentId,
      timeframe,
      session,
      adjustment,
      connections: new Map(),
      lastUpdate: Date.now(),
    };
    this.subscriptions.set(id, sub);
    return sub;
  }

  getSubscription(id: string): Subscription | undefined {
    return this.subscriptions.get(id);
  }

  addConnection(sub: Subscription, userId: string): void {
    const current = sub.connections.get(userId) ?? 0;
    sub.connections.set(userId, current + 1);
    sub.lastUpdate = Date.now();
  }

  removeConnection(sub: Subscription, userId: string): void {
    const current = sub.connections.get(userId) ?? 0;
    const newCount = Math.max(0, current - 1);
    if (newCount === 0) {
      sub.connections.delete(userId);
    } else {
      sub.connections.set(userId, newCount);
    }
    sub.lastUpdate = Date.now();
  }

  getRefCount(subId: string): number {
    const sub = this.subscriptions.get(subId);
    if (!sub) return 0;
    let count = 0;
    for (const refCount of sub.connections.values()) {
      count += refCount;
    }
    return count;
  }

  destroySubscription(subId: string): void {
    this.subscriptions.delete(subId);
  }

  getSubscriptionsForUser(userId: string): Subscription[] {
    const result: Subscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.connections.has(userId)) {
        result.push(sub);
      }
    }
    return result;
  }

  // Returns subscriptions that have been idle for too long (for cleanup)
  getIdleSubscriptions(idleThresholdMs: number): Subscription[] {
    const threshold = Date.now() - idleThresholdMs;
    const result: Subscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.lastUpdate < threshold && sub.connections.size === 0) {
        result.push(sub);
      }
    }
    return result;
  }

  // Broadcast a message to all connections subscribed to a subscription
  broadcast(subscriptionId: string, message: unknown): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;

    for (const [userId, refCount] of sub.connections) {
      // In a real implementation, we'd need access to the WebSocket connections
      // For now, this is a placeholder - actual broadcasting happens via Redis pub/sub
    }
  }

  // Deduplicate subscriptions by instrument+timeframe+session+adjustment
  mergeDuplicateSubscriptions(): void {
    const seen = new Map<string, Subscription>();
    
    for (const [id, sub] of this.subscriptions.entries()) {
      const mergeKey = this.getMergeKey(sub);
      
      if (seen.has(mergeKey)) {
        const existing = seen.get(mergeKey)!;
        // Merge connections from the duplicate into the existing
        for (const [userId, refCount] of sub.connections) {
          existing.connections.set(userId, (existing.connections.get(userId) ?? 0) + refCount);
        }
        this.subscriptions.delete(id);
      } else {
        seen.set(mergeKey, sub);
      }
    }
  }

  private getMergeKey(sub: Subscription): string {
    return `${sub.instrumentId}:${sub.timeframe}:${sub.session}:${sub.adjustment}`;
  }
}
