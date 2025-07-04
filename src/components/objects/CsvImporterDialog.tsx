
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
import { Checkbox } from '@/components/ui/checkbox';
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

const DO_NOT_IMPORT_VALUE = "__DO_NOT_IMPORT__";

export function CsvImporterDialog({ isOpen, onClose, model, onSuccess }: CsvImporterDialogProps) {
  const { toast } = useToast();
  const { models: allModels } = useData();

  const [step, setStep] = React.useState<ImportStep>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [delimiter, setDelimiter] = React.useState<string>(',');
  const [hasHeader, setHasHeader] = React.useState<boolean>(true);
  const [encoding, setEncoding] = React.useState<string>('auto');
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
      setHasHeader(true);
      setEncoding('auto');
      setDelimiter(',');
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
    
    const config: Papa.ParseConfig = {
      header: hasHeader,
      skipEmptyLines: true,
      delimiter,
      complete: (results) => {
        if (results.errors.length) {
          toast({ variant: 'destructive', title: 'CSV Parsing Error', description: results.errors[0].message });
          setIsProcessing(false);
          return;
        }

        let finalHeaders: string[] = [];
        let finalData: CsvRow[] = [];

        if (hasHeader) {
          finalHeaders = results.meta.fields || [];
          finalData = results.data as CsvRow[];
        } else {
          const rawData = results.data as string[][];
          if (rawData.length > 0) {
            // Generate generic headers like "Column 1", "Column 2"
            finalHeaders = rawData[0].map((_, index) => `Column ${index + 1}`);
            // Transform the array of arrays into an array of objects
            finalData = rawData.map(row => {
              const obj: CsvRow = {};
              finalHeaders.forEach((header, i) => {
                obj[header] = row[i];
              });
              return obj;
            });
          }
        }
        
        setHeaders(finalHeaders);
        setParsedData(finalData);
        setStep('mapping');
        setIsProcessing(false);
      },
      error: (error) => {
        toast({ variant: 'destructive', title: 'CSV Parsing Failed', description: error.message });
        setIsProcessing(false);
      }
    };
    
    if (encoding !== 'auto') {
        config.encoding = encoding;
    }

    Papa.parse(file, config);
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
          <div className="space-y-6">
            <div>
                <Label htmlFor="csv-file">Upload CSV or TXT File</Label>
                <Input id="csv-file" type="file" accept=".csv, .txt" onChange={handleFileChange} className="mt-1" />
            </div>
            <div className="space-y-2">
                <Label>Parsing Options</Label>
                <div className="p-4 border rounded-md space-y-4 bg-muted/50">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="has-header" checked={hasHeader} onCheckedChange={(checked) => setHasHeader(!!checked)} />
                        <Label htmlFor="has-header" className="font-normal">The first row is a header</Label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="delimiter">Delimiter</Label>
                            <Select value={delimiter} onValueChange={setDelimiter}>
                                <SelectTrigger id="delimiter"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value=",">Comma (,)</SelectItem>
                                    <SelectItem value=";">Semicolon (;)</SelectItem>
                                    <SelectItem value="\t">Tab</SelectItem>
                                    <SelectItem value="|">Pipe (|)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="encoding">Encoding</Label>
                            <Select value={encoding} onValueChange={setEncoding}>
                                <SelectTrigger id="encoding"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">Auto-Detect</SelectItem>
                                    <SelectItem value="utf-8">UTF-8</SelectItem>
                                    <SelectItem value="iso-8859-1">ISO-8859-1 (Latin1)</SelectItem>
                                    <SelectItem value="windows-1252">Windows-1252</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        );

      case 'mapping':
        return (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Map Your Data</AlertTitle>
              <AlertDescription>Match columns from your file to properties in the "{model.name}" model. Required fields are marked with <span className="text-destructive">*</span>.</AlertDescription>
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
                          value={mappings[prop.id] || DO_NOT_IMPORT_VALUE}
                          onValueChange={(value) => setMappings(prev => ({ ...prev, [prop.id]: value === DO_NOT_IMPORT_VALUE ? '' : value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Select CSV column..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={DO_NOT_IMPORT_VALUE}>-- Do Not Import --</SelectItem>
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
          <DialogDescription>Follow the steps to import data from a CSV or TXT file.</DialogDescription>
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
