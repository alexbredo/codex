
import { NextResponse } from 'next/server';
import { getCurrentUserFromCookie, DEBUG_MODE } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

async function ensureDirExists(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') { // Ignore error if directory already exists
      console.error(`Failed to create directory ${dirPath}:`, error);
      throw error; // Rethrow if it's a different error
    }
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to upload files' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const modelId = formData.get('modelId') as string | null;
    const objectId = formData.get('objectId') as string | null;
    const propertyName = formData.get('propertyName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (DEBUG_MODE) {
      console.log(`DEBUG_MODE: Simulating file upload for ${file.name}.`);
      // For general files, a generic placeholder or just the name might be sufficient
      const placeholderUrl = `/uploads/debug/${encodeURIComponent(file.name)}`; 
      return NextResponse.json({ success: true, url: placeholderUrl });
    }

    // Non-Debug mode: Actual file saving
    if (!modelId || !objectId || !propertyName) {
      return NextResponse.json({ error: 'Missing modelId, objectId, or propertyName for file storage path.' }, { status: 400 });
    }

    // Sanitize inputs for path construction (basic example)
    // Be more rigorous in a production environment if these come from untrusted user input
    const safeModelId = modelId.replace(/[^a-z0-9_-]/gi, '');
    const safeObjectId = objectId.replace(/[^a-z0-9_-]/gi, '');
    const safePropertyName = propertyName.replace(/[^a-z0-9_-]/gi, '');
    const safeFileName = file.name.replace(/[^a-z0-9_.-]/gi, ''); // Allow dots, underscores, and hyphens in filename

    if (!safeModelId || !safeObjectId || !safePropertyName || !safeFileName) {
        return NextResponse.json({ error: 'Invalid characters in path components or filename.' }, { status: 400 });
    }
    
    const propertyUploadPath = path.join(UPLOADS_DIR, safeModelId, safeObjectId, safePropertyName);
    await ensureDirExists(propertyUploadPath);

    const filePath = path.join(propertyUploadPath, safeFileName);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await fs.writeFile(filePath, buffer);
    console.log(`File saved to: ${filePath}`);

    const publicUrl = `/uploads/${safeModelId}/${safeObjectId}/${safePropertyName}/${safeFileName}`;

    return NextResponse.json({ success: true, url: publicUrl });

  } catch (error: any) {
    console.error('File Upload Error:', error);
    return NextResponse.json({ error: 'Failed to process file upload', details: error.message }, { status: 500 });
  }
}
