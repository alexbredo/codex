
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Model, DataObject, Property } from '@/lib/types';
import { format as formatDateFns, isValid as isDateValidFn } from 'date-fns';


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getObjectDisplayValue = (
    obj: DataObject | undefined,
    model: Model | undefined,
    allModels: Model[],
    allObjects: Record<string, DataObject[]>
): string => {
  if (!obj || !model) return obj?.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';

  if (model.displayPropertyNames && model.displayPropertyNames.length > 0) {
    const displayValues = model.displayPropertyNames
      .map(propName => {
        const propValue = obj[propName];
        if (propValue === null || typeof propValue === 'undefined' || String(propValue).trim() === '') {
          return null;
        }
        const propertyDefinition = model.properties.find(p => p.name === propName);
        if (propertyDefinition?.type === 'relationship' && propertyDefinition.relatedModelId) {
            const relatedModelForProp = allModels.find(m => m.id === propertyDefinition.relatedModelId);
            // Find the related object using its ID. If value is an array (many-to-many), this needs adjustment.
            // For now, assuming displayPropertyNames refer to single-value fields or the first of many for simplicity.
            const relatedObjectId = Array.isArray(propValue) ? propValue[0] : propValue;
            const relatedObjForProp = (allObjects[propertyDefinition.relatedModelId] || []).find(o => o.id === relatedObjectId);
            return getObjectDisplayValue(relatedObjForProp, relatedModelForProp, allModels, allObjects);
        }
        return String(propValue);
      })
      .filter(value => value !== null && value.trim() !== '');

    if (displayValues.length > 0) {
      return displayValues.join(' ');
    }
  }

  const nameProp = model.properties.find(p => p.name.toLowerCase() === 'name');
  if (nameProp && obj[nameProp.name] !== null && typeof obj[nameProp.name] !== 'undefined' && String(obj[nameProp.name]).trim() !== '') {
    return String(obj[nameProp.name]);
  }

  const titleProp = model.properties.find(p => p.name.toLowerCase() === 'title');
  if (titleProp && obj[titleProp.name] !== null && typeof obj[titleProp.name] !== 'undefined' && String(obj[titleProp.name]).trim() !== '') {
    return String(obj[titleProp.name]);
  }
  
  const firstStringProp = model.properties.find(p => p.type === 'string');
  if (firstStringProp && obj[firstStringProp.name] !== null && typeof obj[firstStringProp.name] !== 'undefined' && String(obj[firstStringProp.name]).trim() !== '') {
    return String(obj[firstStringProp.name]);
  }

  return obj.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';
};

export function getObjectGroupValue(
  obj: DataObject,
  groupingProperty: Property | undefined,
  allModels: Model[],
  allDbObjects: Record<string, DataObject[]>
): string {
  if (!groupingProperty) return "Uncategorized"; // Default group for unexpected cases
  const value = obj[groupingProperty.name];

  if (value === null || typeof value === 'undefined') {
    return "Not Set";
  }

  switch (groupingProperty.type) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date':
      try {
        const date = new Date(value);
        return isDateValidFn(date) ? formatDateFns(date, 'PPP') : `Invalid Date: ${String(value).substring(0,10)}`;
      } catch {
        return `Invalid Date Format: ${String(value).substring(0,10)}`;
      }
    case 'number':
    case 'rating': // Ratings can be grouped by their numeric value
      return String(value);
    case 'string':
    case 'markdown': // Group by the raw markdown string or a preview
    case 'image':    // Group by image URL string
      return String(value).trim() === '' ? '(Empty)' : String(value);
    case 'relationship':
      if (!groupingProperty.relatedModelId || groupingProperty.relationshipType === 'many') {
        return "N/A (Unsupported Grouping)";
      }
      const relatedModel = allModels.find(m => m.id === groupingProperty.relatedModelId);
      if (!relatedModel) return "N/A (Related Model Missing)";
      
      const relatedObj = (allDbObjects[groupingProperty.relatedModelId] || []).find(o => o.id === value);
      return getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
    default:
      const unhandledValue = String(value);
      return unhandledValue.trim() === '' ? '(Empty)' : unhandledValue;
  }
}

export const formatApiError = async (response: Response, defaultMessage: string): Promise<string> => {
  const status = response.status;
  const statusText = response.statusText;
  let responseBodyText = '';

  try {
    responseBodyText = await response.text();
  } catch (e) {
    return `${defaultMessage}. Status: ${status} - ${statusText || 'Could not read response body.'}`;
  }

  let errorData;
  try {
    errorData = JSON.parse(responseBodyText);
  } catch (e) {
    return `${defaultMessage}. Status: ${status} - ${statusText || 'Server returned a non-JSON response.'} Body: ${responseBodyText.substring(0, 200)}...`;
  }

  if (errorData && errorData.error) {
    let errorMessage = String(errorData.error);
    if (errorData.details) {
      errorMessage += ` (Details: ${ (typeof errorData.details === 'string') ? errorData.details : JSON.stringify(errorData.details) })`;
    }
    if (errorData.field && typeof errorData.field === 'string') {
      throw { message: errorMessage, field: errorData.field };
    }
    return errorMessage;
  }
  
  return `${defaultMessage}. Status: ${status} - ${statusText || 'Server did not provide a detailed error message.'}`;
};

export const mapDbModelToClientModel = (dbModel: any): Model => {
  let parsedDisplayPropertyNames: string[] = [];
  if (Array.isArray(dbModel.displayPropertyNames)) {
    parsedDisplayPropertyNames = dbModel.displayPropertyNames;
  } else if (typeof dbModel.displayPropertyNames === 'string') {
    try {
      const temp = JSON.parse(dbModel.displayPropertyNames);
      if (Array.isArray(temp)) {
        parsedDisplayPropertyNames = temp.filter((name: any) => typeof name === 'string');
      }
    } catch (e) {
      // console.warn(`Context: Could not parse displayPropertyNames for model ${dbModel.id}: '${dbModel.displayPropertyNames}'`, e);
    }
  }

  return {
    id: dbModel.id,
    name: dbModel.name,
    description: dbModel.description,
    modelGroupId: dbModel.modelGroupId ?? null,
    displayPropertyNames: parsedDisplayPropertyNames,
    workflowId: dbModel.workflowId === undefined ? null : dbModel.workflowId,
    properties: (dbModel.properties || []).map((p: any) => ({
      id: p.id || crypto.randomUUID(),
      model_id: p.model_id,
      name: p.name,
      type: p.type,
      relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
      required: p.required === 1 || p.required === true, 
      relationshipType: p.type === 'relationship' ? (p.relationshipType || 'one') : undefined,
      unit: p.type === 'number' ? p.unit : undefined,
      precision: p.type === 'number' ? (p.precision === undefined || p.precision === null || isNaN(Number(p.precision)) ? 2 : Number(p.precision)) : undefined,
      autoSetOnCreate: p.type === 'date' ? (p.autoSetOnCreate === 1 || p.autoSetOnCreate === true) : false,
      autoSetOnUpdate: p.type === 'date' ? (p.autoSetOnUpdate === 1 || p.autoSetOnUpdate === true) : false,
      isUnique: p.type === 'string' ? (p.isUnique === 1 || p.isUnique === true) : false,
      orderIndex: p.orderIndex ?? 0,
      defaultValue: p.defaultValue ?? null,
      validationRulesetId: p.validationRulesetId ?? null,
      minValue: p.minValue ?? null,
      maxValue: p.maxValue ?? null,
    })).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
  };
};
