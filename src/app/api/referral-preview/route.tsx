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
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#2457df", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="46" height="46" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 44L25 27L36 37L53 18" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="54" cy="16" r="9" fill="#FFC928" />
            </svg>
          </div>
          <span>TeenVest</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ color: "#b7f7df", fontSize: 24, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
            Refer a friend. Get rewarded.
          </div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            {hasReward ? `Earn ${reward} per referral` : "Grow your money know-how"}
          </div>
          <div style={{ color: "#e4def5", fontSize: 30, lineHeight: 1.3 }}>
            {hasReward ? "When your friend joins TeenVest and funds their wallet" : "Join TeenVest and build good money habits"}
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
