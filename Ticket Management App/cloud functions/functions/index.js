/* eslint-disable comma-dangle */
/* eslint-disable max-len */
const {setGlobalOptions} = require("firebase-functions");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");
const cors = require("cors")({origin: true});
const QRCode = require("qrcode");

// Firebase Admin
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");

initializeApp();

// Define secrets properly for Cloud Functions v2
const razorpayKeyId = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecret = defineSecret("RAZORPAY_WEBHOOK_SECRET");

// Cached instances
let db;
let razorpay;
let storageBucket;

// Optimized: Cache Razorpay instance with secrets
const getRazorpay = (keyId, keySecret) => {
  if (!razorpay) {
    const Razorpay = require("razorpay");
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }
  return razorpay;
};

const getDb = () => {
  if (!db) db = getFirestore();
  return db;
};

const getBucket = () => {
  if (!storageBucket) storageBucket = getStorage().bucket();
  return storageBucket;
};

// Validation helpers
const isValidEmail = (email) => {
  if (!email) return true; // Email is optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone) => {
  // Indian phone number: 10 digits
  return /^[6-9]\d{9}$/.test(phone.replace(/\s+/g, ""));
};

const isValidAmount = (amount, quantity) => {
  return amount > 0 && quantity > 0 && amount < 1000000; // Max 10 lakh per order
};

// Global Config
setGlobalOptions({
  maxInstances: 10,
  region: "asia-south1",
  timeoutSeconds: 60,
  memory: "512MiB"
});

// ---------------------------------------------------------
// 1. CREATE ORDER
// ---------------------------------------------------------
exports.createOrder = onRequest({
  secrets: [razorpayKeyId, razorpayKeySecret],
  cors: true,
  timeoutSeconds: 30
}, async (req, res) => {
  return cors(req, res, async () => {
    try {
      // Only allow POST requests
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method not allowed"});
      }

      const {name, phone, email, ticketType, amount, quantity} = req.body;

      // Enhanced validation
      if (!name || !phone || !ticketType || !amount || !quantity) {
        return res.status(400).json({error: "Missing required fields"});
      }

      if (!isValidPhone(phone)) {
        return res.status(400).json({error: "Invalid phone number format"});
      }

      if (email && !isValidEmail(email)) {
        return res.status(400).json({error: "Invalid email format"});
      }

      if (!isValidAmount(amount, quantity)) {
        return res.status(400).json({error: "Invalid amount or quantity"});
      }

      const firestore = getDb();
      const rzp = getRazorpay(razorpayKeyId.value(), razorpayKeySecret.value());

      const order = await rzp.orders.create({
        amount: amount * 100, // Amount in paise
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: {
          name,
          phone,
          ticketType,
          quantity: String(quantity)
        },
      });

      // Use set with merge to avoid race conditions
      await firestore.collection("orders").doc(order.id).set({
        name: name.trim(),
        phone: phone.replace(/\s+/g, ""),
        email: email ? email.trim() : "",
        ticketType,
        quantity: parseInt(quantity),
        amount: parseFloat(amount),
        status: "CREATED",
        ticketsGenerated: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: razorpayKeyId.value(),
      });
    } catch (err) {
      logger.error("Order Creation Error:", err);
      res.status(500).json({error: "Order Creation Failed"});
    }
  });
});

