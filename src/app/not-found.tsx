import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Container size="sm">
        <EmptyState
          icon={FileQuestion}
          title="Resource not found"
          description="The requested page, record, or administration endpoint could not be found."
          action={
            <Button asChild>
              <Link href="/admin">Return to Dashboard</Link>
            </Button>
          }
        />
      </Container>
    </div>
  );
}
