"use client";

// Color palette -- one distinct hue per agent seat
const COLORS: { bg: string; fg: string }[] = [
  { bg: "#2a1a1a", fg: "#c9a83a" }, // Ace - gold
  { bg: "#1a1a2a", fg: "#7b8ff0" }, // Bluff - blue
  { bg: "#1a2a1a", fg: "#5ec46a" }, // Calcula - green
  { bg: "#2a1a2a", fg: "#c474d4" }, // Daring - purple
  { bg: "#1a2424", fg: "#5ab8b8" }, // Eagle - teal
  { bg: "#2a2218", fg: "#d4884a" }, // Foxworth - orange
  { bg: "#1e1e24", fg: "#8a8aa0" }, // Grinder - steel
  { bg: "#2a1a1e", fg: "#d46a7a" }, // Hustler - rose
];

function isImageUrl(avatar: string): boolean {
  return avatar.startsWith("/api/avatars/") || avatar.startsWith("http://") || avatar.startsWith("https://");
}

interface Props {
  /** Two-char monogram string like "AC", or an image URL */
  monogram: string;
  /** Agent index 0-7, used for color */
  index: number;
  /** Pixel size of the circle. Default 28 */
  size?: number;
}

export default function AgentAvatar({ monogram, index, size = 28 }: Props) {
  const color = COLORS[index % COLORS.length];
  const fontSize = Math.round(size * 0.36);
  const hasImage = isImageUrl(monogram);

  // Resolve relative avatar URLs to the engine server
  const imgSrc = hasImage && monogram.startsWith("/api/avatars/")
    ? `${process.env.NEXT_PUBLIC_ENGINE_URL || "https://server.chips.rip"}${monogram}`
    : monogram;

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: color.bg,
      border: `1px solid ${color.fg}33`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      {hasImage ? (
        <img
          src={imgSrc}
          alt=""
          style={{
            width: size,
            height: size,
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      ) : (
        <span style={{
          fontSize,
          fontWeight: 700,
          color: color.fg,
          letterSpacing: -0.5,
          lineHeight: 1,
        }}>
          {monogram}
        </span>
      )}
    </div>
  );
}
