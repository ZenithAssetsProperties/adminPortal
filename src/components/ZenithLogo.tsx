import Image from "next/image";
import { cn } from "@/lib/utils";

interface ZenithLogoProps {
  className?: string;
  variant?: "lockup" | "icon" | "header";
  theme?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  subtitle?: string;
}

export function ZenithLogo({
  className,
  variant = "header",
  theme = "dark",
  size = "md",
  subtitle = "Back office & administration",
}: ZenithLogoProps) {
  const isLight = theme === "light";

  if (variant === "lockup") {
    return (
      <div className={cn("relative inline-block", className)}>
        <Image
          src="/brand/lockup-horizontal.png"
          alt="Zenith Asset Group"
          width={size === "lg" ? 220 : size === "sm" ? 140 : 180}
          height={size === "lg" ? 48 : size === "sm" ? 32 : 40}
          priority
          className="object-contain"
        />
      </div>
    );
  }

  if (variant === "icon") {
    const dim = size === "lg" ? 48 : size === "sm" ? 28 : 36;
    return (
      <Image
        src="/brand/icon.png"
        alt="Zenith Icon"
        width={dim}
        height={dim}
        priority
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }

  // Header lockup matching the official frontend architecture
  const iconSize = size === "lg" ? 44 : size === "sm" ? 28 : 36;
  const titleSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-[21px]";

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <Image
        src="/brand/icon.png"
        alt="Zenith Asset Group"
        width={iconSize}
        height={iconSize}
        priority
        className="shrink-0 object-contain drop-shadow-sm"
      />
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-heading tracking-[-0.03em] font-normal leading-tight",
            titleSize,
            isLight ? "text-foreground" : "text-white"
          )}
        >
          Zenith
        </span>
        <span
          className={cn(
            "mt-1 text-[8px] font-semibold tracking-[0.26em]",
            isLight ? "text-brand-600" : "text-brand-300"
          )}
        >
          ASSET GROUP
        </span>
      </div>
      {subtitle && (
        <>
          <span
            className={cn(
              "ml-1.5 hidden h-7 w-px sm:block",
              isLight ? "bg-border" : "bg-brand-700/60"
            )}
          />
          <span
            className={cn(
              "hidden text-[9px] leading-[1.4] tracking-[0.14em] uppercase sm:block",
              isLight ? "text-muted-foreground" : "text-brand-400/80"
            )}
          >
            {subtitle}
          </span>
        </>
      )}
    </div>
  );
}
