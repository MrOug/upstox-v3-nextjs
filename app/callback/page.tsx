const exchangeCodeForToken = async (authCode: string) => {
  try {
    log('Exchanging code for token...');
    log(`Code: ${authCode.substring(0, 10)}...`);
    
    const response = await fetch('/api/auth/token', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ code: authCode }) 
    });
    
    const data = await response.json();
    
    if (response.ok && data.access_token) {
      upstoxApi.setAccessToken(data.access_token);
      setAuthStatus('✓ Authenticated');
      setIsConnected(true);
      log('✓ Token obtained successfully');
      log(`✓ Token expires in: ${data.expires_in || 'N/A'} seconds`);
    } else {
      throw new Error(data.error || 'Failed to get access token');
    }
  } catch (error: any) {
    setAuthStatus(`✗ Error: ${error.message}`);
    log(`✗ Auth error: ${error.message}`);
    setIsConnected(false);
  }
};