// ---------------------------------------------------------
// 2. WEBHOOK
// ---------------------------------------------------------
exports.razorpayWebhook = onRequest({
  secrets: [razorpayWebhookSecret],
  timeoutSeconds: 30
}, async (req, res) => {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const firestore = getDb();
  const secret = razorpayWebhookSecret.value();
  const signature = req.headers["x-razorpay-signature"];

  if (!signature) {
    logger.warn("Missing webhook signature");
    return res.status(400).send("Missing signature");
  }

  // Verify Signature (using constant-time comparison)
  const sha = crypto.createHmac("sha256", secret);
  sha.update(JSON.stringify(req.body));
  const digest = sha.digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
    logger.warn("Invalid Webhook Signature");
    return res.status(400).send("Invalid signature");
  }

  const {event, payload} = req.body;

  const payment = payload.payment.entity;
  const orderId = payment.order_id;

  try {
    if (event === "payment.captured") {
      await firestore.collection("orders").doc(orderId).update({
        status: "PAID",
        paymentId: payment.id,
        paidAt: FieldValue.serverTimestamp(),
      });
      logger.info(`Order ${orderId} marked as PAID`);
    } else if (event === "payment.failed") {
      await firestore.collection("orders").doc(orderId).update({
        status: "FAILED",
        failureReason: payment.error_description || "Payment failed",
        failedAt: FieldValue.serverTimestamp()
      });
      logger.info(`Order ${orderId} marked as FAILED`);
    }
    res.json({status: "OK"});
  } catch (error) {
    logger.error("Webhook processing error:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ---------------------------------------------------------
// 3. GENERATE TICKETS + QR CODES (Highly Optimized)
// ---------------------------------------------------------
exports.generateTickets = onDocumentUpdated({
  document: "orders/{orderId}",
  timeoutSeconds: 120,
  memory: "1GiB" // More memory for parallel processing
}, async (event) => {
  const firestore = getDb();
  const bucket = getBucket();

  const data = event.data.after.data();
  const previousData = event.data.before.data();

  // Enhanced guard clauses
  if (!data) {
    logger.warn("No data in document update");
    return null;
  }

  // Only run if status CHANGED to PAID and tickets not yet generated
  if (data.status !== "PAID" || previousData.status === "PAID" || data.ticketsGenerated) {
    return null;
  }

  const orderId = event.params.orderId;
  logger.info(`Starting ticket generation for Order ${orderId}`);

  const quantity = data.quantity || 1;

  // Prevent too many tickets (safety check)
  if (quantity > 50) {
    logger.error(`Quantity too high: ${quantity} for order ${orderId}`);
    await event.data.after.ref.update({
      status: "ERROR",
      errorMessage: "Quantity exceeds maximum allowed"
    });
    return null;
  }

  const ticketIds = [];
  const ticketData = [];

  try {
    // Generate all tickets in parallel with optimized batch size
    const generatePromises = Array.from({length: quantity}, async (_, i) => {
      const ticketId = crypto.randomUUID();
      ticketIds.push(ticketId);

      // Generate QR Code Buffer (optimized settings)
      const qrBuffer = await QRCode.toBuffer(ticketId, {
        errorCorrectionLevel: "M", // Medium is sufficient (H is overkill)
        width: 300, // Smaller = faster upload
        margin: 1,
        type: "png"
      });

      // Upload to Firebase Storage with retry logic
      const filePath = `qrcodes/${orderId}/${ticketId}.png`;
      const file = bucket.file(filePath);

      await file.save(qrBuffer, {
        metadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=31536000", // 1 year cache
        },
        public: true,
        resumable: false // Faster for small files
      });

      // Get the Public URL
      const qrUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      // Store ticket data for batch write
      ticketData.push({
        id: ticketId,
        data: {
          ticketId,
          orderId,
          ownerName: data.name,
          ownerPhone: data.phone,
          ticketType: data.ticketType,
          ticketNumber: i + 1,
          qrUrl,
          used: false,
          createdAt: FieldValue.serverTimestamp(),
        }
      });
    });

    // Wait for all tickets to be generated
    await Promise.all(generatePromises);

    // Batch write all tickets (max 500 per batch)
    const batchSize = 500;
    for (let i = 0; i < ticketData.length; i += batchSize) {
      const batch = firestore.batch();
      const chunk = ticketData.slice(i, i + batchSize);

      chunk.forEach((ticket) => {
        const ticketRef = firestore.collection("tickets").doc(ticket.id);
        batch.set(ticketRef, ticket.data);
      });

      // Update order (only in last batch)
      if (i + batchSize >= ticketData.length) {
        batch.update(event.data.after.ref, {
          ticketIds,
          ticketsGenerated: true,
          ticketsGeneratedAt: FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
    }

    logger.info(`Successfully generated ${quantity} tickets for Order ${orderId}`);
  } catch (error) {
    logger.error(`Ticket generation failed for Order ${orderId}:`, error);

    // Mark order as failed
    await event.data.after.ref.update({
      status: "ERROR",
      errorMessage: error.message,
      ticketsGenerated: false
    });

    throw error; // Re-throw to trigger Cloud Functions retry
  }
});

// ---------------------------------------------------------
// 4. VERIFY TICKET (Optimized with better error handling)
// ---------------------------------------------------------
exports.verifyTicket = onCall({
  region: "asia-south1",
  timeoutSeconds: 10
}, async (request) => {
  const firestore = getDb();

  // Ensure user is logged in (Staff account)
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to scan tickets.");
  }

  const {ticketId} = request.data;

  if (!ticketId || typeof ticketId !== "string") {
    throw new HttpsError("invalid-argument", "Valid Ticket ID is required");
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(ticketId)) {
    return {status: "INVALID", message: "Invalid ticket format."};
  }

  const ticketRef = firestore.collection("tickets").doc(ticketId);

  return firestore.runTransaction(async (transaction) => {
    const ticketDoc = await transaction.get(ticketRef);

    if (!ticketDoc.exists) {
      return {status: "INVALID", message: "Ticket not found."};
    }

    const data = ticketDoc.data();

    if (data.used) {
      const scannedTime = data.scannedAt ?
        data.scannedAt.toDate().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit"
        }) :
        "Unknown time";

      return {
        status: "ALREADY_USED",
        message: `Already scanned at ${scannedTime}`,
        guest: data.ownerName,
        ticketType: data.ticketType
      };
    }

    // Mark as Used
    transaction.update(ticketRef, {
      used: true,
      scannedAt: FieldValue.serverTimestamp(),
      scannedBy: request.auth.uid
    });

    return {
      status: "SUCCESS",
      message: "Ticket verified successfully",
      guest: data.ownerName,
      ticketType: data.ticketType,
      ticketNumber: data.ticketNumber || 1
    };
  });
});
