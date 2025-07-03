
'use client';

import * as React from 'react';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import type { Model, Property } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowRight, AlertTriangle, CheckCircle, Replace } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ObjectConverterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sourceModel: Model;
  objectIdsToConvert: string[];
  onSuccess: () => void;
}

const UNMAPPED_VALUE = "__UNMAPPED__";

export default function ObjectConverterDialog({ isOpen, onClose, sourceModel, objectIdsToConvert, onSuccess }: ObjectConverterDialogProps) {
  const { models } = useData();
  const { toast } = useToast();
  
  const [step, setStep] = React.useState(1);
  const [targetModelId, setTargetModelId] = React.useState<string | null>(null);
  const [propertyMappings, setPropertyMappings] = React.useState<Record<string, string | null>>({});
  const [deleteOriginals, setDeleteOriginals] = React.useState(true);
  const [isConverting, setIsConverting] = React.useState(false);

  const targetModel = React.useMemo(() => models.find(m => m.id === targetModelId), [models, targetModelId]);

  // Reset state when dialog opens or source model changes
  React.useEffect(() => {
    if (isOpen) {
      setStep(1);
      setTargetModelId(null);
      setPropertyMappings({});
      setDeleteOriginals(true);
      setIsConverting(false);
    }
  }, [isOpen, sourceModel]);

  // Auto-populate mappings when target model is selected
  React.useEffect(() => {
    if (targetModel) {
      const newMappings: Record<string, string | null> = {};
      targetModel.properties.forEach(targetProp => {
        // Simple name-based matching as a default
        const matchingSourceProp = sourceModel.properties.find(p => p.name.toLowerCase() === targetProp.name.toLowerCase() && p.type === targetProp.type);
        newMappings[targetProp.id] = matchingSourceProp ? matchingSourceProp.id : null;
      });
      setPropertyMappings(newMappings);
    }
  }, [targetModel, sourceModel]);

  const handleNextStep = () => setStep(prev => prev + 1);
  const handlePrevStep = () => setStep(prev => prev - 1);

  const handleConversion = async () => {
    if (!targetModel) return;

    // Final validation before submitting
    const unmappedRequired = targetModel.properties.filter(p => p.required && propertyMappings[p.id] === null);
    if (unmappedRequired.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Mapping Error',
        description: `Cannot proceed. The following required fields on "${targetModel.name}" must be mapped: ${unmappedRequired.map(p => p.name).join(', ')}.`,
      });
      return;
    }

    setIsConverting(true);
    try {
      const payload = {
        sourceModelId: sourceModel.id,
        targetModelId: targetModel.id,
        objectIds: objectIdsToConvert,
        mappings: propertyMappings,
        defaultValues: {}, // Not implemented in this version
        deleteOriginals,
      };
      
      const response = await fetch('/api/codex-structure/objects/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Conversion failed.');

      toast({ title: 'Conversion Complete', description: result.message });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Conversion Failed', description: error.message });
    } finally {
      setIsConverting(false);
    }
  };

  const usedSourcePropertyIds = React.useMemo(() => {
    return new Set(Object.values(propertyMappings).filter((id): id is string => !!id));
  }, [propertyMappings]);

  const unmappedSourceProperties = React.useMemo(() => {
    return sourceModel.properties.filter(p => !usedSourcePropertyIds.has(p.id));
  }, [sourceModel.properties, usedSourcePropertyIds]);


  const renderStepContent = () => {
    switch (step) {
      case 1: // Select Target Model
        return (
          <div className="space-y-4">
            <Label htmlFor="target-model-select">Convert to Model</Label>
            <Select onValueChange={setTargetModelId} value={targetModelId ?? undefined}>
              <SelectTrigger id="target-model-select">
                <SelectValue placeholder="Select a target model..." />
              </SelectTrigger>
              <SelectContent>
                {models.filter(m => m.id !== sourceModel.id).map(model => (
                  <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 2: // Map Properties
        if (!targetModel) return null;
        return (
          <div className="space-y-4">
             <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Property Mapping</AlertTitle>
              <AlertDescription>
                Map properties from the source model "{sourceModel.name}" to the target model "{targetModel.name}". Any required target fields must have a mapping.
              </AlertDescription>
            </Alert>
            <ScrollArea className="h-72 border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Target Field ({targetModel.name})</TableHead>
                            <TableHead>Source Field ({sourceModel.name})</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {targetModel.properties.map(targetProp => (
                            <TableRow key={targetProp.id}>
                                <TableCell>
                                    <span className="font-medium">{targetProp.name}</span>
                                    {targetProp.required && <span className="text-destructive ml-1">*</span>}
                                    <p className="text-xs text-muted-foreground">({targetProp.type})</p>
                                </TableCell>
                                <TableCell>
                                    <Select
                                        value={propertyMappings[targetProp.id] ?? UNMAPPED_VALUE}
                                        onValueChange={(value) => setPropertyMappings(prev => ({ ...prev, [targetProp.id]: value === UNMAPPED_VALUE ? null : value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select source property..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={UNMAPPED_VALUE}>-- Unmapped --</SelectItem>
                                            {sourceModel.properties.map(sourceProp => (
                                                <SelectItem key={sourceProp.id} value={sourceProp.id} disabled={sourceProp.type !== targetProp.type}>
                                                    {sourceProp.name} ({sourceProp.type})
                                                    {sourceProp.type !== targetProp.type && " (Incompatible)"}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
            {unmappedSourceProperties.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning: Unmapped Properties</AlertTitle>
                <AlertDescription>
                  The following source properties are not mapped and their data will be lost during conversion:
                  <ul className="mt-2 list-disc pl-5 space-y-1 text-xs">
                      {unmappedSourceProperties.map(p => <li key={p.id}>{p.name}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        );
      case 3: // Confirmation
        if (!targetModel) return null;
        return (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Confirm Conversion</AlertTitle>
              <AlertDescription>
                You are about to convert <strong>{objectIdsToConvert.length}</strong> object(s) from <strong>"{sourceModel.name}"</strong> to <strong>"{targetModel.name}"</strong>.
              </AlertDescription>
            </Alert>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="delete-originals-checkbox"
                checked={deleteOriginals}
                onCheckedChange={(checked) => setDeleteOriginals(!!checked)}
              />
              <Label htmlFor="delete-originals-checkbox">Delete original objects after successful conversion</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              This action cannot be easily undone. A new object will be created in the target model for each selected source object.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Replace /> Convert Objects
          </DialogTitle>
          <DialogDescription>
            Migrate selected objects from "{sourceModel.name}" to another model.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {renderStepContent()}
        </div>

        <DialogFooter>
          {step > 1 && <Button variant="outline" onClick={handlePrevStep} disabled={isConverting}>Back</Button>}
          {step < 3 ? (
            <Button onClick={handleNextStep} disabled={!targetModelId}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
          ) : (
            <Button onClick={handleConversion} disabled={isConverting} variant="destructive">
              {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Replace className="mr-2 h-4 w-4" />}
              Convert
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
