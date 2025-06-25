
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, DataObject, Property } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { getObjectDisplayValue } from '@/lib/utils';

interface SearchResult {
  object: DataObject;
  model: Model;
  displayValue: string;
  matchContext?: string; // For future implementation
  score: number;
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase()?.trim();

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    const db = await getDb();
    
    // Fetch all data needed for display value resolution and searching
    const allModels: Model[] = await db.all('SELECT * FROM models');
    const allProperties: Property[] = await db.all('SELECT * FROM properties');
    const allObjectsRaw = await db.all('SELECT id, model_id, data FROM data_objects WHERE isDeleted = 0 OR isDeleted IS NULL');
    
    const allObjects: Record<string, DataObject[]> = {};
    for(const row of allObjectsRaw) {
        if (!allObjects[row.model_id]) {
            allObjects[row.model_id] = [];
        }
        allObjects[row.model_id].push({ id: row.id, ...JSON.parse(row.data) });
    }

    for (const model of allModels) {
        model.properties = allProperties.filter(p => p.model_id === model.id);
        try {
            model.displayPropertyNames = JSON.parse(model.displayPropertyNames || '[]');
        } catch {
            model.displayPropertyNames = [];
        }
    }

    let modelFilter: string | null = null;
    const modelFilterMatch = query.match(/model:(\w+)/);
    let searchQuery = query;

    if (modelFilterMatch) {
        modelFilter = modelFilterMatch[1];
        searchQuery = query.replace(modelFilterMatch[0], '').trim();
    }
    
    let objectsToSearch = allObjectsRaw;
    if (modelFilter) {
        const targetModel = allModels.find(m => m.name.toLowerCase() === modelFilter);
        if (targetModel) {
            objectsToSearch = allObjectsRaw.filter(obj => obj.model_id === targetModel.id);
        } else {
            // If model filter doesn't match any model, return no results
            return NextResponse.json([]);
        }
    }
    
    if (!searchQuery) {
        // If only a model filter was provided, return all objects for that model
        const results: SearchResult[] = objectsToSearch.map(row => {
            const model = allModels.find(m => m.id === row.model_id);
            if (!model) return null;
            const objectData = { id: row.id, ...JSON.parse(row.data) };
            const displayValue = getObjectDisplayValue(objectData, model, allModels, allObjects);
            return {
                object: objectData,
                model: model,
                displayValue: displayValue,
                score: 1 // Default score
            };
        }).filter(Boolean) as SearchResult[];
        return NextResponse.json(results.slice(0, 50)); // Limit results
    }

    const searchResults: SearchResult[] = [];
    const searchTerms = searchQuery.split(' ').filter(Boolean);

    for (const row of objectsToSearch) {
      const data: DataObject = { id: row.id, ...JSON.parse(row.data) };
      const modelForObject = allModels.find(m => m.id === row.model_id);
      if (!modelForObject) continue;

      let score = 0;
      let matchesAllTerms = true;

      const objectString = JSON.stringify(data).toLowerCase();

      for (const term of searchTerms) {
        if (objectString.includes(term)) {
            score += 1;
        } else {
            matchesAllTerms = false;
            break;
        }
      }

      if (matchesAllTerms && score > 0) {
        const displayValue = getObjectDisplayValue(data, modelForObject, allModels, allObjects);
        searchResults.push({
          object: data,
          model: modelForObject,
          displayValue: displayValue,
          score,
        });
      }
    }

    searchResults.sort((a, b) => b.score - a.score);

    return NextResponse.json(searchResults.slice(0, 50)); // Limit results

  } catch (error: any) {
    console.error('API Search Error:', error);
    return NextResponse.json({ error: 'Failed to perform search', details: error.message }, { status: 500 });
  }
}
