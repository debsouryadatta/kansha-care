import React from "react";
import { notifyError } from "../lib/notifications";

function isOpaqueScriptError(message: unknown) {
  if (typeof message !== "string") return false;
  return message.trim().replace(/\.$/, "") === "Script error";
}

export function GlobalErrorToasts() {
  React.useEffect(() => {
    function handleError(event: ErrorEvent) {
      if (!event.error && isOpaqueScriptError(event.message)) return;
      notifyError(event.error ?? event.message, "Unexpected application error");
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (isOpaqueScriptError(event.reason)) return;
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
