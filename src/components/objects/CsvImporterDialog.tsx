
'use client';

import * as React from 'react';
import Papa from 'papaparse';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import type { Model, Property } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowRight, ArrowLeft, UploadCloud, AlertTriangle, FileUp, CheckCircle } from 'lucide-react';

interface CsvImporterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  model: Model;
  onSuccess: () => void;
}

type ImportStep = 'upload' | 'mapping' | 'confirm' | 'result';
type CsvRow = Record<string, string>;

interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: { row: number; field: string; message: string; value: any }[];
}

export function CsvImporterDialog({ isOpen, onClose, model, onSuccess }: CsvImporterDialogProps) {
  const { toast } = useToast();
  const { models: allModels } = useData();

  const [step, setStep] = React.useState<ImportStep>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [delimiter, setDelimiter] = React.useState<string>(',');
  const [parsedData, setParsedData] = React.useState<CsvRow[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  
  // Mapping state: targetPropId -> sourceCsvHeader
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  // Relationship lookup mapping: targetPropId -> lookupPropertyId
  const [relationshipLookups, setRelationshipLookups] = React.useState<Record<string, string>>({});
  
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens
      setStep('upload');
      setFile(null);
      setParsedData([]);
      setHeaders([]);
      setMappings({});
      setRelationshipLookups({});
      setIsProcessing(false);
      setImportResult(null);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseCsv = () => {
    if (!file) {
      toast({ variant: 'destructive', title: 'No file selected.' });
      return;
    }
    setIsProcessing(true);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      complete: (results) => {
        if (results.errors.length) {
          toast({ variant: 'destructive', title: 'CSV Parsing Error', description: results.errors[0].message });
          setIsProcessing(false);
          return;
        }
        setHeaders(results.meta.fields || []);
        setParsedData(results.data);
        setStep('mapping');
        setIsProcessing(false);
      },
      error: (error) => {
        toast({ variant: 'destructive', title: 'CSV Parsing Failed', description: error.message });
        setIsProcessing(false);
      }
    });
  };

  const handleImport = async () => {
    setIsProcessing(true);
    setImportResult(null);
    try {
      const response = await fetch(`/api/codex-structure/import/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetModelId: model.id,
          dataToImport: parsedData,
          mappings,
          relationshipLookups,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Import failed on the server.');
      }
      setImportResult(result);
      setStep('result');
      if (result.successCount > 0) {
        onSuccess();
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Import Failed', description: error.message });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const unmappedProperties = model.properties.filter(p => !mappings[p.id]);

  const renderStepContent = () => {
    switch(step) {
      case 'upload':
        return (
          <div className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="csv-file">Upload CSV File</Label>
              <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} />
            </div>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="delimiter">Delimiter</Label>
              <Select value={delimiter} onValueChange={setDelimiter}>
                <SelectTrigger id="delimiter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Comma (,)</SelectItem>
                  <SelectItem value=";">Semicolon (;)</SelectItem>
                  <SelectItem value="\t">Tab</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'mapping':
        return (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Map Your Data</AlertTitle>
              <AlertDescription>Match columns from your CSV to properties in the "{model.name}" model. Required fields are marked with <span className="text-destructive">*</span>.</AlertDescription>
            </Alert>
            <ScrollArea className="h-72 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model Property</TableHead>
                    <TableHead>CSV Column</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.properties.map(prop => (
                    <TableRow key={prop.id}>
                      <TableCell>
                        <Label>{prop.name} {prop.required && <span className="text-destructive">*</span>}</Label>
                        <p className="text-xs text-muted-foreground">({prop.type})</p>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mappings[prop.id] || ''}
                          onValueChange={(value) => setMappings(prev => ({ ...prev, [prop.id]: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Select CSV column..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">-- Do Not Import --</SelectItem>
                            {headers.map(header => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {prop.type === 'relationship' && mappings[prop.id] && (
                          <div className="mt-2 pl-2 border-l-2">
                             <Label className="text-xs">Lookup by field:</Label>
                             <Select
                                value={relationshipLookups[prop.id] || ''}
                                onValueChange={(value) => setRelationshipLookups(prev => ({...prev, [prop.id]: value}))}
                             >
                               <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select lookup field..." /></SelectTrigger>
                               <SelectContent>
                                {allModels.find(m => m.id === prop.relatedModelId)?.properties.filter(p=>p.type === 'string' || p.type === 'number').map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                               </SelectContent>
                             </Select>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
             {unmappedProperties.length > 0 && (
                <Alert variant="destructive">
                    <AlertTitle>Warning: Unmapped Properties</AlertTitle>
                    <AlertDescription className="text-xs">
                        The following properties will not be imported: {unmappedProperties.map(p => p.name).join(', ')}. If any of these are required, the import will fail.
                    </AlertDescription>
                </Alert>
            )}
          </div>
        );
      
      case 'confirm':
        return (
          <div className="space-y-4">
              <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Ready to Import</AlertTitle>
                  <AlertDescription>
                      You are about to import <strong>{parsedData.length}</strong> records into the "{model.name}" model. Please confirm to proceed. This action cannot be undone.
                  </AlertDescription>
              </Alert>
          </div>
        );

      case 'result':
        return (
          <div className="space-y-4">
            <Alert variant={importResult?.errorCount === 0 ? 'default' : 'destructive'}>
                <AlertTitle>Import Complete</AlertTitle>
                <AlertDescription>
                    Successfully imported: {importResult?.successCount || 0} records. <br/>
                    Failed: {importResult?.errorCount || 0} records.
                </AlertDescription>
            </Alert>
            {importResult?.errors && importResult.errors.length > 0 && (
                <ScrollArea className="h-60 border rounded-md">
                    <Table>
                        <TableHeader><TableRow><TableHead>CSV Row</TableHead><TableHead>Field</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {importResult.errors.map((err, i) => (
                                <TableRow key={i}><TableCell>{err.row}</TableCell><TableCell>{err.field}</TableCell><TableCell>{err.message}</TableCell></TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            )}
          </div>
        );
      default: return null;
    }
  }

  const renderFooter = () => {
    switch(step) {
      case 'upload':
        return <Button onClick={parseCsv} disabled={!file || isProcessing}>{isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}Next</Button>;
      case 'mapping':
        return (
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={() => setStep('upload')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
            <Button onClick={() => setStep('confirm')}><ArrowRight className="mr-2 h-4 w-4" />Review</Button>
          </div>
        );
      case 'confirm':
        return (
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={() => setStep('mapping')} disabled={isProcessing}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
            <Button onClick={handleImport} disabled={isProcessing}>{isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing...</> : <> <UploadCloud className="mr-2 h-4 w-4" />Start Import</>}</Button>
          </div>
        );
      case 'result':
        return <Button onClick={onClose}>Close</Button>;
      default: return null;
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Data into "{model.name}"</DialogTitle>
          <DialogDescription>Follow the steps to import data from a CSV file.</DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto py-4 pr-2">
            {renderStepContent()}
        </div>
        <DialogFooter>
            {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
