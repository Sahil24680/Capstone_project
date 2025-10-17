"use client";

import { Mail } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { createClient } from "@/utils/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OTPVerificationPage() {
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    //get email from sessionStorage
    const storedEmail = sessionStorage.getItem('otp_email');
    
    if (storedEmail) {
      setEmail(storedEmail);
    } else {
      setError('Invalid session. Please start the OTP login process again.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (otpCode.length !== 6) {
      setError("Please enter a valid 6-digit login code.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'email'
      });

      if (error) throw error;

      setMessage("Login successful! Redirecting...");
      
      //clear sessionStorage
      sessionStorage.removeItem('otp_email');
      
      //redirect to home
      setTimeout(() => {
        router.push("/");
      }, 1000);
      
    } catch (error: any) {
      setError(error.message || "An error occurred verifying your code");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setError("No email found. Please start the OTP process again.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
      });

      if (error) throw error;

      setMessage("New code sent! Check your email.");
    } catch (error: any) {
      setError(error.message || "An error occurred resending the code");
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

      {/* Main OTP verification card */}
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
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Enter Login Code</h1>
            <p className="text-slate-600">
              {email ? (
                <>
                  We sent a 6-digit code to <span className="font-medium">{email}</span>
                </>
              ) : (
                "Please check your email for the login code"
              )}
            </p>
          </div>

          {/* OTP form */}
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

            {/* OTP field */}
            <Input
              name="otpCode"
              type="text"
              placeholder="Enter 6-digit code"
              value={otpCode}
              onChange={(e) => {
                //Only allow numbers and limit to 6 digits
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setOtpCode(value);
              }}
              leftIcon={<Mail className="h-5 w-5 text-slate-400" />}
              required
              disabled={loading}
              maxLength={6}
            />

            {/* Submit button */}
            <Button type="submit" fullWidth className="py-3" disabled={loading || !email}>
              {loading ? "Verifying..." : "Verify OTP"}
            </Button>

            {/* Resend code link */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="text-orange-600 hover:text-orange-500 text-sm transition-colors font-medium disabled:opacity-50"
              >
                Didn't receive the code? Resend
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

