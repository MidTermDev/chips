"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface CardData {
  rank: string;
  suit: string;
  display: string;
}

export interface PlayerData {
  seat: number;
  agentId: string;
  name: string;
  chips: number;
  bet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  avatar: string;
  style: string;
  hasCards: boolean;
  holeCards?: CardData[];
}

export interface ActionData {
  seat: number;
  playerName: string;
  action: string;
  amount: number;
  reasoning?: string;
}

export interface GameStateData {
  handNumber: number;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  bettingRound: string;
  pot: number;
  currentBet: number;
  activeSeat: number;
  communityCards: CardData[];
  players: PlayerData[];
  actions: ActionData[];
}

export interface WinnerData {
  seat: number;
  playerName: string;
  amount: number;
  handDescription: string;
}

export interface ThinkingData {
  seat: number;
  playerName: string;
  avatar: string;
}

export interface TrackedAction {
  seat: number;
  playerName: string;
  action: string;
  amount: number;
  round: string;
  handNumber: number;
}

export interface WSMessage {
  type: string;
  data: any;
  timestamp: number;
}

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8081";

export function useGameState(wsUrl: string = DEFAULT_WS_URL) {
  const [gameState, setGameState] = useState<GameStateData | null>(null);
  const [thinking, setThinking] = useState<ThinkingData | null>(null);
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [showdown, setShowdown] = useState<any>(null);
  const [actionLog, setActionLog] = useState<ActionData[]>([]);
  const [handHistory, setHandHistory] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const gameStateRef = useRef<GameStateData | null>(null);
  const allTimeActionsRef = useRef<TrackedAction[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Connect as spectator
      const url = `${wsUrl}?role=spectator`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log("[WS] Connected as spectator");
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log("[WS] Disconnected, reconnecting in 3s...");
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          console.error("[WS] Parse error:", e);
        }
      };
    } catch (e) {
      console.error("[WS] Connection error:", e);
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [wsUrl]);

  const handleMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "game_state": {
        const data = msg.data;
        const mapped: GameStateData = {
          handNumber: data.handNumber,
          dealerSeat: data.dealerSeat ?? data.dealerIndex ?? -1,
          smallBlindSeat: data.smallBlindSeat ?? data.smallBlindIndex ?? -1,
          bigBlindSeat: data.bigBlindSeat ?? data.bigBlindIndex ?? -1,
          bettingRound: data.bettingRound,
          pot: data.pot,
          currentBet: data.currentBet,
          activeSeat: data.activeSeat ?? data.activePlayerIndex ?? -1,
          communityCards: data.communityCards || [],
          players: (data.players || []).map((p: any) => ({
            seat: p.seat ?? p.index ?? 0,
            agentId: p.agentId || "",
            name: p.name || "",
            chips: p.chips || 0,
            bet: p.bet || 0,
            totalBet: p.totalBet || 0,
            folded: p.folded || false,
            allIn: p.allIn || false,
            sittingOut: p.sittingOut || false,
            avatar: p.avatar || "",
            style: p.style || "",
            hasCards: p.hasCards || false,
          })),
          actions: (data.actions || []).map((a: any) => ({
            seat: a.seat ?? a.playerIndex ?? 0,
            playerName: a.name ?? a.playerName ?? "",
            action: a.action,
            amount: a.amount,
            reasoning: a.reasoning,
          })),
        };
        gameStateRef.current = mapped;
        setGameState(mapped);
        setThinking(null);
        break;
      }

      case "agent_thinking":
        setThinking({
          seat: msg.data.seat ?? msg.data.playerIndex ?? 0,
          playerName: msg.data.name ?? msg.data.playerName ?? "",
          avatar: msg.data.avatar || "",
        });
        break;

      case "player_action": {
        setThinking(null);
        const action: ActionData = {
          seat: msg.data.seat ?? msg.data.playerIndex ?? 0,
          playerName: msg.data.name ?? msg.data.playerName ?? "",
          action: msg.data.action,
          amount: msg.data.amount,
          reasoning: msg.data.reasoning,
        };
        setActionLog((prev) => [...prev.slice(-49), action]);
        allTimeActionsRef.current.push({
          seat: action.seat,
          playerName: action.playerName,
          action: action.action,
          amount: action.amount,
          round: gameStateRef.current?.bettingRound || "preflop",
          handNumber: gameStateRef.current?.handNumber || 0,
        });
        break;
      }

      case "community_cards":
        setGameState((prev) =>
          prev ? { ...prev, communityCards: msg.data.cards || msg.data.data?.cards || [] } : null
        );
        break;

      case "showdown":
        setShowdown(msg.data);
        setWinners((msg.data.winners || []).map((w: any) => ({
          seat: w.seat ?? w.playerIndex ?? 0,
          playerName: w.name ?? w.playerName ?? "",
          amount: w.amount,
          handDescription: w.handDescription,
        })));
        break;

      case "hand_complete":
        setHandHistory((prev) => [...prev.slice(-19), msg.data]);
        if (msg.data.players) {
          setGameState((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              players: prev.players.map((p) => {
                const updated = msg.data.players.find(
                  (u: any) => (u.seat ?? u.index) === p.seat
                );
                return updated ? {
                  ...p,
                  chips: updated.chips,
                  avatar: updated.avatar || p.avatar,
                  style: updated.style || p.style,
                  sittingOut: updated.sittingOut ?? p.sittingOut,
                } : p;
              }),
            };
          });
        }
        break;

      case "new_hand":
        setWinners([]);
        setShowdown(null);
        setThinking(null);
        setActionLog([]);
        allTimeActionsRef.current.push({
          seat: -99,
          playerName: "__new_hand__",
          action: "new_hand",
          amount: 0,
          round: "preflop",
          handNumber: msg.data.handNumber,
        });
        if (msg.data.players) {
          setGameState({
            handNumber: msg.data.handNumber,
            dealerSeat: msg.data.dealer,
            smallBlindSeat: msg.data.smallBlind?.seat ?? -1,
            bigBlindSeat: msg.data.bigBlind?.seat ?? -1,
            bettingRound: "preflop",
            pot: 0,
            currentBet: 0,
            activeSeat: -1,
            communityCards: [],
            players: msg.data.players.map((p: any) => ({
              seat: p.seat ?? p.index ?? 0,
              agentId: p.agentId || "",
              name: p.name || "",
              chips: p.chips || 0,
              bet: 0,
              totalBet: 0,
              folded: false,
              allIn: false,
              sittingOut: p.sittingOut || false,
              avatar: p.avatar || "",
              style: p.style || "",
              hasCards: !p.sittingOut,
            })),
            actions: [],
          });
        }
        break;

      case "blinds_posted":
        setActionLog((prev) => [
          ...prev,
          {
            seat: msg.data.smallBlind?.seat ?? -1,
            playerName: msg.data.smallBlind?.name ?? "",
            action: "small blind",
            amount: msg.data.smallBlind?.amount ?? 0,
          },
          {
            seat: msg.data.bigBlind?.seat ?? -1,
            playerName: msg.data.bigBlind?.name ?? "",
            action: "big blind",
            amount: msg.data.bigBlind?.amount ?? 0,
          },
        ]);
        break;

      case "player_joined":
        setGameState((prev) => {
          if (!prev) return null;
          // Add new player if not already present
          const exists = prev.players.find(p => p.seat === msg.data.seat);
          if (exists) return prev;
          return {
            ...prev,
            players: [...prev.players, {
              seat: msg.data.seat,
              agentId: msg.data.agentId || "",
              name: msg.data.name,
              chips: msg.data.chips,
              bet: 0,
              totalBet: 0,
              folded: false,
              allIn: false,
              sittingOut: false,
              avatar: msg.data.avatar || "",
              style: msg.data.style || "",
              hasCards: false,
            }],
          };
        });
        break;

      case "player_left":
        setGameState((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            players: prev.players.filter(p => p.seat !== msg.data.seat),
          };
        });
        break;

      case "transaction":
        setLastTransaction(msg.data);
        setTransactions((prev) => [...prev.slice(-99), {
          ...msg.data,
          type: msg.data.txType || msg.data.type,
          from: msg.data.from,
          to: msg.data.to,
          amount: msg.data.amount,
          sig: msg.data.sig,
          timestamp: msg.timestamp,
        }]);
        break;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    gameState,
    thinking,
    winners,
    showdown,
    actionLog,
    handHistory,
    connected,
    lastTransaction,
    transactions,
    allTimeActionsRef,
  };
}
