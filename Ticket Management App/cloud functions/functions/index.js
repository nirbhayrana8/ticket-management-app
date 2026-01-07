/* eslint-disable comma-dangle */
/* eslint-disable max-len */
const {setGlobalOptions} = require("firebase-functions");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// Firebase Admin (Keep at top - very fast)
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");

initializeApp();

const razorpayKeyId = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecret = defineSecret("RAZORPAY_WEBHOOK_SECRET");

// Optimized Cached instances
let db;
let razorpay;
let storageBucket;

const getDb = () => {
  if (!db) db = getFirestore();
  return db;
};

const getRazorpay = (keyId, keySecret) => {
  if (!razorpay) {
    const Razorpay = require("razorpay"); // Lazy load
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }
  return razorpay;
};

const getBucket = () => {
  if (!storageBucket) storageBucket = getStorage().bucket();
  return storageBucket;
};

// Global Config
setGlobalOptions({
  maxInstances: 10,
  region: "asia-south1",
  timeoutSeconds: 60,
  memory: "512MiB"
});

// ---------------------------------------------------------
// 1. CREATE ORDER (With Soft Inventory Check)
// ---------------------------------------------------------
exports.createOrder = onRequest({
  secrets: [razorpayKeyId, razorpayKeySecret],
  cors: true
}, async (req, res) => {
  const cors = require("cors")({origin: true}); // Lazy load cors
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});

      const {name, phone, email, ticketType, amount, quantity} = req.body;
      const qty = parseInt(quantity);
      const firestore = getDb();

      // Soft Check Inventory before allowing payment
      const invRef = firestore.collection("inventory").doc(ticketType);
      const invSnap = await invRef.get();

      if (!invSnap.exists) return res.status(400).json({error: "Invalid ticket type"});
      if (invSnap.data().available < qty) {
        return res.status(400).json({error: "Insufficient tickets available"});
      }

      const rzp = getRazorpay(razorpayKeyId.value(), razorpayKeySecret.value());
      const order = await rzp.orders.create({
        amount: amount * 100,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: {name, ticketType, quantity: String(qty)},
      });

      await firestore.collection("orders").doc(order.id).set({
        name: name.trim(),
        phone: phone.replace(/\s+/g, ""),
        email: email || "",
        ticketType,
        quantity: qty,
        amount: parseFloat(amount),
        status: "CREATED",
        ticketsGenerated: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      res.json({orderId: order.id, amount: order.amount, key: razorpayKeyId.value()});
    } catch (err) {
      logger.error("Order Creation Error:", err);
      res.status(500).json({error: "Order Creation Failed"});
    }
  });
});

