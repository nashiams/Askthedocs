export interface UserInfo {
  email: string;
  name?: string;
  avatar?: string;
}

export  interface ToastState {
  message: string;
  type: "error" | "success" | "info";
  visible: boolean;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: string[];
  snippets?: unknown[];
}

export interface SessionData {
  messages: SessionMessage[];
  session: {
    indexedDocs: Array<{
      url: string;
      name: string;
    }>;
  };
}

export interface CrawlProgressData {
  message?: string;
  sessionId?: boolean;
  url?: string;
  status?: string;
  percentage?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  snippets?: string[];
  sources?: string[];
  comparisons?: string[];
  timestamp: Date;
  type?: "answer" | "comparison";
  isStreaming?: boolean;
}

export interface AttachedDoc {
  url: string;
  name: string;
  status: "ready" | "indexing" | "failed";
  progress?: number;
}