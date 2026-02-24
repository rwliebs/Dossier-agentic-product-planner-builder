import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <h1 className="font-mono text-3xl font-bold uppercase tracking-widest text-foreground mb-2">
        DOSSIER
      </h1>
      <p className="text-xs uppercase tracking-widest font-mono text-muted-foreground mb-8">
        AI-Native Product Building Platform
      </p>
      <p className="text-sm text-muted-foreground mb-6">This page could not be found.</p>
      <Link
        href="/"
        className="text-sm font-medium text-primary hover:underline"
      >
        Go to Dossier home
      </Link>
    </div>
  );
}
