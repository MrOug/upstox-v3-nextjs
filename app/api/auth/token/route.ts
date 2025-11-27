import { NextRequest, NextResponse } from 'next/server';

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
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Exchange code for token with Upstox V2 OAuth endpoint
    const tokenResponse = await fetch('https://api.upstox.com/v2/login/authorization/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        code,
        client_id: apiKey,
        client_secret: apiSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: tokenData.message || 'Failed to get access token' },
        { status: tokenResponse.status }
      );
    }

    return NextResponse.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
    });

  } catch (error: any) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}