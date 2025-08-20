export type ToastState = {
  message?: string;
  type?: "error" | "info" | "success";
  visible: boolean;
};

export interface UserInfo {
  email: string;
  name?: string;
  image?: string;
}

export interface CrawlStatus {
  isVisible: boolean;
  status: "idle" | "crawling" | "complete" | "error";
  progress: number;
  message: string;
  url?: string;
  sessionId?: string;
}

export interface CrawlProgressModalProps {
  isVisible: boolean;
  onClose: () => void;
  url?: string;
  sessionId?: string;
  status: "idle" | "crawling" | "complete" | "error";
  progress?: number;
  message?: string;
}