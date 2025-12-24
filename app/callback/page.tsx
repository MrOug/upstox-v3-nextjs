'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    console.log('=== CALLBACK DEBUG ===');
    console.log('Full URL:', window.location.href);
    console.log('Code:', code);
    console.log('Error:', error);
    console.log('Error Description:', errorDescription);

    if (error) {
      console.error('Authentication error:', error, errorDescription);
      setStatus('error');
      setErrorMsg(`${error}: ${errorDescription || 'Unknown error'}`);
      // Don't auto-close - let user see the error
      return;
    }

    if (!code) {
      console.warn('No code received');
      setStatus('error');
      setErrorMsg('No authorization code received. The popup may have been blocked or there was a redirect issue.');
      return;
    }

    // Got the code - send to parent window
    console.log('✓ Auth code received, sending to parent...');

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(
          { type: 'UPSTOX_AUTH_CODE', code },
          window.location.origin
        );
        console.log('✓ Message sent to opener');

        setTimeout(() => {
          console.log('Closing popup...');
          window.close();
        }, 1500);
      } catch (e) {
        console.error('Error sending message:', e);
        sessionStorage.setItem('upstox_auth_code', code);
        router.push('/');
      }
    } else {
      console.log('No opener, using sessionStorage fallback');
      sessionStorage.setItem('upstox_auth_code', code);
      router.push('/');
    }
  }, [searchParams, router]);

  if (status === 'error') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'JetBrains Mono, monospace',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
        textAlign: 'center',
        background: '#1a1a2e',
        color: '#fff'
      }}>
        <div style={{ fontSize: '48px' }}>❌</div>
        <div style={{ fontSize: '24px', color: '#ff6b6b' }}>Authentication Failed</div>
        <div style={{
          fontSize: '14px',
          color: '#888',
          maxWidth: '500px',
          padding: '20px',
          background: 'rgba(255,107,107,0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(255,107,107,0.3)'
        }}>
          {errorMsg}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
          <strong>Possible fixes:</strong><br />
          1. Check Upstox Developer Console redirect URI matches your Vercel URL<br />
          2. Disable IP restrictions in Upstox app settings<br />
          3. Verify environment variables in Vercel dashboard
        </div>
        <button
          onClick={() => window.close()}
          style={{
            marginTop: '20px',
            padding: '10px 30px',
            background: '#4361ee',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >
          Close Window
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'JetBrains Mono, monospace',
      flexDirection: 'column',
      gap: '20px',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '24px' }}>🔐 Processing Authentication...</div>
      <div style={{ fontSize: '14px', color: '#888' }}>
        Please wait while we complete the authorization...
      </div>
      <div style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>
        This window will close automatically.
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'monospace'
      }}>
        Loading...
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
