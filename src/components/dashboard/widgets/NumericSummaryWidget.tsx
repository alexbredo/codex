
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import type { Model, DataObject, NumericSummaryWidgetConfig, Property, PropertyType } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react'; // Added Loader2 for loading states

interface NumericSummaryWidgetProps {
  config: NumericSummaryWidgetConfig;
  isEditMode: boolean;
  onConfigChange: (newConfig: NumericSummaryWidgetConfig) => void;
}

const INTERNAL_NO_MODEL_SELECTED = "__NO_MODEL_SELECTED__";
const INTERNAL_NO_PROPERTY_SELECTED = "__NO_PROPERTY_SELECTED__";

async function fetchData(modelId: string | undefined): Promise<{ model: Model | undefined, dataObjects: DataObject[] }> {
  if (!modelId) {
    return { model: undefined, dataObjects: [] };
  }
  // Fetch the specific model to get its properties
  const modelResponse = await fetch(`/api/codex-structure/models/${modelId}`);
  if (!modelResponse.ok) {
    // Consider how to handle error here, maybe throw or return undefined model
    console.error(`Failed to fetch model ${modelId}: ${modelResponse.status}`);
    return { model: undefined, dataObjects: [] };
  }
  const model = await modelResponse.json() as Model;

  // Fetch all objects for that model
  // The API /api/codex-structure/models/[modelId]/objects/all returns ALL objects for a model,
  // not /api/data-weaver/...
  const dataObjectsResponse = await fetch(`/api/codex-structure/models/${modelId}/objects`);
  if (!dataObjectsResponse.ok) {
    console.error(`Failed to fetch objects for model ${modelId}: ${dataObjectsResponse.status}`);
    return { model, dataObjects: [] }; // Return model but empty objects
  }
  const dataObjects = await dataObjectsResponse.json() as DataObject[];
  return { model, dataObjects };
}


async function fetchModels(): Promise<Model[]> {
  const response = await fetch('/api/codex-structure/models');
  if (!response.ok) {
    // Handle error appropriately
    console.error("Failed to fetch models list:", response.status);
    return [];
  }
  const models = await response.json() as Model[];
  return models;
}

