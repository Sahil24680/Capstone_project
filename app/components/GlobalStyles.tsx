"use client";

import React from "react";

const css = `
/* Brand Button */
.btn-brand {
  background: linear-gradient(135deg, #ea580c, #f97316);
  color: white;
  box-shadow: 0 10px 25px -3px rgba(234, 88, 12, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-brand:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 40px -10px rgba(234, 88, 12, 0.3);
}

.btn-brand:active {
  transform: translateY(0);
}

/* Ensure solid input text and readable placeholders across browsers */
textarea, input, select { color: #0f172a; } /* slate-900 */
textarea::placeholder, input::placeholder { color: #475569; opacity: 1; } /* slate-600 */
::-webkit-input-placeholder { color: #475569; opacity: 1; }
:-ms-input-placeholder { color: #475569; opacity: 1; }

/* Animation Keyframes */
@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes progress-fill {
  from { width: 0%; }
  to   { width: var(--progress-width); }
}

@keyframes counter-up {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

/* Animation Classes */
.reveal { animation: fade-in 0.6s ease-out forwards; }
.slide-up { animation: slide-up 0.6s ease-out forwards; }
.scale-in { animation: scale-in 0.4s ease-out forwards; }
.progress-animate { animation: progress-fill 1.5s ease-out forwards; }
.counter-animate { animation: counter-up 0.8s ease-out forwards; }

/* Card Hover Effects */
.card-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.card-hover:hover { transform: translateY(-4px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
`;

export default function GlobalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