// ---------------------------------------------------------
// 2. WEBHOOK (Strict Concurrency Transaction)
// ---------------------------------------------------------
exports.razorpayWebhook = onRequest({
  secrets: [razorpayWebhookSecret],
  timeoutSeconds: 30
}, async (req, res) => {
  const crypto = require("crypto"); // Lazy load crypto
  const firestore = getDb();
  const signature = req.headers["x-razorpay-signature"];
  const secret = razorpayWebhookSecret.value();

  const sha = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(sha), Buffer.from(signature))) {
    return res.status(400).send("Invalid signature");
  }

  const {event, payload} = req.body;
  if (event !== "payment.captured") return res.json({status: "ignored"});

  const payment = payload.payment.entity;
  const orderId = payment.order_id;
  const orderRef = firestore.collection("orders").doc(orderId);

  try {
    const result = await firestore.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) throw new Error("Order not found");

      const orderData = orderDoc.data();
      // Idempotency check: Don't process twice
      if (orderData.status === "PAID") return {alreadyProcessed: true};

      const invRef = firestore.collection("inventory").doc(orderData.ticketType);
      const invDoc = await transaction.get(invRef);

      if (!invDoc.exists) throw new Error("Inventory record missing");
      const currentAvailable = invDoc.data().available;

      // CONCURRENCY CHECK: If tickets sold out during the user's payment session
      if (currentAvailable < orderData.quantity) {
        transaction.update(orderRef, {
          status: "OVERSOLD_ERROR",
          paymentId: payment.id,
          error: "Sold out during payment"
        });
        return {success: false, reason: "OUT_OF_STOCK"};
      }

      // ATOMIC UPDATE: Decrement inventory and mark order paid
      transaction.update(invRef, {
        available: FieldValue.increment(-orderData.quantity),
        soldCount: FieldValue.increment(orderData.quantity)
      });

      transaction.update(orderRef, {
        status: "PAID",
        paymentId: payment.id,
        paidAt: FieldValue.serverTimestamp(),
      });

      return {success: true};
    });

    logger.info(`Webhook processed for ${orderId}:`, result);
    res.json({status: "OK"});
  } catch (error) {
    logger.error("Webhook Transaction Failed:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ---------------------------------------------------------
// 3. GENERATE TICKETS (Lazy Loaded QRCode)
// ---------------------------------------------------------
exports.generateTickets = onDocumentUpdated({
  document: "orders/{orderId}",
  timeoutSeconds: 120,
  memory: "1GiB"
}, async (event) => {
  const data = event.data.after.data();
  const previousData = event.data.before.data();

  if (!data || data.status !== "PAID" || previousData.status === "PAID" || data.ticketsGenerated) {
    return null;
  }

  const QRCode = require("qrcode");
  const crypto = require("crypto");
  const firestore = getDb();
  const bucket = getBucket();
  const orderId = event.params.orderId;
  const quantity = data.quantity || 1;

  const ticketIds = [];
  const ticketData = [];

  try {
    const generatePromises = Array.from({length: quantity}, async (_, i) => {
      const ticketId = crypto.randomUUID();
      ticketIds.push(ticketId);

      const qrBuffer = await QRCode.toBuffer(ticketId, {width: 300, margin: 1});
      const filePath = `qrcodes/${orderId}/${ticketId}.png`;
      const file = bucket.file(filePath);

      await file.save(qrBuffer, {
        metadata: {contentType: "image/png"},
        public: true,
        resumable: false
      });

      ticketData.push({
        id: ticketId,
        data: {
          ticketId,
          orderId,
          ownerName: data.name,
          ownerPhone: data.phone,
          ticketType: data.ticketType,
          ticketNumber: i + 1,
          qrUrl: `https://storage.googleapis.com/${bucket.name}/${filePath}`,
          used: false,
          createdAt: FieldValue.serverTimestamp(),
        }
      });
    });

    await Promise.all(generatePromises);

    const batch = firestore.batch();
    ticketData.forEach((t) => batch.set(firestore.collection("tickets").doc(t.id), t.data));
    batch.update(event.data.after.ref, {
      ticketIds,
      ticketsGenerated: true,
      ticketsGeneratedAt: FieldValue.serverTimestamp()
    });

    await batch.commit();
  } catch (error) {
    logger.error(`Ticket generation failed for ${orderId}:`, error);
    throw error; // Let Cloud Functions retry
  }
});

// ---------------------------------------------------------
// 4. VERIFY TICKET
// ---------------------------------------------------------
exports.verifyTicket = onCall({
  region: "asia-south1"
}, async (request) => {
  const firestore = getDb();
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required");

  const {ticketId} = request.data;
  const ticketRef = firestore.collection("tickets").doc(ticketId);

  return firestore.runTransaction(async (transaction) => {
    const ticketDoc = await transaction.get(ticketRef);
    if (!ticketDoc.exists) return {status: "INVALID", message: "Not found"};

    const data = ticketDoc.data();
    if (data.used) return {status: "ALREADY_USED", guest: data.ownerName};

    transaction.update(ticketRef, {
      used: true,
      scannedAt: FieldValue.serverTimestamp(),
      scannedBy: request.auth.uid
    });

    return {status: "SUCCESS", guest: data.ownerName, ticketType: data.ticketType};
  });
});
