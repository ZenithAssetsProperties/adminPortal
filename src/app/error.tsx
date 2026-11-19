"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Container size="sm">
        <EmptyState
          icon={AlertTriangle}
          title="Something went wrong"
          description={error.message || "An unexpected error occurred while loading this administrative view."}
          action={
            <div className="flex gap-3">
              <Button onClick={() => reset()}>Try again</Button>
              <Button variant="secondary" onClick={() => window.location.href = "/admin"}>
                Dashboard
              </Button>
            </div>
          }
        />
      </Container>
    </div>
  );
}
