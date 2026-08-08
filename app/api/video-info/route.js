import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    // Use YouTube oEmbed API to get video info
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Could not fetch video information. Please check the URL.' },
        { status: 400 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      title: data.title,
      author_name: data.author_name,
      author_url: data.author_url,
      thumbnail_url: data.thumbnail_url,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch video info. Please try again.' },
      { status: 500 }
    );
  }
}
