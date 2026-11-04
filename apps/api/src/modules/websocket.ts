import { WebSocketServer, WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import { getRedisClient } from "../db/redis";
import { getPrismaClient } from "../db/client";
import { SubscriptionManager } from "./subscription";
import { MarketDataService } from "./marketdata-service";
import type { Subscription } from "./subscription";

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  subscriptions: Map<string, Subscription>;
  lastPing: number;
  isAlive: boolean;
}

interface WSMessage {
  type: string;
  payload: unknown;
}

export function registerWebSocket(server: FastifyInstance): void {
  let wss: WebSocketServer;
  let subscriptionManager: SubscriptionManager;
  let marketDataService: MarketDataService;

  server.addHook("onReady", async () => {
    wss = new WebSocketServer({ port: 4001 });
    subscriptionManager = new SubscriptionManager(getRedisClient(), getPrismaClient());
    marketDataService = new MarketDataService(getRedisClient(), getPrismaClient());

    wss.on("connection", (ws, req) => {
      const connection: ClientConnection = {
        ws,
        userId: "",
        subscriptions: new Map(),
        lastPing: Date.now(),
        isAlive: false,
      };

      ;(ws as any).isAlive = true;
      ws.on("pong", () => {
        ;(ws as any).isAlive = true;
      });

      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          await handleMessage(connection, message, subscriptionManager, marketDataService);
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid message format" } }));
        }
      });

      ws.on("close", () => {
        // Clean up subscriptions when connection closes
        for (const sub of connection.subscriptions.values()) {
          subscriptionManager.destroySubscription(sub.id);
        }
        connection.subscriptions.clear();
      });

      ws.on("error", (err) => {
        console.error("WebSocket error:", err.message);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: "connected",
        payload: { status: "connected", timestamp: Date.now() }
      }));
    });

    // Heartbeat interval
    const heartbeat = setInterval(() => {
      wss.clients.forEach((ws) => {
        const conn = ws as WebSocket & { isAlive?: boolean };
        if (conn.isAlive === false) {
          return conn.terminate();
        }
        conn.isAlive = false;
        ws.ping();
      });
    }, 30000);

    wss.on("close", () => {
      clearInterval(heartbeat);
    });

    console.log("WebSocket server started on port 4001");
  });

  server.addHook("onClose", async () => {
    if (wss) {
      wss.close();
    }
  });
}

async function handleMessage(
  connection: ClientConnection,
  message: WSMessage,
  subscriptionManager: SubscriptionManager,
  marketDataService: MarketDataService
): Promise<void> {
  switch (message.type) {
    case "auth": {
      // In production, validate session token here
      const { userId } = message.payload as { userId?: string };
      if (!userId) {
        connection.ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Authentication required" }
        }));
        return;
      }
      connection.userId = userId;
      connection.ws.send(JSON.stringify({
        type: "authenticated",
        payload: { userId }
      }));
      break;
    }

    case "subscribe": {
      const { instrumentId, timeframe, session, adjustment } = message.payload as {
        instrumentId: string;
        timeframe: string;
        session: string;
        adjustment: string;
      };
      const subId = `${instrumentId}:${timeframe}:${session}:${adjustment}`;
      
      const existingSub = subscriptionManager.getSubscription(subId);
      if (existingSub) {
        subscriptionManager.addConnection(existingSub, connection.userId);
      } else {
        const sub = subscriptionManager.createSubscription(subId, instrumentId, timeframe, session, adjustment);
        subscriptionManager.addConnection(sub, connection.userId);
        
        // Fetch historical data for backfill
        const historical = await marketDataService.getHistoricalCandles(instrumentId, timeframe, session, adjustment);
        connection.ws.send(JSON.stringify({
          type: "historical",
          payload: {
            subscriptionId: subId,
            candles: historical.candles,
            symbol: historical.symbol,
            timeframe: historical.timeframe
          }
        }));
      }

      connection.subscriptions.set(subId, subscriptionManager.getSubscription(subId)!);
      connection.ws.send(JSON.stringify({
        type: "subscribed",
        payload: { subscriptionId: subId }
      }));
      break;
    }

    case "unsubscribe": {
      const { subscriptionId } = message.payload as { subscriptionId: string };
      const sub = connection.subscriptions.get(subscriptionId);
      if (sub) {
        subscriptionManager.removeConnection(sub, connection.userId);
        if (subscriptionManager.getRefCount(sub.id) === 0) {
          subscriptionManager.destroySubscription(sub.id);
          connection.subscriptions.delete(subscriptionId);
        }
      }
      connection.ws.send(JSON.stringify({
        type: "unsubscribed",
        payload: { subscriptionId }
      }));
      break;
    }

    case "ping": {
      connection.ws.send(JSON.stringify({ type: "pong", payload: { timestamp: Date.now() } }));
      break;
    }

    default:
      connection.ws.send(JSON.stringify({
        type: "error",
        payload: { message: `Unknown message type: ${message.type}` }
      }));
  }
}

// Export for use in other modules
export { SubscriptionManager, type Subscription };
