import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://80.225.193.195:5000';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const res = await fetch(`${BACKEND_URL}/api/download/file/${id}`, {
      signal: AbortSignal.timeout(300000), // 5 min timeout for large files
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'File not ready' }, { status: res.status });
    }

    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('Content-Type') || 'video/mp4');
    if (res.headers.get('Content-Disposition')) {
      headers.set('Content-Disposition', res.headers.get('Content-Disposition'));
    }
    if (res.headers.get('Content-Length')) {
      headers.set('Content-Length', res.headers.get('Content-Length'));
    }

    return new Response(res.body, { status: 200, headers });
  } catch (error) {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
