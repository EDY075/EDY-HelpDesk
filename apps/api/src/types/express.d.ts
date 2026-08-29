declare global {
  namespace Express {
    interface Request {
      requestId: string;
      correlationId: string;
      auth?: {
        accountId: string;
        username: string;
        role: "Admin" | "Technician" | "Viewer";
        displayName: string | null;
        sessionId: string;
      };
    }
  }
}

export {};
