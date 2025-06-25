
import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import mime from 'mime-types';

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

export async function GET(request: Request, { params }: { params: { slug: string[] } }) {
  try {
    const { slug } = params;
    if (!slug || slug.length === 0) {
      return NextResponse.json({ error: 'File path is required.' }, { status: 400 });
    }

    // Construct the file path from the slug parts
    // Basic sanitization: ensure no '..' to prevent path traversal
    const slugParts = slug.map(part => part.replace(/\.\./g, '')); 
    const relativeFilePath = path.join(...slugParts);
    const absoluteFilePath = path.normalize(path.join(UPLOADS_DIR, relativeFilePath));

    // Security check: Ensure the resolved path is still within the UPLOADS_DIR
    if (!absoluteFilePath.startsWith(UPLOADS_DIR)) {
      console.warn(`Attempt to access file outside uploads directory: ${absoluteFilePath}`);
      return NextResponse.json({ error: 'Forbidden: Invalid file path.' }, { status: 403 });
    }
    
    // Check if file exists
    try {
      await fsp.access(absoluteFilePath, fs.constants.F_OK);
    } catch (err) {
      console.warn(`File not found at ${absoluteFilePath}`);
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }

    const fileStream = fs.createReadStream(absoluteFilePath);
    const contentType = mime.lookup(absoluteFilePath) || 'application/octet-stream';
    const stats = await fsp.stat(absoluteFilePath);

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Content-Length', stats.size.toString());
    // Consider adding Cache-Control headers for production

    // Use ReadableStream for the response body
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        fileStream.on('end', () => {
          controller.close();
        });
        fileStream.on('error', (err) => {
          console.error('Stream error:', err);
          controller.error(err);
        });
      },
      cancel() {
        fileStream.destroy();
      }
    });

    return new NextResponse(readableStream, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('Error serving file:', error);
    return NextResponse.json({ error: 'Failed to serve file', details: error.message }, { status: 500 });
  }
}
