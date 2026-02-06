"use client";

import { ThinkingData, ActionData } from "@/hooks/useGameState";

interface Props {
  thinking: ThinkingData | null;
  lastAction: ActionData | null;
}

export default function ThoughtBubble({ thinking, lastAction }: Props) {
  if (!thinking && !lastAction?.reasoning) return null;

  return (
    <div className="anim-fade" style={{
      background: "#0e0e16",
      border: "1px solid #1a1a24",
      borderRadius: 6,
      padding: "10px 16px",
      maxWidth: 460, width: "100%",
    }}>
      {thinking ? (
        <div style={{ fontSize: 11, color: "#4a6a7a", fontWeight: 500 }}>
          <span className="dots">{thinking.playerName} is thinking</span>
        </div>
      ) : lastAction?.reasoning ? (
        <div>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#2a2a38", textTransform: "uppercase", letterSpacing: 1 }}>
            {lastAction.playerName}
          </span>
          <div style={{ fontSize: 11, color: "#5a5a68", marginTop: 3, lineHeight: 1.5 }}>
            {lastAction.reasoning}
          </div>
        </div>
      ) : null}
    </div>
  );
}
