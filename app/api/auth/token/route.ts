import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_UPSTOX_API_KEY;
    const apiSecret = process.env.UPSTOX_API_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

    if (!apiKey || !apiSecret || !redirectUri) {
      console.error('Missing environment variables:', {
        apiKey: !!apiKey,
        apiSecret: !!apiSecret,
        redirectUri: !!redirectUri
      });
      return NextResponse.json(
        { error: 'Server configuration error: Missing API credentials' },
        { status: 500 }
      );
    }

    console.log('Exchanging code for token...');
    console.log('API Key:', apiKey.substring(0, 10) + '...');
    console.log('Redirect URI:', redirectUri);
    console.log('Code length:', code.length);

    // Exchange code for access token
    const tokenUrl = 'https://api.upstox.com/v2/login/authorization/token';
    
    const response = await axios.post(
      tokenUrl,
      {
        code: code,
        client_id: apiKey,
        client_secret: apiSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    console.log('Token response status:', response.status);
    console.log('Token response data:', JSON.stringify(response.data).substring(0, 100));

    if (response.data && response.data.access_token) {
      return NextResponse.json({
        access_token: response.data.access_token,
        expires_in: response.data.expires_in || 86400
      });
    } else {
      console.error('No access token in response:', response.data);
      return NextResponse.json(
        { error: 'Invalid response from Upstox API' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Token exchange error:', error.message);
    
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response data:', error.response.data);
      
      return NextResponse.json(
        {
          error: error.response.data?.error || 'Authentication failed',
          message: error.response.data?.message || error.message,
          details: error.response.data
        },
        { status: error.response.status }
      );
    }

    return NextResponse.json(
      { error: 'Token exchange failed', message: error.message },
      { status: 500 }
    );
  }
}
