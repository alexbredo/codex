
import { NextResponse } from 'next/server';
import { getCurrentUserFromCookie } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';

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

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_SIZE_MB = 5;

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const modelId = formData.get('modelId') as string | null;
    const objectId = formData.get('objectId') as string | null;
    const propertyName = formData.get('propertyName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!modelId || !objectId || !propertyName) {
      return NextResponse.json({ error: 'Missing modelId, objectId, or propertyName for file storage path.' }, { status: 400 });
    }

    // --- Permission Check ---
    const db = await getDb();
    const objForPermCheck = await db.get('SELECT ownerId FROM data_objects WHERE id = ?', objectId);
    const isOwner = objForPermCheck?.ownerId === currentUser?.id;
    const canEdit = currentUser?.permissionIds.includes(`model:edit:${modelId}`) || (currentUser?.permissionIds.includes('objects:edit_own') && isOwner);

    if (!currentUser || (!currentUser.permissionIds.includes('*') && !canEdit)) {
      return NextResponse.json({ error: 'Unauthorized to upload image for this object' }, { status: 403 });
    }
    // --- End Permission Check ---
    
    // --- Server-side validation ---
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type. Allowed types are: ${ALLOWED_IMAGE_TYPES.join(', ')}` }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File is too large. Maximum size is ${MAX_IMAGE_SIZE_MB}MB.` }, { status: 400 });
    }
    // --- End validation ---

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
    console.error('Image Upload Error (POST /api/codex-structure/upload-image):', error);
    return NextResponse.json({ error: 'Failed to process image upload', details: error.message }, { status: 500 });
  }
}
