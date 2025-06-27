import { NextResponse } from 'next/server';
import { z } from 'zod';

const urlSchema = z.object({
  url: z.string().url("Invalid URL provided."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = urlSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { url } = validation.data;
    
    // Ensure URL has a protocol
    const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `http://${url}`;

    const response = await fetch(fullUrl, {
        headers: { 'User-Agent': 'CodexStructure-TitleFetcher/1.0' },
        signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return NextResponse.json({ title: null, error: `Failed to fetch URL. Status: ${response.status}` }, { status: 200 });
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
        return NextResponse.json({ title: null, error: 'Content is not HTML.' }, { status: 200 });
    }

    const html = await response.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : null;

    return NextResponse.json({ title });
  } catch (error: any) {
    console.error("Fetch URL Title Error:", error);
    // Handle fetch errors like timeouts or DNS issues
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
         return NextResponse.json({ title: null, error: 'Request timed out.' }, { status: 200 });
    }
    return NextResponse.json({ title: null, error: `Failed to fetch URL: ${error.message}` }, { status: 200 });
  }
}
