import { WebSocketServer, WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import { getRedisClient } from "../db/redis";
import { getPrismaClient } from "../db/client";
import { MarketDataService } from "./marketdata-service";
import { MarketDataGateway } from "../marketdata/gateway";
import type { MarketDataEvent, GatewayStatusEvent, ProviderType } from "@esco-trade/shared";

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>; // instrumentIds
  isAlive: boolean;
}

interface WSMessage {
  type: string;
  payload: any;
}

let gatewayInstance: MarketDataGateway | null = null;

export function getMarketDataGateway(): MarketDataGateway | null {
  return gatewayInstance;
}

export function registerWebSocket(server: FastifyInstance): void {
  let wss: WebSocketServer;
  let marketDataService: MarketDataService;

  server.addHook("onReady", async () => {
    const port = parseInt(process.env.WS_PORT ?? "4001", 10);
    wss = new WebSocketServer({ port });
    marketDataService = new MarketDataService(getRedisClient(), getPrismaClient());

    const providerType = (process.env.MARKET_DATA_PROVIDER || "demo") as ProviderType;
    gatewayInstance = new MarketDataGateway(
      {
        providerType,
        finnhubApiKey: process.env.FINNHUB_API_KEY,
        alpacaApiKey: process.env.ALPACA_API_KEY,
        alpacaApiSecret: process.env.ALPACA_API_SECRET,
        batchMs: parseInt(process.env.MARKET_DATA_UPDATE_BATCH_MS ?? "50", 10),
        staleAfterMs: parseInt(process.env.MARKET_DATA_STALE_AFTER_MS ?? "15000", 10),
      },
      getPrismaClient()
    );

    await gatewayInstance.start();

    // Map: ws connection -> ClientConnection
    const connections = new Map<WebSocket, ClientConnection>();

    // Forward batched market data events to interested clients
    gatewayInstance.onBatch((events: MarketDataEvent[]) => {
      if (connections.size === 0) return;

      // Group events by instrumentId
      const eventsByInstrument = new Map<string, MarketDataEvent[]>();
      for (const ev of events) {
        let list = eventsByInstrument.get(ev.instrumentId);
        if (!list) {
          list = [];
          eventsByInstrument.set(ev.instrumentId, list);
        }
        list.push(ev);
      }

      // Deliver to clients subscribed to these instruments
      for (const conn of connections.values()) {
        if (conn.ws.readyState !== WebSocket.OPEN) continue;

        const clientEvents: MarketDataEvent[] = [];
        for (const instId of conn.subscriptions) {
          const matched = eventsByInstrument.get(instId);
          if (matched) {
            clientEvents.push(...matched);
          }
        }

        if (clientEvents.length > 0) {
          conn.ws.send(
            JSON.stringify({
              type: "batch",
              payload: clientEvents,
            })
          );
        }
      }
    });

    // Forward gateway status updates
    gatewayInstance.onStatus((status: GatewayStatusEvent) => {
      const msg = JSON.stringify({ type: "gateway_status", payload: status });
      for (const conn of connections.values()) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(msg);
        }
      }
    });

    wss.on("connection", (ws) => {
      const connection: ClientConnection = {
        ws,
        userId: "anonymous", // authenticated during auth message
        subscriptions: new Set(),
        isAlive: true,
      };
      connections.set(ws, connection);

      ws.on("pong", () => {
        connection.isAlive = true;
      });

      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          await handleClientMessage(connection, message, marketDataService, gatewayInstance!);
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid message format" } }));
        }
      });

      ws.on("close", async () => {
        // Clean up client subscriptions from gateway
        if (gatewayInstance) {
          for (const instId of connection.subscriptions) {
            await gatewayInstance.unsubscribe(connection.userId, instId);
          }
        }
        connections.delete(ws);
      });

      ws.on("error", (err) => {
        console.error("WebSocket connection error:", err.message);
      });

      // Welcome handshake
      ws.send(
        JSON.stringify({
          type: "connected",
          payload: {
            status: "connected",
            provider: providerType,
            timestamp: Date.now(),
          },
        })
      );
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      for (const [ws, conn] of connections.entries()) {
        if (!conn.isAlive) {
          ws.terminate();
          connections.delete(ws);
          continue;
        }
        conn.isAlive = false;
        ws.ping();
      }
    }, 30000);

    wss.on("close", () => {
      clearInterval(heartbeat);
    });

    console.log(`WebSocket server started on port ${port} with ${providerType} provider`);
  });

  server.addHook("onClose", async () => {
    if (gatewayInstance) {
      await gatewayInstance.stop();
    }
    if (wss) {
      wss.close();
    }
  });
}

async function handleClientMessage(
  conn: ClientConnection,
  msg: WSMessage,
  marketDataService: MarketDataService,
  gateway: MarketDataGateway
): Promise<void> {
  switch (msg.type) {
    case "auth": {
      const { userId } = msg.payload || {};
      if (userId) {
        conn.userId = userId;
      }
      conn.ws.send(
        JSON.stringify({
          type: "authenticated",
          payload: { userId: conn.userId },
        })
      );
      break;
    }

    case "subscribe": {
      const { instrumentId, ticker, timeframe = "1m", session = "regular", adjustment = "raw" } = msg.payload || {};
      if (!instrumentId) {
        conn.ws.send(JSON.stringify({ type: "error", payload: { message: "instrumentId is required" } }));
        return;
      }

      // Check max subscriptions per client (safety limit)
      if (conn.subscriptions.size >= 50) {
        conn.ws.send(
          JSON.stringify({
            type: "error",
            payload: { message: "Client subscription limit (50) reached." },
          })
        );
        return;
      }

      // Subscribe to central gateway (reference-counted)
      const subResult = await gateway.subscribe(conn.userId, instrumentId, ticker);
      if (!subResult.success) {
        conn.ws.send(
          JSON.stringify({
            type: "error",
            payload: {
              code: "SUBSCRIPTION_REJECTED",
              message: subResult.reason || "Subscription limit reached",
            },
          })
        );
        return;
      }

      conn.subscriptions.add(instrumentId);
      conn.ws.send(
        JSON.stringify({
          type: "subscribed",
          payload: { instrumentId },
        })
      );

      // Backfill with historical candles
      try {
        const historical = await marketDataService.getHistoricalCandles(instrumentId, timeframe, session, adjustment);
        conn.ws.send(
          JSON.stringify({
            type: "historical",
            payload: {
              instrumentId,
              candles: historical.candles,
              symbol: historical.symbol,
              timeframe: historical.timeframe,
            },
          })
        );
      } catch (e) {
        // Continue even if historical backfill fails
      }
      break;
    }

    case "unsubscribe": {
      const { instrumentId } = msg.payload || {};
      if (instrumentId) {
        conn.subscriptions.delete(instrumentId);
        await gateway.unsubscribe(conn.userId, instrumentId);
        conn.ws.send(
          JSON.stringify({
            type: "unsubscribed",
            payload: { instrumentId },
          })
        );
      }
      break;
    }

    case "ping": {
      conn.ws.send(JSON.stringify({ type: "pong", payload: { timestamp: Date.now() } }));
      break;
    }

    default:
      conn.ws.send(JSON.stringify({ type: "error", payload: { message: `Unknown message type: ${msg.type}` } }));
  }
}
