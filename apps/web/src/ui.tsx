import { Link } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/** Mobile-first column, as drawn at 390 px. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-6 pt-6 ${className}`}>
      {children}
    </main>
  );
}

const buttonBase =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-lg font-semibold transition active:scale-[0.99] disabled:opacity-50";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" }) {
  const look =
    variant === "primary"
      ? "bg-grafito text-white"
      : "border-2 border-grafito bg-hoja text-grafito";
  return <button type="button" className={`${buttonBase} ${look} ${className}`} {...props} />;
}

export function LinkButton({
  to,
  variant = "primary",
  children,
}: {
  to: string;
  variant?: "primary" | "outline";
  children: ReactNode;
}) {
  const look =
    variant === "primary" ? "bg-grafito text-white" : "border-2 border-grafito bg-hoja text-grafito";
  return (
    <Link to={to} className={`${buttonBase} ${look}`}>
      {children}
    </Link>
  );
}

/** Text link styled like the green actions in the designs. */
export function TextButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`min-h-tactil px-2 text-lg font-semibold text-verde disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  optional,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-lg font-semibold">
        {label}
        {optional && <span className="font-normal text-gris"> · opcional</span>}
      </span>
      <input
        className="min-h-[52px] w-full rounded-2xl border border-linea bg-hoja px-4 text-lg outline-none focus:border-2 focus:border-grafito"
        {...props}
      />
    </label>
  );
}

/** Small monospace line used for paths and metadata. */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-sm text-gris ${className}`}>{children}</span>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="font-lectura text-xl leading-relaxed text-grafito/80">{children}</p>;
}

export function RoleTag({ role }: { role: "admin" | "member" }) {
  return role === "admin" ? (
    <span className="rounded-af-chico bg-verde px-2 py-0.5 font-mono text-xs text-white">admin</span>
  ) : (
    <span className="font-mono text-sm text-gris">miembro</span>
  );
}

const AVATAR_COLORS = [
  "bg-cat-cuerpo",
  "bg-resaltador",
  "bg-cat-atencion",
  "bg-cat-personaje",
  "bg-cat-composicion",
  "bg-cat-voz",
] as const;

export function Avatar({ name, seed, size = 44 }: { name?: string | undefined; seed: string; size?: number }) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const initial = (name?.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-grafito ${color}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label="Volver"
      className="inline-flex size-12 items-center justify-center rounded-2xl border border-linea bg-hoja text-2xl"
    >
      ‹<span className="sr-only">{label}</span>
    </Link>
  );
}

export function Loading({ text = "Cargando…" }: { text?: string }) {
  return (
    <Page className="items-center justify-center">
      <Mono>{text}</Mono>
    </Page>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Algo salió mal. Intenta de nuevo.";
  return (
    <p role="alert" className="rounded-2xl border border-cat-encuentro bg-hoja px-4 py-3 text-base text-cat-encuentro">
      {message}
    </p>
  );
}
