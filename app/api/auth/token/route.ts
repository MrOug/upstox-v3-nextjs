import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { code } = body;

    console.log('=== TOKEN EXCHANGE START ===');
    console.log('Received code length:', code?.length || 0);

    if (!code) {
      console.error('No code provided');
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    // Get environment variables
    const apiKey = process.env.NEXT_PUBLIC_UPSTOX_API_KEY;
    const apiSecret = process.env.UPSTOX_API_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

    console.log('Environment check:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasRedirectUri: !!redirectUri,
      apiKeyLength: apiKey?.length || 0,
      apiSecretLength: apiSecret?.length || 0,
      redirectUri: redirectUri
    });

    if (!apiKey || !apiSecret || !redirectUri) {
      console.error('Missing environment variables!');
      return NextResponse.json(
        { 
          error: 'Server configuration error',
          details: {
            hasApiKey: !!apiKey,
            hasApiSecret: !!apiSecret,
            hasRedirectUri: !!redirectUri
          }
        },
        { status: 500 }
      );
    }

    // Prepare form data
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', apiKey);
    params.append('client_secret', apiSecret);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    console.log('Making request to Upstox token endpoint...');
    console.log('Request params:', {
      client_id: apiKey.substring(0, 10) + '...',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_length: code.length
    });

    // Make request to Upstox
    const tokenUrl = 'https://api.upstox.com/v2/login/authorization/token';
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    console.log('Upstox response status:', response.status);
    console.log('Upstox response headers:', Object.fromEntries(response.headers.entries()));

    // Get response text first
    const responseText = await response.text();
    console.log('Upstox response text length:', responseText.length);
    console.log('Upstox response text (first 200 chars):', responseText.substring(0, 200));

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
      console.log('Parsed response data:', data);
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', parseError);
      console.error('Raw response:', responseText);
      return NextResponse.json(
        { 
          error: 'Invalid response from Upstox',
          details: 'Response is not valid JSON',
          rawResponse: responseText.substring(0, 500)
        },
        { status: 500 }
      );
    }

    // Check if request was successful
    if (!response.ok) {
      console.error('Upstox returned error:', data);
      return NextResponse.json(
        {
          error: data.error || 'Token exchange failed',
          message: data.error_description || data.message || 'Unknown error',
          status: response.status,
          details: data
        },
        { status: response.status }
      );
    }

    // Check if we have access token
    if (!data.access_token) {
      console.error('No access token in response:', data);
      return NextResponse.json(
        { 
          error: 'No access token received',
          details: data
        },
        { status: 500 }
      );
    }

    console.log('✓ Token obtained successfully');
    console.log('Token length:', data.access_token.length);
    console.log('Expires in:', data.expires_in);

    return NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in || 86400
    });

  } catch (error: any) {
    console.error('=== TOKEN EXCHANGE ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message,
        type: error.constructor.name
      },
      { status: 500 }
    );
  }
}
