
import { NextResponse } from 'next/server';
import { getCurrentUserFromCookie, DEBUG_MODE } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

async function ensureDirExists(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      console.error(`Failed to create directory ${dirPath}:`, error);
      throw error;
    }
  }
}

const DISALLOWED_FILE_TYPES = [
    'application/x-msdownload', // .exe, .dll
    'application/x-dosexec',
    'application/x-sh',         // .sh
    'application/x-csh',
    'application/x-ms-shortcut', // .lnk
    'application/java-archive', // .jar
    'application/javascript',   // .js (can be dangerous if served incorrectly)
    'text/html'                 // .html
];
const MAX_FILE_SIZE_MB = 10;

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
    
    // --- Server-side validation ---
    if (DISALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `File type '${file.type}' is not allowed for security reasons.` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` }, { status: 400 });
    }
    // --- End validation ---

    if (DEBUG_MODE) {
      console.log(`DEBUG_MODE: Simulating file upload for ${file.name}.`);
      const placeholderUrl = `/uploads/debug/${encodeURIComponent(file.name)}`; 
      return NextResponse.json({ success: true, url: placeholderUrl });
    }

    if (!modelId || !objectId || !propertyName) {
      return NextResponse.json({ error: 'Missing modelId, objectId, or propertyName for file storage path.' }, { status: 400 });
    }

    const safeModelId = modelId.replace(/[^a-z0-9_-]/gi, '');
    const safeObjectId = objectId.replace(/[^a-z0-9_-]/gi, '');
    const safePropertyName = propertyName.replace(/[^a-z0-9_-]/gi, '');
    
    const fileExtension = path.extname(file.name);
    const uniqueFileName = `${uuidv4()}${fileExtension}`;

    if (!safeModelId || !safeObjectId || !safePropertyName || !uniqueFileName) {
        return NextResponse.json({ error: 'Invalid characters in path components or filename.' }, { status: 400 });
    }
    
    const propertyUploadPath = path.join(UPLOADS_DIR, safeModelId, safeObjectId, safePropertyName);
    await ensureDirExists(propertyUploadPath);

    const filePath = path.join(propertyUploadPath, uniqueFileName);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await fs.writeFile(filePath, buffer);
    console.log(`File saved to: ${filePath}`);

    const publicUrl = `/uploads/${safeModelId}/${safeObjectId}/${safePropertyName}/${uniqueFileName}`;

    return NextResponse.json({ success: true, url: publicUrl });

  } catch (error: any) {
    console.error('File Upload Error:', error);
    return NextResponse.json({ error: 'Failed to process file upload', details: error.message }, { status: 500 });
  }
}
