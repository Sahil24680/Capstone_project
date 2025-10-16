import { Mail, Lock, Apple } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { createClient } from "@/utils/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, signup } from "@/utils/supabase/action";

interface Authprops {
  title: string;
  button_txt: string;
  is_login: boolean;
  sub_text: string;
  link: string;
}


const Auth_Form = ({
  title,
  button_txt,
  is_login,
  sub_text,
  link,
}: Authprops) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);

      if (is_login) {
        //Handle login with server action
        const result = await login(formData);
        
        if (result.error) {
          throw new Error(result.error.message);
        }

        setMessage("Login successful! Redirecting...");
        router.push("/"); //Redirect to home page
      } else {
        //Handle signup with server action
        const result = await signup(formData);
        
        if (result.error) {
          throw new Error(result.error.message);
        }

        setMessage("Check your email for the confirmation link!");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };


  //Google sign in
  const handleGoogleAuth = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const {error} = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;
    } catch (error: any) {
      setError(error.message || "An error occurred with Google authentication");
      setLoading(false);
    }
  };


  //GitHub sign in
  const handleGitHubAuth = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const {error} = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;
    } catch (error: any) {
      setError(error.message || "An error occurred with GitHub authentication");
      setLoading(false);
    }
  };


  //Password reset
  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;

      setMessage("Password reset email sent! Check your inbox.");
      setShowPasswordReset(false);
    } catch (error: any) {
      setError(error.message || "An error occurred sending password reset email");
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

      {/* Main login card */}
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
            <h1 className="text-3xl font-bold text-slate-900 mb-2">{title}</h1>
            <p className="text-slate-600">
              {sub_text}{" "}
              <a
                href={is_login ? "/auth/signup" : "/auth/login"}
                className="text-orange-600 hover:text-orange-500 transition-colors font-medium"
              >
                {link}
              </a>
            </p>
          </div>

          {/* Auth form */}
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

            {/* Email field */}
            <Input
              name="email"
              type="email"
              placeholder="email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="h-5 w-5 text-slate-400" />}
              required
              disabled={loading}
            />

            {/* Password field */}
            <div>
              <Input
                name="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="h-5 w-5 text-slate-400" />}
                required
                disabled={loading}
              />
              {is_login && (
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={loading}
                    className="text-orange-600 hover:text-orange-500 text-sm transition-colors font-medium disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            {/* Submit button */}
            <Button type="submit" fullWidth className="py-3" disabled={loading}>
              {loading ? "Loading..." : button_txt}
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>

            {/* Google sign in button */}
            <Button
              type="button"
              onClick={handleGoogleAuth}
              fullWidth
              className="py-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-3"
              disabled={loading}
            >
              <img src="/images/google_icon.png" alt="Google" className="w-5 h-5"/>
              {loading ? "Loading..." : `Continue with Google`}
            </Button>

            {/* GitHub sign in button */}
            <Button
              type="button"
              onClick={handleGitHubAuth}
              fullWidth
              className="py-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-3"
              disabled={loading}
            >
              <img src="/images/github_icon.png" alt="GitHub" className="w-5 h-5"/>
              {loading ? "Loading..." : `Continue with GitHub`}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Auth_Form;
