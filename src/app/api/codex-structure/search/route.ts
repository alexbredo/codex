
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, DataObject, Property } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { getObjectDisplayValue } from '@/lib/utils';

interface SearchResult {
  object: DataObject;
  model: Model;
  displayValue: string;
  matchContext?: string;
  score: number;
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    const db = await getDb();
    
    // Fetch all models and properties once for processing results
    const allModels: Model[] = await db.all('SELECT id, name, displayPropertyNames FROM models');
    const allProperties: Property[] = await db.all('SELECT id, model_id, name, type FROM properties');
    
    for (const model of allModels) {
        try {
            model.displayPropertyNames = model.displayPropertyNames ? JSON.parse(model.displayPropertyNames as any) : [];
        } catch {
            model.displayPropertyNames = [];
        }
        model.properties = allProperties.filter(p => p.model_id === model.id);
    }

    // --- Advanced Query Parsing ---
    const filters: { type: 'model' | 'property'; key: string; value: string }[] = [];
    let fullTextQuery = query;

    const filterRegex = /(\w+):(?:("([^"]+)")|(\S+))/g;
    let match;
    while ((match = filterRegex.exec(query)) !== null) {
      const key = match[1].toLowerCase();
      const value = match[3] ?? match[4];
      
      if (key === 'model') {
        filters.push({ type: 'model', key, value });
      } else {
        filters.push({ type: 'property', key, value });
      }
      
      fullTextQuery = fullTextQuery.replace(match[0], '').trim();
    }
    const fullTextTerms = fullTextQuery.toLowerCase().split(' ').filter(Boolean);
    // --- End Parsing ---

    let sqlQuery = `SELECT d.id, d.model_id, d.data FROM data_objects d`;
    const joins: string[] = [];
    const whereClauses: string[] = ['(d.isDeleted = 0 OR d.isDeleted IS NULL)'];
    const queryParams: any[] = [];

    const modelFilter = filters.find(f => f.type === 'model');
    if (modelFilter) {
      joins.push(`JOIN models m ON d.model_id = m.id`);
      // Use LIKE for more flexible model name matching
      whereClauses.push(`LOWER(m.name) LIKE ?`);
      queryParams.push(`%${modelFilter.value.toLowerCase()}%`);
    }

    const propertyFilters = filters.filter(f => f.type === 'property');
    if (propertyFilters.length > 0) {
      propertyFilters.forEach((filter) => {
        // Using LIKE for broader matching on string properties.
        whereClauses.push(`LOWER(json_extract(d.data, ?)) LIKE ?`);
        queryParams.push(`$.${filter.key}`);
        queryParams.push(`%${filter.value.toLowerCase()}%`);
      });
    }
    
    sqlQuery += ` ${[...new Set(joins)].join(' ')}`; // Use Set to avoid duplicate joins
    if (whereClauses.length > 0) {
      sqlQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    sqlQuery += ` LIMIT 200`; // Limit initial results to prevent performance issues

    const filteredObjectRows = await db.all(sqlQuery, ...queryParams);
    
    // Now, perform full-text search on the narrowed down results in JS
    let searchResults: SearchResult[] = [];

    if (fullTextTerms.length > 0) {
        for (const row of filteredObjectRows) {
            // Search within the object's data AND its model's name for better relevance
            const objectDataString = row.data.toLowerCase();
            const modelForObject = allModels.find(m => m.id === row.model_id);
            const modelNameString = modelForObject?.name.toLowerCase() || '';

            let matchesAllTerms = true;
            for (const term of fullTextTerms) {
                if (!objectDataString.includes(term) && !modelNameString.includes(term)) {
                    matchesAllTerms = false;
                    break;
                }
            }
            if (matchesAllTerms && modelForObject) {
                const data: DataObject = { id: row.id, ...JSON.parse(row.data) };
                searchResults.push({
                    object: data,
                    model: modelForObject,
                    displayValue: '', // Will be hydrated below
                    score: 1 
                });
            }
        }
    } else {
        // If no full text terms, all SQL results are valid
        searchResults = filteredObjectRows.map(row => {
            const modelForObject = allModels.find(m => m.id === row.model_id);
            if (!modelForObject) return null;
            const data: DataObject = { id: row.id, ...JSON.parse(row.data) };
            return {
                object: data,
                model: modelForObject,
                displayValue: '',
                score: 1
            };
        }).filter(Boolean) as SearchResult[];
    }

    // Hydrate display values for all results
    // This is inefficient but necessary until we have a better display name resolution system
    const allObjectsRawForDisplayValue = await db.all('SELECT id, model_id, data FROM data_objects WHERE isDeleted = 0 OR isDeleted IS NULL');
    const allObjectsForDisplayValue: Record<string, DataObject[]> = {};
    for(const row of allObjectsRawForDisplayValue) {
        if (!allObjectsForDisplayValue[row.model_id]) {
            allObjectsForDisplayValue[row.model_id] = [];
        }
        allObjectsForDisplayValue[row.model_id].push({ id: row.id, ...JSON.parse(row.data) });
    }

    searchResults.forEach(result => {
        result.displayValue = getObjectDisplayValue(result.object, result.model, allModels, allObjectsForDisplayValue);
    });

    searchResults.sort((a, b) => b.score - a.score);

    return NextResponse.json(searchResults.slice(0, 50));

  } catch (error: any) {
    console.error('API Search Error:', error);
    return NextResponse.json({ error: 'Failed to perform search', details: error.message }, { status: 500 });
  }
}
