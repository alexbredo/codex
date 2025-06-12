 'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { Model, DataObject, NumericSummaryWidgetConfig, Property, PropertyType } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NumericSummaryWidgetProps {
  config: NumericSummaryWidgetConfig;
  isEditMode: boolean;
  onConfigChange: (newConfig: NumericSummaryWidgetConfig) => void;
}

async function fetchData(modelId: string | undefined): Promise<{ model: Model | undefined, dataObjects: DataObject[] }> {
  if (!modelId) {
    return { model: undefined, dataObjects: [] };
  }
  const modelResponse = await fetch(`/api/codex-structure/models/${modelId}`);
  const model = await modelResponse.json() as Model;
  const dataObjectsResponse = await fetch(`/api/data-weaver/models/${modelId}/objects/all`);
  const dataObjects = await dataObjectsResponse.json() as DataObject[];
  return { model, dataObjects };
}

async function fetchModels(): Promise<Model[]> {
  const response = await fetch('/api/codex-structure/models');
  const models = await response.json() as Model[];
  return models;
}

export default function NumericSummaryWidget({ config, isEditMode, onConfigChange }: NumericSummaryWidgetProps) {
  const { modelId, propertyId, calculationType, title } = config;
  const [selectedModelId, setSelectedModelId] = useState(modelId || '');
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyId || '');
  const [selectedCalculationType, setSelectedCalculationType] = useState(calculationType || 'sum');
  const [widgetTitle, setWidgetTitle] = useState(title || 'Numeric Summary');

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: [`numericSummary-${selectedModelId}-${selectedPropertyId}`],
    queryFn: () => fetchData(selectedModelId),
    enabled: !!selectedModelId,
  });

  const { data: models, isLoading: isLoadingModels, error: errorModels } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  });

  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    setResult(null);
    console.log('useEffect triggered');
    console.log('data:', data);

    if (data && data.dataObjects && data.model) {
      console.log('data.dataObjects:', data.dataObjects);
      console.log('data.model:', data.model);
      console.log('selectedPropertyId:', selectedPropertyId);
      const values = data.dataObjects.map(obj => {
          try {
            const parsedData = JSON.parse(obj.data);
            const property = data.model.properties.find(p => p.id === selectedPropertyId);
            console.log('property:', property);
            if (property?.type === 'number' && parsedData && parsedData.hasOwnProperty(property.name)) {
              console.log('parsedData[property.name]:', parsedData[property.name]);
              return Number(parsedData[property.name]);
            } else {
              return null; // non numeric value
            }
          } catch (e) {
            console.error("Error parsing data or accessing property", e);
            return null;
          }
        }).filter(value => value !== null) as number[]; // consider only numbers

        console.log('values:', values);

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
    }
  }, [data, selectedCalculationType, selectedPropertyId]);

  useEffect(() => {
    if (models && selectedModelId && selectedPropertyId && selectedCalculationType) {
      const model = models.find(m => m.id === selectedModelId);
      const property = data?.model?.properties?.find(p => p.id === selectedPropertyId);
      const calculationTypeDisplay = selectedCalculationType.charAt(0).toUpperCase() + selectedCalculationType.slice(1);
      const newTitle = `${calculationTypeDisplay} of ${property?.name ?? 'Property'} on ${model?.name ?? 'Model'}`;
      setWidgetTitle(newTitle);
      onConfigChange({ ...config, title: newTitle, modelId: selectedModelId, propertyId: selectedPropertyId, calculationType: selectedCalculationType });
    } else {
      setWidgetTitle('Numeric Summary');
    }
  }, [models, selectedModelId, selectedPropertyId, selectedCalculationType, onConfigChange]);

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    setSelectedPropertyId(''); // Reset property when model changes
  };

  const handlePropertyChange = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
  };

  const handleCalculationTypeChange = (calculationType: string) => {
    setSelectedCalculationType(calculationType as 'min' | 'max' | 'sum' | 'avg');
  };

  const numericProperties = data?.model?.properties?.filter(prop => prop.type === 'number');

  if (isLoadingModels) return <Card><CardHeader><CardTitle>{widgetTitle || 'Loading...'}</CardTitle></CardHeader><CardContent>Loading Models...</CardContent></Card>;
  if (errorModels) return <Card><CardHeader><CardTitle className="text-sm font-medium text-destructive">Error</CardTitle></CardHeader><CardContent>Error loading models.</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{widgetTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isEditMode ? (
          <div className="flex flex-col gap-2">
            <Select value={selectedModelId} onValueChange={handleModelChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                {models?.map(model => (
                  <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedPropertyId} onValueChange={handlePropertyChange} disabled={!selectedModelId || isFetching}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={isFetching ? "Loading Properties..." : "Select Property"} />
              </SelectTrigger>
              <SelectContent>
                {isFetching ? null : (numericProperties?.length === 0 ? <SelectItem disabled value="">No numeric properties</SelectItem> : numericProperties?.map(property => (
                    <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                  )))
                }
              </SelectContent>
            </Select>

            <Select value={selectedCalculationType} onValueChange={handleCalculationTypeChange}>
              <SelectTrigger className="w-[200px]">
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
            {isLoading && <div>Loading...</div>}
            {error && <div>Error loading data.</div>}
            {result !== null ? (
              <div className="text-2xl font-bold">{result}</div>
            ) : (
              <div className="text-muted-foreground">No data available.</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
