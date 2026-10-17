import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "border border-transparent bg-navy font-semibold text-white hover:bg-[#2a3860] disabled:border-line disabled:bg-hint-bg disabled:text-disabled-text",
        secondary: "border border-line-strong bg-card font-medium text-ink hover:bg-subtle disabled:border-line disabled:bg-hint-bg disabled:text-disabled-text",
        ghost: "border border-transparent bg-transparent font-medium text-ink hover:bg-hint-bg disabled:text-disabled-text",
        link: "border-0 bg-transparent p-0 font-medium text-link underline underline-offset-2 hover:text-link-dark disabled:text-disabled-text",
      },
      size: { md: "min-h-10 px-3.5", sm: "min-h-8 px-2.5 text-[13px]" },
    },
    compoundVariants: [{ variant: "link", className: "min-h-0 px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonStyles>["variant"]>;
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {}

/** Variants: primary (navy), secondary (white, bordered), ghost, link. Sizes: md, sm. Defaults to type="button". */
export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...rest} />;
}
