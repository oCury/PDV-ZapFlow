import { useEffect, useRef, useCallback } from "react";

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  maxIntervalMs?: number;
  minLength?: number;
}

const SCANNER_THRESHOLD_MS = 30;
const HUMAN_THRESHOLD_MS = 50;

export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxIntervalMs = HUMAN_THRESHOLD_MS,
  minLength = 4,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeystrokeRef = useRef<number>(0);
  const isScannerRef = useRef<boolean>(false);
  const onScanRef = useRef(onScan);

  onScanRef.current = onScan;

  const resetBuffer = useCallback(() => {
    bufferRef.current = "";
    isScannerRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      const now = performance.now();
      const elapsed = now - lastKeystrokeRef.current;
      lastKeystrokeRef.current = now;

      if (e.key === "Enter") {
        if (isScannerRef.current && bufferRef.current.length >= minLength) {
          e.preventDefault();
          onScanRef.current(bufferRef.current);
        }
        resetBuffer();
        return;
      }

      if (e.key.length !== 1) return;

      if (bufferRef.current.length === 0) {
        bufferRef.current = e.key;
        isScannerRef.current = true;
        return;
      }

      if (elapsed > maxIntervalMs) {
        resetBuffer();
        bufferRef.current = e.key;
        isScannerRef.current = elapsed <= SCANNER_THRESHOLD_MS;
        return;
      }

      bufferRef.current += e.key;
      isScannerRef.current = elapsed <= SCANNER_THRESHOLD_MS;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, maxIntervalMs, minLength, resetBuffer]);
}
