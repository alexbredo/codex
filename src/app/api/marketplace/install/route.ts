
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { MarketplaceItem, ValidationRuleset } from '@/lib/types';

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  const canInstall = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('marketplace:install');

  if (!currentUser || !canInstall) {
    return NextResponse.json({ error: 'Unauthorized to install marketplace items.' }, { status: 403 });
  }

  const db = await getDb();
  
  try {
    const item: MarketplaceItem = await request.json();
    const latestVersion = item.versions.find(v => v.version === item.latestVersion);

    if (!latestVersion) {
      return NextResponse.json({ error: 'Latest version payload not found in marketplace item.' }, { status: 400 });
    }

    switch (item.type) {
      case 'validation_rule':
        const payload = latestVersion.payload as ValidationRuleset;
        // Using INSERT OR IGNORE to handle primary key conflicts gracefully.
        // It will not update if an item with the same ID exists.
        // This is the desired behavior for retaining UUIDs.
        const result = await db.run(
          `INSERT INTO validation_rulesets (id, name, description, regexPattern) 
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             regexPattern = excluded.regexPattern`,
          payload.id,
          payload.name,
          payload.description,
          payload.regexPattern
        );
        if (result.changes > 0) {
            return NextResponse.json({ success: true, message: `Successfully installed/updated validation rule "${payload.name}".` });
        } else {
            return NextResponse.json({ success: true, message: `Validation rule "${payload.name}" is already up to date.` });
        }
      
      // Future cases for other item types
      // case 'model':
      // case 'workflow':

      default:
        return NextResponse.json({ error: `Unsupported item type: ${item.type}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error("Marketplace Install API Error:", error);
    return NextResponse.json({ error: 'Failed to install item.', details: error.message }, { status: 500 });
  }
}
