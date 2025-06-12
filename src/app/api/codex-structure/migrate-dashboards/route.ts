 'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const dashboards = await db.all('SELECT * FROM dashboards');

    for (const dashboard of dashboards) {
      let widgets;
      try {
        widgets = JSON.parse(dashboard.widgets || '[]');
      } catch (error) {
        console.error('Error parsing widgets for dashboard:', dashboard.id, error);
        continue; // Skip to the next dashboard
      }

      let updated = false;
      for (const widget of widgets) {
        if (!uuidValidate(widget.id)) {
          // If not a valid UUID, generate a new one
          widget.id = uuidv4();
          updated = true;
        }
      }

      if (updated) {
        try {
          await db.run(
            'UPDATE dashboards SET widgets = ? WHERE id = ?',
            JSON.stringify(widgets),
            dashboard.id
          );
          console.log('Migrated dashboard:', dashboard.id);
        } catch (error) {
          console.error('Error updating dashboard:', dashboard.id, error);
        }
      }
    }

    return NextResponse.json({ message: 'Dashboard migration complete.' });
  } catch (error: any) {
    console.error('API Error (GET /migrate-dashboards):', error);
    return NextResponse.json({ error: 'Failed to migrate dashboards', details: error.message }, { status: 500 });
  }
}
