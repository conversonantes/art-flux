import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Button, ErrorNote, Loading, Mono, Page } from "../ui";

/** The branching illustration from the login design, drawn with the category colors. */
function Branches() {
  return (
    <svg viewBox="0 0 390 480" role="img" aria-label="Ramas de un proceso creativo" className="mx-auto h-auto w-full max-w-xs">
      <g fill="none" stroke="var(--af-grafito)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M105 60 V420" />
        <path d="M165 90 V150 C165 190 105 200 105 250" />
        <path d="M235 60 V90 C235 130 200 140 165 150" />
        <path d="M285 160 V190 C285 215 230 215 165 230" />
        <path d="M112 132 L232 112" strokeDasharray="5 5" strokeWidth="2" />
      </g>
      <g stroke="var(--af-grafito)" strokeWidth="2.5">
        <circle cx="105" cy="60" r="10" fill="var(--af-cat-personaje)" />
        <circle cx="165" cy="80" r="10" fill="var(--af-cat-juego)" />
        <circle cx="235" cy="60" r="10" fill="var(--af-cat-voz)" />
        <circle cx="245" cy="100" r="10" fill="var(--af-resaltador)" />
        <circle cx="105" cy="140" r="10" fill="var(--af-hoja)" />
        <circle cx="165" cy="150" r="10" fill="var(--af-cat-cuerpo)" />
        <circle cx="285" cy="140" r="10" fill="var(--af-cat-composicion)" />
        <circle cx="105" cy="220" r="10" fill="var(--af-hoja)" />
        <circle cx="165" cy="230" r="10" fill="var(--af-cat-analisis)" />
        <circle cx="105" cy="290" r="10" fill="var(--af-cat-encuentro)" />
      </g>
    </svg>
  );
}

export function LoginScreen() {
  const { state, client } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "loading") return <Loading />;
  if (state.status === "in") return <Navigate to="/" replace />;

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      await client.signInWithGoogle(); // the page navigates to Google
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Page>
      <Mono>v0.1 · medellín</Mono>
      <div className="flex flex-1 items-center py-6">
        <Branches />
      </div>
      <h1 className="text-6xl">art-flux</h1>
      <p className="mt-3 font-lectura text-2xl">
        Registra cómo crean. <mark className="af-hallazgo">Todo deriva de todo.</mark>
      </p>
      <div className="mt-8 space-y-3">
        {error != null && <ErrorNote error={error} />}
        <Button variant="outline" onClick={enter} disabled={busy}>
          <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-grafito text-base text-white">
            G
          </span>
          Entrar con Google
        </Button>
        <p className="text-center font-mono text-sm text-gris">
          sin contraseñas nuevas · tu nombre y foto vienen de Google
        </p>
      </div>
    </Page>
  );
}
