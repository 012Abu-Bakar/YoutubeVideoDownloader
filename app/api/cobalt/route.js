import { NextResponse } from 'next/server';

const COBALT_INSTANCES = [
  'https://cobaltapi.kittycat.boo',
  'https://cobalt-api.lamps-dev.dev',
  'https://cobaltapi.squair.xyz',
];

export async function POST(request) {
  try {
    const body = await request.json();
    const { url, videoQuality } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let lastError = null;

    // Try each cobalt instance until one works
    for (const instance of COBALT_INSTANCES) {
      try {
        const res = await fetch(`${instance}/`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            videoQuality: videoQuality || '720',
            youtubeVideoCodec: 'h264',
          }),
        });

        const data = await res.json();

        if (data.status === 'tunnel' || data.status === 'redirect') {
          return NextResponse.json(data);
        }

        if (data.status === 'picker') {
          return NextResponse.json(data);
        }

        // If error, try next instance
        lastError = data;
      } catch (err) {
        lastError = { status: 'error', error: { code: err.message } };
      }
    }

    // All instances failed
    return NextResponse.json(
      lastError || { status: 'error', error: { code: 'All download servers are unavailable' } },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: { code: error.message } },
      { status: 500 }
    );
  }
}
