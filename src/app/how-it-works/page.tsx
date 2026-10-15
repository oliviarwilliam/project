import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works",
  description: "See how to set up your TeenVest account, explore plans, fund your wallet, and earn referral rewards.",
};

const steps = [
  {
    number: "01",
    title: "Create your account",
    text: "Sign up and complete your profile to set up your TeenVest account.",
  },
  {
    number: "02",
    title: "Choose a plan",
    text: "Browse the available plans and compare their prices, durations, and details.",
  },
  {
    number: "03",
    title: "Fund your wallet",
    text: "Add funds to your wallet in naira using an available payment option.",
  },
  {
    number: "04",
    title: "Invite friends",
    text: "Share your referral link or code from the Referrals page. When someone joins with it and makes their first wallet deposit, your referral qualifies for a reward.",
  },
  {
    number: "05",
    title: "Track your activity",
    text: "Use your dashboard to view your plan, wallet, and account activity.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="container-page py-12 sm:py-20">
      <header className="mx-auto max-w-5xl border-b border-line pb-10 sm:pb-14">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">A clear path forward</p>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
          Set up your account, explore plans, invite friends, and manage your activity from one place.
        </p>
      </header>

      <ol className="mx-auto mt-8 max-w-5xl divide-y divide-line">
        {steps.map((step, index) => (
          <li key={step.number} className="grid gap-3 py-8 sm:grid-cols-[5rem_1fr] sm:gap-8 sm:py-10">
            <span className="text-sm font-bold tracking-[0.12em] text-brand">STEP {step.number}</span>
            <div className="grid gap-3 md:grid-cols-[minmax(12rem,0.8fr)_1.2fr] md:gap-10">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{step.title}</h2>
              <div>
                <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">{step.text}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

    </div>
  );
}
