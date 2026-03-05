"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/app/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";


const SCANNER_CONFIG = {
  fps: 15,
  facingMode: "environment",
};

const VIBRATION_DURATION = 100;
const SCAN_COOLDOWN = 2000;


export default function Scanner() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scannerRef         = useRef(null);
  const lastScannedRef     = useRef({ id: "", timestamp: 0 });
  const isProcessingRef    = useRef(false);

  const isTransitioningRef = useRef(false);


  const getState = () =>
    scannerRef.current?.getState() ?? Html5QrcodeScannerState.NOT_STARTED;

  const stopScanner = useCallback(async () => {
    if (isTransitioningRef.current) return;
    const state = getState();
    if (
      state === Html5QrcodeScannerState.SCANNING ||
      state === Html5QrcodeScannerState.PAUSED
    ) {
      isTransitioningRef.current = true;
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      } finally {
        isTransitioningRef.current = false;
      }
    }
  }, []);


  const onScanSuccess = useCallback(async (decodedText) => {
    if (isProcessingRef.current) return;

    const now = Date.now();
    if (
      lastScannedRef.current.id === decodedText &&
      now - lastScannedRef.current.timestamp < SCAN_COOLDOWN
    ) return;

    lastScannedRef.current = { id: decodedText, timestamp: now };
    isProcessingRef.current = true;

    if (navigator.vibrate) navigator.vibrate(VIBRATION_DURATION);

    if (!isTransitioningRef.current && getState() === Html5QrcodeScannerState.SCANNING) {
      isTransitioningRef.current = true;
      try {
        await scannerRef.current.pause();
      } catch (err) {
        console.error("Error pausing scanner:", err);
      } finally {
        isTransitioningRef.current = false;
      }
    }

    setLoading(true);
    try {
      const verifyFn = httpsCallable(functions, "verifyTicket");
      const { data } = await verifyFn({ ticketId: decodedText });
      setResult(data);
      setError(null);
    } catch (err) {
      console.error("Verification error:", err);
      setResult({
        status: "ERROR",
        message: err.message || "Network or authentication error",
      });
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  }, []);


  const startScanner = useCallback(async () => {
    if (isTransitioningRef.current) return;

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode("reader");
    }

    const state = getState();
    if (
      state === Html5QrcodeScannerState.SCANNING ||
      state === Html5QrcodeScannerState.PAUSED
    ) return;

    isTransitioningRef.current = true;
    try {
      setError(null);
      await scannerRef.current.start(
        { facingMode: SCANNER_CONFIG.facingMode },
        { fps: SCANNER_CONFIG.fps },
        onScanSuccess
      );
    } catch (err) {
      console.error("Camera error:", err);
      setError(
        err.name === "NotAllowedError"
          ? "Camera permission denied"
          : "Failed to start camera"
      );
    } finally {
      isTransitioningRef.current = false;
    }
  }, [onScanSuccess]);


  const resumeScanning = useCallback(async () => {
    if (isTransitioningRef.current) return;
    setResult(null);
    setError(null);

    const state = getState();
    if (state === Html5QrcodeScannerState.PAUSED) {
      isTransitioningRef.current = true;
      try {
        await scannerRef.current.resume();
      } catch (err) {
        console.error("Error resuming scanner:", err);
        isTransitioningRef.current = false;
        await startScanner();
        return;
      } finally {
        isTransitioningRef.current = false;
      }
    } else {
      await startScanner();
    }
  }, [startScanner]);


  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };

  }, []);


  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-black">
      <div
        id="reader"
        className="absolute inset-0 [&_#qr-shaded-region]:!hidden [&_canvas]:!hidden"
      />

      {/* ── Error banner ── */}
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500/90 backdrop-blur-sm rounded-2xl p-4 z-50">
          <div className="flex items-center gap-3">
            <AlertCircle size={24} className="flex-shrink-0" />
            <p className="flex-1 font-semibold">{error}</p>
            <button
              onClick={() => { setError(null); startScanner(); }}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Custom scan overlay ── */}
      {!result && !error && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="relative w-64 h-64 border-2 border-white/20 rounded-3xl">
            <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl" />
            <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl" />
            <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-xl" />

            <motion.div
              animate={{ top: ["0%", "100%", "0%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 right-0 h-0.5 bg-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.8)]"
            />
          </div>
          <p className="mt-8 text-white/70 text-sm font-medium tracking-widest uppercase">
            Align Ticket QR Code
          </p>
        </div>
      )}

      {/* ── Result bottom sheet ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-[32px] p-8 shadow-2xl z-[60]"
          >
            <div className="flex flex-col items-center text-center">
              {result.status === "SUCCESS" ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                  className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4"
                >
                  <CheckCircle2 size={32} className="text-green-500" />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                  className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4"
                >
                  <AlertCircle size={32} className="text-red-500" />
                </motion.div>
              )}

              <h2 className="text-2xl font-bold mb-1">
                {result.status === "SUCCESS" ? "Entry Allowed" : "Entry Denied"}
              </h2>
              <p className="text-zinc-400 mb-6">{result.message || result.guest}</p>

              {result.status === "SUCCESS" && result.ticketType && (
                <div className="w-full bg-zinc-800 rounded-2xl p-4 mb-6 grid grid-cols-2 gap-4 text-left">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase">Ticket Type</p>
                    <p className="font-semibold">{result.ticketType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase">Guest Name</p>
                    <p className="font-semibold">{result.guest}</p>
                  </div>
                </div>
              )}

              <button
                onClick={resumeScanning}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold transition-all active:scale-95"
              >
                Continue Scanning
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading overlay ── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70]"
          >
            <Loader2 className="animate-spin text-indigo-500" size={48} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}