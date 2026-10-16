import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function formatReward(value: string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return "₦1,000";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function GET(request: Request) {
  const rawAmount = new URL(request.url).searchParams.get("amount");
  const amount = Number(rawAmount);
  const hasReward = Number.isFinite(amount) && amount > 0 && amount <= 1_000_000;
  const reward = formatReward(rawAmount);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 76px",
          color: "#ffffff",
          background: "linear-gradient(135deg, #160b35 0%, #241354 55%, #102c4b 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 700 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#9ff0d0" }} />
          TeenVest
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ color: "#b7f7df", fontSize: 24, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
            A little invite. A real reward.
          </div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            {hasReward ? `Your friend earns ${reward}` : "Grow your money know-how"}
          </div>
          <div style={{ color: "#e4def5", fontSize: 30, lineHeight: 1.3 }}>
            {hasReward ? "When you join TeenVest and fund your wallet" : "Join TeenVest and build good money habits"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#d4c9ed", fontSize: 22 }}>
          <span>Learn. Grow. Build good money habits.</span>
          <span style={{ color: "#ffffff", fontWeight: 700 }}>Join TeenVest</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
