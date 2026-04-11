import React, { useState } from 'react';

const base = () => process.env.PUBLIC_URL || '';

/**
 * Logo : `frontend/public/logo/coris-bank-logo.png` (ou coris-logo.svg / coris-logo.png en secours).
 */
const SOURCES = [
  '/logo/coris-bank-logo.png',
  '/logo/coris-logo.svg',
  '/logo/coris-logo.png',
];

export default function CorisLogo({ className = '' }) {
  const [stage, setStage] = useState(0);

  if (stage >= SOURCES.length) {
    return (
      <svg
        className={`header-logo-fallback ${className}`.trim()}
        width="72"
        height="72"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <rect width="20" height="20" rx="6" fill="#E8F2F9" />
        <path d="M5 7h10M5 10h7M5 13h8" stroke="#005596" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <img
      src={`${base()}${SOURCES[stage]}`}
      alt="Coris"
      className={`header-logo ${className}`.trim()}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
