import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface PhysicalCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  depth?: "sm" | "md" | "lg";
  hoverEffect?: boolean;
}

export function PhysicalCard({ 
  children, 
  className, 
  depth = "md",
  hoverEffect = true,
  ...props 
}: PhysicalCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className={cn(
        "bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800",
        "architectural-shadow",
        hoverEffect && "hover:shadow-[20px_20px_0px_0px_rgba(0,0,0,0.04)] transition-all duration-300",
        depth === "sm" && "p-6",
        depth === "md" && "p-12",
        depth === "lg" && "p-20",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function GlassCard({ 
  children, 
  className, 
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "bg-white/90 backdrop-blur-sm border border-zinc-200 p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
