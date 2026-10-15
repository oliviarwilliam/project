"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postWallet } from "@/lib/wallet-api";

type Props = { packageId: string; priceLabel: string; canAfford: boolean };

export function PurchaseButton({ packageId, priceLabel, canAfford }: Props) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setStep("busy");
    setError(null);
    key.current ??= crypto.randomUUID(); // reused on retry so a double click never buys twice
    try {
      await postWallet(`/api/packages/${packageId}/purchase`, {}, key.current);
      key.current = null;
      setStep("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep("confirm");
    }
  }

  if (step === "idle") {
    return (
      <button type="button" disabled={!canAfford} onClick={() => setStep("confirm")} className="btn btn-primary w-full">
        {canAfford ? "Buy package" : "Balance too low"}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" disabled={step === "busy"} onClick={buy} className="btn btn-primary flex-1">
          {step === "busy" ? "Processing..." : `Confirm ${priceLabel}`}
        </button>
        <button type="button" disabled={step === "busy"} onClick={() => setStep("idle")} className="btn btn-ghost border border-line">
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
