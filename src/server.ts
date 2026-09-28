import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import 'dotenv/config';
import express from 'express';
import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();
const razorpayKeyId = process.env['RAZORPAY_KEY_ID'];
const razorpayKeySecret = process.env['RAZORPAY_KEY_SECRET'];
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

app.use(express.json());

app.post('/api/create-order', async (req, res) => {
  if (!razorpay || !razorpayKeyId) {
    res.status(500).json({ error: 'Payment service is not configured.' });
    return;
  }

  const amount = Number(req.body?.amount);
  const auctionId = typeof req.body?.auctionId === 'string' ? req.body.auctionId.trim() : '';

  if (!Number.isInteger(amount) || amount < 100 || !auctionId) {
    res.status(400).json({ error: 'A valid auction and an amount of at least 100 paise are required.' });
    return;
  }

  try {
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `auction_${auctionId.slice(0, 24)}_${Date.now()}`.slice(0, 40),
      notes: { auctionId }
    });

    res.status(201).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpayKeyId
    });
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    console.error('Razorpay order creation failed:', error);
    res.status(statusCode === 401 ? 401 : 500).json({
      error: statusCode === 401 ? 'Payment service authentication failed.' : 'Unable to create payment order.'
    });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  if (!razorpayKeySecret || !razorpay) {
    res.status(500).json({ error: 'Payment service is not configured.' });
    return;
  }

  const orderId = typeof req.body?.razorpay_order_id === 'string' ? req.body.razorpay_order_id : '';
  const paymentId = typeof req.body?.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id : '';
  const signature = typeof req.body?.razorpay_signature === 'string' ? req.body.razorpay_signature : '';
  const auctionId = typeof req.body?.auctionId === 'string' ? req.body.auctionId.trim() : '';

  if (!orderId || !paymentId || !signature || !auctionId) {
    res.status(400).json({ error: 'Payment verification details are missing.' });
    return;
  }

  const expectedSignature = createHmac('sha256', razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const signatureMatches = signature.length === expectedSignature.length && timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );

  if (!signatureMatches) {
    res.status(400).json({ error: 'Payment signature verification failed.' });
    return;
  }

  try {
    const order = await razorpay.orders.fetch(orderId);
    if (order.notes?.['auctionId'] !== auctionId) {
      res.status(400).json({ error: 'This payment does not belong to the selected auction.' });
      return;
    }

    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.status !== 'captured') {
      res.status(400).json({ error: 'This payment has not been captured successfully.' });
      return;
    }

    res.json({
      success: true,
      order_id: orderId,
      payment_id: paymentId,
      auction_id: auctionId,
      amount: payment.amount
    });
  } catch (error) {
    console.error('Unable to validate Razorpay order:', error);
    res.status(400).json({ error: 'Unable to validate this payment order.' });
  }
});

/** Retrieves the captured amount for older registrations that predate paymentAmount storage. */
app.post('/api/payment-details', async (req, res) => {
  if (!razorpay) {
    res.status(500).json({ error: 'Payment service is not configured.' });
    return;
  }

  const paymentId = typeof req.body?.paymentId === 'string' ? req.body.paymentId : '';
  const auctionId = typeof req.body?.auctionId === 'string' ? req.body.auctionId.trim() : '';
  if (!paymentId || !auctionId) {
    res.status(400).json({ error: 'Payment and auction details are required.' });
    return;
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    if (!payment.order_id || payment.status !== 'captured') {
      res.status(400).json({ error: 'This payment was not captured successfully.' });
      return;
    }
    const order = await razorpay.orders.fetch(payment.order_id);
    if (order.notes?.['auctionId'] !== auctionId) {
      res.status(400).json({ error: 'This payment does not belong to the selected auction.' });
      return;
    }
    res.json({ success: true, amount: payment.amount });
  } catch (error) {
    console.error('Unable to retrieve Razorpay payment:', error);
    res.status(400).json({ error: 'Unable to retrieve this payment.' });
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
