'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    console.log('=== CALLBACK DEBUG ===');
    console.log('Code:', code);
    console.log('Error:', error);
    console.log('Error Description:', errorDescription);

    if (error) {
      console.error('Authentication error:', error, errorDescription);
      alert(`Authentication failed!\n\nError: ${error}\nDescription: ${errorDescription || 'Unknown'}`);
      setTimeout(() => {
        if (window.opener && !window.opener.closed) {
          window.close();
        } else {
          router.push('/');
        }
      }, 3000);
      return;
    }

    if (!code) {
      console.warn('No code received');
      alert('No authorization code received. Please try again.');
      setTimeout(() => {
        if (window.opener && !window.opener.closed) {
          window.close();
        } else {
          router.push('/');
        }
      }, 3000);
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
