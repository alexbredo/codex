 'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Dashboard, WidgetInstance } from '@/lib/types';
import { z } from 'zod';

// Basic schema for widget instance validation during save
const widgetInstanceSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal('dataSummary'),
    config: z.object({
      title: z.string().optional(),
      summaryType: z.enum(['totalModels', 'totalObjects']).optional()
    }).optional(),
    gridConfig: z.object({
      colSpan: z.number().optional(),
      rowSpan: z.number().optional(),
      order: z.number().optional(),
    }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal('modelCountChart'),
    config: z.object({
      title: z.string().optional(),
    }).optional(),
    gridConfig: z.object({
      colSpan: z.number().optional(),
      rowSpan: z.number().optional(),
      order: z.number().optional(),
    }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal('quickStart'),
    config: z.object({
      title: z.string().optional(),
    }).optional(),
    gridConfig: z.object({
      colSpan: z.number().optional(),
      rowSpan: z.number().optional(),
      order: z.number().optional(),
    }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal('numericSummary'),
    config: z.object({
      title: z.string().optional(),
      modelId: z.string().optional(),
      propertyId: z.string().optional(),
      calculationType: z.enum(['min', 'max', 'sum', 'avg']).optional(),
    }).optional(),
    gridConfig: z.object({
      colSpan: z.number().optional(),
      rowSpan: z.number().optional(),
      order: z.number().optional(),
    }),
  })
]);

const dashboardPayloadSchema = z.object({
  name: z.string().min(1, "Dashboard name is required."),
  widgets: z.array(widgetInstanceSchema),
});


export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const dashboardRow = await db.get(
      'SELECT * FROM dashboards WHERE userId = ? ORDER BY isDefault DESC, createdAt DESC LIMIT 1',
      currentUser.id
    );

    if (!dashboardRow) {
      return NextResponse.json(null, { status: 200 }); // No dashboard found, return null for client to handle
    }

    const dashboard: Dashboard = {
      id: dashboardRow.id,
      userId: dashboardRow.userId,
      name: dashboardRow.name,
      isDefault: !!dashboardRow.isDefault,
      widgets: JSON.parse(dashboardRow.widgets || '[]') as WidgetInstance[],
      createdAt: dashboardRow.createdAt,
      updatedAt: dashboardRow.updatedAt,
    };
    return NextResponse.json(dashboard);
  } catch (error: any) {
    console.error('API Error (GET /user-dashboard):', error);
    return NextResponse.json({ error: 'Failed to fetch user dashboard', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getDb();
  try {
    const body = await request.json();
    const validation = dashboardPayloadSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid dashboard data', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, widgets } = validation.data;
    const currentTimestamp = new Date().toISOString();

    // Begin transaction
    await db.exec('BEGIN');

    try {
      const existingDashboard = await db.get('SELECT id, createdAt FROM dashboards WHERE userId = ?', currentUser.id);

      let dashboardId: string;
      let createdAt: string;

      if (existingDashboard) {
        dashboardId = existingDashboard.id;
        createdAt = existingDashboard.createdAt;

        await db.run(
          'UPDATE dashboards SET name = ?, widgets = ?, updatedAt = ? WHERE id = ? AND userId = ?',
          name,
          JSON.stringify(widgets),
          currentTimestamp,
          dashboardId,
          currentUser.id
        );
      } else {
        dashboardId = crypto.randomUUID();
        createdAt = currentTimestamp;

        await db.run(
          'INSERT INTO dashboards (id, userId, name, widgets, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          dashboardId,
          currentUser.id,
          name,
          JSON.stringify(widgets),
          1, // First dashboard becomes default
          currentTimestamp,
          currentTimestamp
        );
      }

      // Commit transaction
      await db.exec('COMMIT');

      const savedDashboard: Dashboard = {
        id: dashboardId,
        userId: currentUser.id,
        name,
        isDefault: true,
        widgets,
        createdAt,
        updatedAt: currentTimestamp,
      };

      return NextResponse.json(savedDashboard, { status: existingDashboard ? 200 : 201 });
    } catch (transactionError: any) {
      // Rollback transaction on error
      await db.exec('ROLLBACK');
      console.error('API Error (POST /user-dashboard) - Transaction failed:', transactionError);
      return NextResponse.json({ error: 'Failed to save user dashboard due to a database error', details: transactionError.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('API Error (POST /user-dashboard):', error);
    return NextResponse.json({ error: 'Failed to save user dashboard', details: error.message }, { status: 500 });
  }
}
