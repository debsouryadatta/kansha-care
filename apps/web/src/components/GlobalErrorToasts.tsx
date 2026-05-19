import React from "react";
import { notifyError } from "../lib/notifications";

export function GlobalErrorToasts() {
  React.useEffect(() => {
    function handleError(event: ErrorEvent) {
      notifyError(event.error ?? event.message, "Unexpected application error");
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      notifyError(event.reason, "Unexpected request error");
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