export default function NumericSummaryWidget({ config, isEditMode, onConfigChange }: NumericSummaryWidgetProps) {
  const { modelId, propertyId, calculationType, title } = config;
  const [selectedModelId, setSelectedModelId] = useState(modelId || '');
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId || '');
  const [selectedCalculationType, setSelectedCalculationType] = useState(calculationType || 'sum');
  const [widgetTitle, setWidgetTitle] = useState(title || 'Numeric Summary');

  const { data: queryData, isLoading, error: queryError, isFetching } = useQuery({
    queryKey: [`numericSummary-${selectedModelId}`], // Query per model
    queryFn: () => fetchData(selectedModelId),
    enabled: !!selectedModelId,
  });

  const { data: models, isLoading: isLoadingModels, error: errorModels } = useQuery({
    queryKey: ['modelsListForNumericWidget'], // Distinct queryKey
    queryFn: fetchModels,
  });

  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    setResult(null); // Reset result when dependencies change

    if (queryData && queryData.dataObjects && queryData.model && selectedPropertyId) {
      const propertyDefinition = queryData.model.properties.find(p => p.id === selectedPropertyId);

      if (propertyDefinition?.type !== 'number') {
        // console.warn(`Selected property ${selectedPropertyId} is not a number type.`);
        setResult(null);
        return;
      }

      const values = queryData.dataObjects.map(obj => {
        // Properties are directly on obj, not nested under obj.data after API parsing
        if (obj && obj.hasOwnProperty(propertyDefinition.name)) {
          const rawValue = obj[propertyDefinition.name];
          const numericValue = Number(rawValue);
          return isNaN(numericValue) ? null : numericValue;
        }
        return null;
      }).filter(value => value !== null) as number[];

      let calculatedResult: number | null = null;

      if (values.length > 0) {
        switch (selectedCalculationType) {
          case 'min':
            calculatedResult = Math.min(...values);
            break;
          case 'max':
            calculatedResult = Math.max(...values);
            break;
          case 'sum':
            calculatedResult = values.reduce((sum, value) => sum + value, 0);
            break;
          case 'avg':
            calculatedResult = values.reduce((sum, value) => sum + value, 0) / values.length;
            break;
        }
      }
      setResult(calculatedResult);
    }
  }, [queryData, selectedCalculationType, selectedPropertyId]);

  useEffect(() => {
    if (models && selectedModelId && selectedPropertyId && selectedCalculationType) {
      const model = models.find(m => m.id === selectedModelId);
      // queryData.model might be from a previous selection if selectedModelId changed.
      // It's safer to find the property from the currently fetched model's data.
      const currentModelData = queryData?.model?.id === selectedModelId ? queryData.model : null;
      const property = currentModelData?.properties?.find(p => p.id === selectedPropertyId);
      
      const calculationTypeDisplay = selectedCalculationType.charAt(0).toUpperCase() + selectedCalculationType.slice(1);
      const newTitle = `${calculationTypeDisplay} of ${property?.name ?? 'Property'} on ${model?.name ?? 'Model'}`;
      
      if (widgetTitle !== newTitle) {
        setWidgetTitle(newTitle);
      }
      // Only call onConfigChange if the config relevant values have actually changed from props
      if (config.title !== newTitle || config.modelId !== selectedModelId || config.propertyId !== selectedPropertyId || config.calculationType !== selectedCalculationType) {
        onConfigChange({ ...config, title: newTitle, modelId: selectedModelId, propertyId: selectedPropertyId, calculationType: selectedCalculationType });
      }
    } else {
      if (widgetTitle !== 'Numeric Summary') {
        setWidgetTitle('Numeric Summary');
      }
    }
  }, [models, selectedModelId, selectedPropertyId, selectedCalculationType, onConfigChange, config, queryData, widgetTitle]);


  const handleModelChange = (newModelIdValue: string) => {
    const actualModelId = newModelIdValue === INTERNAL_NO_MODEL_SELECTED ? '' : newModelIdValue;
    setSelectedModelId(actualModelId);
    setSelectedPropertyId(''); // Reset property when model changes
    setResult(null);
  };

  const handlePropertyChange = (newPropertyIdValue: string) => {
    const actualPropertyId = newPropertyIdValue === INTERNAL_NO_PROPERTY_SELECTED ? '' : newPropertyIdValue;
    setSelectedPropertyId(actualPropertyId);
    setResult(null);
  };

  const handleCalculationTypeChange = (newCalcType: string) => {
    setSelectedCalculationType(newCalcType as 'min' | 'max' | 'sum' | 'avg');
    setResult(null);
  };

  const numericProperties = queryData?.model?.properties?.filter(prop => prop.type === 'number') || [];

  if (isLoadingModels) {
    return (
      <Card>
        <CardHeader><CardTitle>{widgetTitle || 'Loading Configuration...'}</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading models...</span>
        </CardContent>
      </Card>
    );
  }
  if (errorModels) {
     return (
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-destructive">Error</CardTitle></CardHeader>
        <CardContent className="text-xs text-destructive-foreground bg-destructive/80 p-2 rounded">Error loading models list: {errorModels.message}</CardContent>
      </Card>
    );
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle>{widgetTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isEditMode ? (
          <div className="flex flex-col gap-3">
            <Select
              value={selectedModelId || INTERNAL_NO_MODEL_SELECTED}
              onValueChange={handleModelChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INTERNAL_NO_MODEL_SELECTED}>-- Select a Model --</SelectItem>
                {models?.map(model => (
                  <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedPropertyId || INTERNAL_NO_PROPERTY_SELECTED}
              onValueChange={handlePropertyChange}
              disabled={!selectedModelId || isFetching}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={isFetching ? "Loading Properties..." : "Select Numeric Property"} />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value={INTERNAL_NO_PROPERTY_SELECTED}>-- Select a Property --</SelectItem>
                {isFetching ? null : (numericProperties.length === 0 && selectedModelId ? 
                    <SelectItem disabled value="no-numeric-props">No numeric properties in model</SelectItem> 
                    : numericProperties.map(property => (
                        <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                      )))}
              </SelectContent>
            </Select>

            <Select value={selectedCalculationType} onValueChange={handleCalculationTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Calculation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">Sum</SelectItem>
                <SelectItem value="avg">Average</SelectItem>
                <SelectItem value="min">Minimum</SelectItem>
                <SelectItem value="max">Maximum</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <> 
            {isLoading && selectedModelId && (
                <div className="flex items-center justify-center h-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground text-sm">Loading data...</span>
                </div>
            )}
            {queryError && <div className="text-sm text-destructive p-2 rounded bg-destructive/10">Error: {queryError.message}</div>}
            {!isLoading && !queryError && result !== null && (
              <div className="text-3xl font-bold text-primary">{result.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            )}
            {!isLoading && !queryError && result === null && !selectedModelId && (
              <div className="text-muted-foreground text-sm">Please select a model in edit mode.</div>
            )}
             {!isLoading && !queryError && result === null && selectedModelId && !selectedPropertyId && (
              <div className="text-muted-foreground text-sm">Please select a property in edit mode.</div>
            )}
             {!isLoading && !queryError && result === null && selectedModelId && selectedPropertyId && (
              <div className="text-muted-foreground text-sm">No data to calculate or property not found.</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

