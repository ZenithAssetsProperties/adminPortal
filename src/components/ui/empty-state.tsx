import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  titleAs?: "h1" | "h2" | "h3";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  titleAs = "h2",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-16 text-center", className)} {...props}>
      {Icon && (
        <div className="bg-muted flex size-12 items-center justify-center rounded-full border border-border">
          <Icon className="text-muted-foreground size-6" aria-hidden="true" />
        </div>
      )}
      <Heading as={titleAs} level="h3">
        {title}
      </Heading>
      {description && (
        <Text size="muted" className="max-w-sm">
          {description}
        </Text>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
