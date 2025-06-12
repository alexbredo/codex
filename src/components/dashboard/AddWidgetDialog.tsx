import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface AddWidgetDialogProps {
  onAddWidget: (widgetType: string) => void;
}

const AddWidgetDialog: React.FC<AddWidgetDialogProps> = ({ onAddWidget }) => {
  const [open, setOpen] = useState(false);

  const handleAddWidget = (widgetType: string) => {
    onAddWidget(widgetType);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Widget</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add a Widget</DialogTitle>
          <DialogDescription>
            Choose a widget to add to your dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button onClick={() => handleAddWidget('dataSummary')}>Data Summary</Button>
          <Button onClick={() => handleAddWidget('modelCountChart')}>Model Count Chart</Button>
          <Button onClick={() => handleAddWidget('quickStart')}>Quick Start</Button>
          <Button onClick={() => handleAddWidget('numericSummary')}>Numeric Summary</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddWidgetDialog;
