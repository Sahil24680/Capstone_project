"use client";

import { Lock } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { createClient } from "@/utils/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setMessage("Password updated successfully! Redirecting to login...");
      
      //Redirect to login
      router.push("/auth/login");

    } catch (error: any) {
      setError(error.message || "An error occurred updating your password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-inter relative">
      {/* Background tech elements */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        {/* Top Left */}
        <div className="absolute top-0 left-0 w-32 h-32">
          <div className="absolute top-4 left-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute top-6 left-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-8 left-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-5 left-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute top-7 left-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>

        {/* Top Right */}
        <div className="absolute top-0 right-0 w-32 h-32">
          <div className="absolute top-4 right-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute top-6 right-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-8 right-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute top-5 right-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute top-7 right-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>

        {/* Bottom Left */}
        <div className="absolute bottom-0 left-0 w-32 h-32">
          <div className="absolute bottom-4 left-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute bottom-6 left-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-8 left-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-5 left-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute bottom-7 left-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>

        {/* Bottom Right */}
        <div className="absolute bottom-0 right-0 w-32 h-32">
          <div className="absolute bottom-4 right-4 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <div className="absolute bottom-6 right-8 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-8 right-6 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
          <div className="absolute bottom-5 right-6 w-6 h-0.5 bg-orange-500"></div>
          <div className="absolute bottom-7 right-4.5 w-0.5 h-6 bg-orange-500"></div>
        </div>
      </div>

      {/* Main reset password card */}
      <div className="w-full max-w-md mx-auto px-6 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          {/* Logo */}
          <div className="mb-8">
            <div
              className="
      mx-auto w-20 h-20 rounded-2xl
      
      p-2 shadow-lg ring-1 ring-orange-300/30
      flex items-center justify-center overflow-hidden
    "
              aria-label="Ghost Job Busters logo"
            >
              <img
                src="/images/job_buster_pfp.png"
                alt="Ghost Job Busters"
                className="w-full h-full object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
          </div>

          {/* Welcome text */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Enter New Password</h1>
            <p className="text-slate-600">
              Please enter your new password below
            </p>
          </div>

          {/* Reset form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Success message */}
            {message && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {message}
              </div>
            )}

            {/* New Password field */}
            <Input
              name="password"
              type="password"
              placeholder="New Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-5 w-5 text-slate-400" />}
              required
              disabled={loading}
            />

            {/* Confirm Password field */}
            <Input
              name="confirmPassword"
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="h-5 w-5 text-slate-400" />}
              required
              disabled={loading}
            />

            {/* Submit button */}
            <Button type="submit" fullWidth className="py-3" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
