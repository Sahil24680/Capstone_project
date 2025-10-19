"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
const supabase = createClient();

export default function UpdatePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Optional: if user somehow hits this page without the recovery session,
  // we can show a friendly note. The reset link normally logs them in.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMessage(
          "This page is for updating your password from the email link. Please use the reset email link again."
        );
      }
    })();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Password updated! Redirecting to login…");
    // Small pause so the user sees the success message
    setTimeout(() => router.push("/auth/login"), 900);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-gray-900">
      <form
        onSubmit={handleUpdate}
        className="bg-white p-6 rounded-xl shadow-md w-full max-w-md"
      >
        <h1 className="text-2xl font-bold mb-4">Set a New Password</h1>

        <label className="block text-sm font-medium mb-1">New Password</label>
        <input
          type="password"
          className="border p-2 w-full rounded mb-3"
          placeholder="Enter new password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label className="block text-sm font-medium mb-1">Confirm Password</label>
        <input
          type="password"
          className="border p-2 w-full rounded mb-4"
          placeholder="Re-enter new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-orange-500 text-white py-2 px-4 rounded w-full"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>

        {message && (
          <p className="mt-3 text-center text-sm text-slate-700">{message}</p>
        )}
      </form>
    </div>
  );
}
