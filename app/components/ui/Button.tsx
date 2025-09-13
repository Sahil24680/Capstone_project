import React from 'react';

interface ButtonProps {
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  variant?: "primary" | "ghost";
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  type = "button",
  disabled = false,
  className = "",
  children,
  onClick,
  variant = "primary",
  fullWidth = false,
  ...rest
}) => {
  const baseClasses = "rounded-xl px-4 py-2 font-medium shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2";
  
  const variantClasses = {
    primary: "bg-gradient-to-br from-orange-600 to-orange-500 text-white hover:-translate-y-0.5 hover:shadow-lg",
    ghost: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50"
  };

  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed" : "";
  const fullWidthClasses = fullWidth ? "w-full" : "";

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${fullWidthClasses} ${className}`.trim();

  return (
    <button
      type={type}
      disabled={disabled}
      className={combinedClasses}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
};
