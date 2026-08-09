import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://scheme-majesty-cavalier.ngrok-free.dev';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const res = await fetch(`${BACKEND_URL}/api/download/progress-poll/${id}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: 'Backend unavailable', status: 'error' }, { status: 500 });
  }
}
