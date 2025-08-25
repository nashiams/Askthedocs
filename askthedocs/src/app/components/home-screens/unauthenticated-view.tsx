import { BookOpen } from "lucide-react";
import { DocInput } from "../chat/doc-input";
import { AuthModal } from "../auth/auth-modal";
import { Toast } from "../ui/toast";
import { ToastState } from "@/types/frontend/home";
import { AppHeader } from "../layout/app-header";
import { HeroSection } from "../sections/hero";

interface UnauthenticatedViewProps {
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  checkAuthStatus: () => Promise<void>;
  toast: ToastState;
  setToast: (toast: ToastState | ((prev: ToastState) => ToastState)) => void;
}

export function UnauthenticatedView({
  showAuthModal,
  setShowAuthModal,
  checkAuthStatus,
  toast,
  setToast
}: UnauthenticatedViewProps) {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div className="absolute inset-0 gradient-bg fade-gradient" style={{ zIndex: 0 }} />
      
      <div className="relative flex h-full text-white font-sans z-10">
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <AppHeader />
          <HeroSection onDocInputClick={() => setShowAuthModal(true)} />
        </div>
      </div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => {
          setShowAuthModal(false);
          setTimeout(() => {
            checkAuthStatus();
          }, 500);
        }} 
      />

      <Toast
        message={toast.message ?? ""}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast((prev: ToastState) => ({ ...prev, visible: false }))}
      />
    </div>
  );
}