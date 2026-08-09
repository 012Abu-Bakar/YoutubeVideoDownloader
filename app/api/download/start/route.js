import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://80.225.193.195:5000';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const quality = searchParams.get('quality') || 'best';

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/download/start?url=${encodeURIComponent(url)}&quality=${quality}`,
      { signal: AbortSignal.timeout(30000) }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}
