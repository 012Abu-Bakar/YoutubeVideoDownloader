import { NextResponse } from 'next/server';

const COBALT_INSTANCES = [
  'https://cobaltapi.kittycat.boo',
  'https://cobalt-api.lamps-dev.dev',
  'https://cobaltapi.squair.xyz',
  'https://cobalt-alpha.wolfy.love',
  'https://cobalt-omega.wolfy.love',
  'https://kitty.tame.gg',
  'https://api.qwkuns.me',
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

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
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const data = await res.json();

        if (data.status === 'tunnel' || data.status === 'redirect') {
          return NextResponse.json(data);
        }

        if (data.status === 'picker') {
          return NextResponse.json(data);
        }

        // If auth error or rate limit, try next instance
        lastError = data;
      } catch (err) {
        lastError = { status: 'error', error: { code: err.message } };
      }
    }

    // All instances failed
    const errorCode = lastError?.error?.code || 'unknown';
    let userMessage = 'All download servers are busy. Please try again in a moment.';

    if (errorCode.includes('youtube.login')) {
      userMessage = 'This video requires YouTube login and cannot be downloaded.';
    } else if (errorCode.includes('content.video.unavailable')) {
      userMessage = 'This video is unavailable or restricted.';
    }

    return NextResponse.json(
      { status: 'error', error: { code: userMessage } },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: { code: error.message } },
      { status: 500 }
    );
  }
}
