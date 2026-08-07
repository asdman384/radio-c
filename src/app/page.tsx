export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Local prototype</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Next.js and SQLite are wired up. Add a migration in{" "}
        <code className="font-mono">db/migrations/</code>, run{" "}
        <code className="font-mono">npm run db:migrate</code>, and start building.
      </p>
    </main>
  );
}
