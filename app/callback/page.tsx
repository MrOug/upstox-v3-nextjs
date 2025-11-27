'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('Authentication error:', error);
      alert(`Authentication failed: ${error}`);
      window.close();
      return;
    }

    if (code) {
      // Send code to opener window
      if (window.opener) {
        window.opener.postMessage({ type: 'UPSTOX_AUTH_CODE', code }, window.location.origin);
        window.close();
      } else {
        // Fallback: store in sessionStorage and redirect
        sessionStorage.setItem('upstox_auth_code', code);
        router.push('/');
      }
    }
  }, [searchParams, router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'JetBrains Mono, monospace',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <div style={{ fontSize: '24px' }}>🔐 Processing Authentication...</div>
      <div style={{ fontSize: '14px', color: '#888' }}>
        You can close this window if it doesn't close automatically.
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackContent />
    </Suspense>
  );
}