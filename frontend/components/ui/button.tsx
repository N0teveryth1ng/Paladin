import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-600 text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.75)] hover:brightness-110',
        secondary:
          'border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white',
        ghost: 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100',
        outline:
          'border border-white/12 bg-transparent text-zinc-200 hover:border-white/20 hover:bg-white/[0.05]',
        destructive:
          'border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3',
        xs: 'h-7 px-2 text-[11px]',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'sm' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
