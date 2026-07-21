import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F0E7] px-6">
      <div className="w-full max-w-md bg-[#FCFBF8] border border-[#E3DACB] rounded-xl p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[#59636A] mb-1.5">{label}</label>
      <input
        className="w-full px-3.5 py-2.5 rounded-lg border border-[#E3DACB] bg-white text-[#142B3A] text-sm focus:outline-none focus:border-[#B96343] transition-colors"
        {...props}
      />
    </div>
  );
}

export function CheckboxField({
  label,
  ...props
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-start gap-2 text-sm text-[#59636A] mb-4 cursor-pointer">
      <input type="checkbox" className="mt-0.5" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function PrimaryButton({
  children,
  ...props
}: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="w-full py-2.5 rounded-lg bg-[#142B3A] hover:bg-[#0d1e29] text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      {...props}
    >
      {children}
    </button>
  );
}

export function OAuthButton({
  children,
  ...props
}: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="w-full py-2.5 rounded-lg border border-[#E3DACB] bg-white hover:border-[#B96343] text-[#142B3A] font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      {...props}
    >
      {children}
    </button>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="h-px flex-1 bg-[#E3DACB]" />
      <span className="text-xs text-[#59636A] uppercase tracking-wide">{label}</span>
      <div className="h-px flex-1 bg-[#E3DACB]" />
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-[#A13D2E] mb-4">{children}</p>;
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-[#59636A] bg-[#F4F0E7] border border-[#E3DACB] rounded-lg px-3 py-2.5 mb-4">
      {children}
    </div>
  );
}
