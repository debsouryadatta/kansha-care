import { toast } from "@kansha/ui";
import { getErrorMessage } from "./api";

export function notifyError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);
  toast.error(message);
  return message;
}
