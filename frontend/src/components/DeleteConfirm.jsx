import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function DeleteConfirm({ open, title, description, onConfirm, onCancel }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="bg-[#2F2F2F] border border-white/10 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[#B3B3B3] text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel
            data-testid="delete-cancel-button"
            onClick={onCancel}
            className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="delete-confirm-button"
            onClick={onConfirm}
            className="bg-[#E53935] hover:bg-[#F44336] text-white border-0"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
