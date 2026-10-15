import type { ReactNode } from "react";

type Props = { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode };

export function AuthCard({ title, subtitle, children, footer }: Props) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-line pt-4 text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
