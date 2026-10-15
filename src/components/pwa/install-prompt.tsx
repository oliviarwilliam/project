"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Device = "ios" | "android" | "desktop";

const DISMISSED_UNTIL_KEY = "teenvest:pwa-install-dismissed-until";
const DISMISS_DAYS = 7;

function isDismissed() {
  try {
    return Number(localStorage.getItem(DISMISSED_UNTIL_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function dismissForAWhile() {
  try {
    localStorage.setItem(
      DISMISSED_UNTIL_KEY,
      String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
    );
  } catch {
    // The prompt still closes for this visit when storage is unavailable.
  }
}

export function InstallPrompt() {
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [nativeInstallAvailable, setNativeInstallAvailable] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const currentDevice: Device = isIos ? "ios" : isAndroid ? "android" : "desktop";
    setDevice(currentDevice);

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (isStandalone || isDismissed()) return;

    const timer = window.setTimeout(() => setVisible(true), 2500);
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as InstallPromptEvent;
      setNativeInstallAvailable(true);
      if (!isDismissed()) setVisible(true);
    };
    const onAppInstalled = () => {
      deferredPrompt.current = null;
      setVisible(false);
      setShowSteps(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const closePrompt = useCallback(() => {
    dismissForAWhile();
    setVisible(false);
    setShowSteps(false);
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) {
      setShowSteps(true);
      return;
    }

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      deferredPrompt.current = null;
      setNativeInstallAvailable(false);
      if (choice.outcome === "accepted") setVisible(false);
      else setShowSteps(true);
    } catch {
      deferredPrompt.current = null;
      setNativeInstallAvailable(false);
      setShowSteps(true);
    }
  }, []);

  if (!visible || !device) return null;

  return (
    <aside
      aria-label="Install TeenVest"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl border border-line bg-surface p-4 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Install TeenVest</p>
          <p className="mt-1 text-sm leading-5 text-muted">
            {device === "desktop"
              ? "Install TeenVest on your computer for quick access."
              : "Add TeenVest to your home screen for quick access."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          onClick={closePrompt}
          className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-line/60 hover:text-ink"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={closePrompt}>
          Not now
        </button>
        <button type="button" className="btn btn-primary" onClick={install}>
          {device === "ios" ? "Show me how" : nativeInstallAvailable ? "Install app" : "Install instructions"}
        </button>
      </div>

      {showSteps && (
        <div className="mt-4 border-t border-line pt-3 text-sm text-muted" aria-live="polite">
          {device === "ios" ? (
            <>
              <p className="mb-2 font-semibold text-ink">Add TeenVest from Safari</p>
              <ol className="list-inside list-decimal space-y-1">
                <li>Open this page in Safari and tap Share.</li>
                <li>Choose “Add to Home Screen”.</li>
                <li>Tap “Add” to finish.</li>
              </ol>
            </>
          ) : device === "android" ? (
            <>
              <p className="mb-2 font-semibold text-ink">Install from your browser</p>
              <ol className="list-inside list-decimal space-y-1">
                <li>Open the browser menu.</li>
                <li>Choose “Install app” or “Add to Home screen”.</li>
                <li>Confirm the installation.</li>
              </ol>
            </>
          ) : (
            <>
              <p className="mb-2 font-semibold text-ink">Install on your computer</p>
              <ol className="list-inside list-decimal space-y-1">
                <li>In Chrome or Edge, select the install icon in the address bar or choose “Install app” from the browser menu.</li>
                <li>In Safari on macOS Sonoma or newer, choose Share, then “Add to Dock”.</li>
                <li>Confirm the installation.</li>
              </ol>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
