import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  actions?: ReactNode;
}

export function Card({ title, actions, className, children, ...props }: CardProps) {
  if (title || actions) {
    return (
      <section className={cn("rounded-sm border border-border bg-white shadow-xs overflow-hidden", className)}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 bg-muted/20">
          <h2 className="text-xl font-heading text-foreground font-normal">{title}</h2>
          {actions}
        </header>
        <div className="p-5">{children}</div>
      </section>
    );
  }

  return (
    <div
      className={cn("rounded-sm border border-border bg-white p-5 shadow-xs", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pb-3 border-b border-border", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-heading text-foreground text-xl font-normal tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-muted-foreground text-xs uppercase tracking-wider", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pt-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center pt-4 border-t border-border", className)} {...props} />;
}
