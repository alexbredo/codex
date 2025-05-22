import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Model, DataObject } from '@/lib/types';

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
            const relatedObjForProp = (allObjects[propertyDefinition.relatedModelId] || []).find(o => o.id === propValue);
            // Recursive call to handle nested display properties
            return getObjectDisplayValue(relatedObjForProp, relatedModelForProp, allModels, allObjects);
        }
        return String(propValue);
      })
      .filter(value => value !== null && value.trim() !== '');

    if (displayValues.length > 0) {
      return displayValues.join(' - ');
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
