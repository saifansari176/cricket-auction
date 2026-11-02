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
import { readFileSync } from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();
const serviceAccountFile = process.env['FIREBASE_SERVICE_ACCOUNT_FILE'];
const serviceAccount = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'] ||
  (serviceAccountFile ? readFileSync(serviceAccountFile, 'utf8') : '');
const adminApp = getApps()[0] || initializeAdminApp({
  credential: serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault()
});
const firestore = getFirestore(adminApp);
const razorpayKeyId = process.env['RAZORPAY_KEY_ID'];
const razorpayKeySecret = process.env['RAZORPAY_KEY_SECRET'];
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

app.use(express.json());

type FirestoreRequest = {
  action: 'getAll' | 'getById' | 'getOneByField' | 'add' | 'set' | 'update' | 'delete' | 'createIfNoMatchingField';
  collection: string;
  id?: string;
  field?: string;
  value?: unknown;
  data?: Record<string, unknown>;
};

type AuctionOwnerData = {
  createdBy?: unknown;
  createdByEmail?: unknown;
};

function ownsAuction(user: DecodedIdToken, auction: AuctionOwnerData | undefined): boolean {
  if (auction?.['createdBy'] === user.uid) return true;
  return user.email_verified === true
    && typeof user.email === 'string'
    && typeof auction?.['createdByEmail'] === 'string'
    && auction['createdByEmail'].toLowerCase() === user.email.toLowerCase();
}

function collectionReference(path: string) {
  const segments = path.split('/').filter(Boolean);
  if (!segments.length || segments.length % 2 === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid collection path.');
  }
  return firestore.collection(path);
}

function publicAuction(data: Record<string, unknown>) {
  const { createdBy: _createdBy, createdByEmail: _createdByEmail, publicPlayerListToken: _token, ...safe } = data;
  return safe;
}

function publicPlayer(data: Record<string, unknown>) {
  const {
    mobile: _mobile, note: _note, paymentOrderId: _paymentOrderId,
    paymentId: _paymentId, paymentAmount: _paymentAmount,
    paymentPaidAt: _paymentPaidAt, paymentStatus: _paymentStatus,
    ...safe
  } = data;
  return safe;
}

function publicBid(data: Record<string, unknown>) {
  const { mobile: _mobile, tshirtSize: _tshirtSize, trouserSize: _trouserSize, ...safe } = data;
  return safe;
}

function publicResponse(collection: string, entry: Record<string, unknown>): Record<string, unknown> {
  if (collection === 'auctions') return publicAuction(entry);
  const segments = collection.split('/').filter(Boolean);
  const subcollection = segments[0] === 'auctions' ? segments[2] : '';
  if (subcollection === 'players') return publicPlayer(entry);
  if (subcollection === 'bids') return publicBid(entry);
  return entry;
}

function isPlayerPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'firebasestorage.googleapis.com'
      && url.pathname.startsWith('/v0/b/saifcricketauction.firebasestorage.app/o/players%2F');
  } catch {
    return false;
  }
}

function auctionIdFromCollection(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  return segments[0] === 'auctions' && segments.length >= 2 ? segments[1] : null;
}

async function authenticatedUser(req: express.Request) {
  const header = req.header('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return getAdminAuth(adminApp).verifyIdToken(header.slice(7));
}

/** Authorizes the collection rather than trusting a client supplied user id. */
async function authorizeDataRequest(req: express.Request, body: FirestoreRequest) {
  const user = await authenticatedUser(req);
  const auctionId = auctionIdFromCollection(body.collection);

  if (!user && body.action === 'getAll' && auctionId) {
    const auction = await firestore.doc(`auctions/${auctionId}`).get();
    const data = auction.data();
    const subcollection = body.collection.split('/').filter(Boolean)[2];
    if (data?.['publicLiveViewEnabled'] === true && ['teams', 'players', 'bids'].includes(subcollection)) return null;
    if (data?.['publicPlayerListEnabled'] === true && subcollection === 'players') return null;
    if (data?.['registrationLinkEnabled'] === true && subcollection === 'categories') return null;
  }
  if (!user && body.action === 'getById' && auctionId && body.collection.endsWith('/liveState')) {
    const auction = await firestore.doc(`auctions/${auctionId}`).get();
    if (auction.data()?.['publicLiveViewEnabled'] === true) return null;
  }
  if (!user && body.action === 'getById' && body.collection === 'auctions' && body.id) {
    const auction = await firestore.doc(`auctions/${body.id}`).get();
    const data = auction.data();
    if (data?.['publicLiveViewEnabled'] === true || data?.['publicPlayerListEnabled'] === true || data?.['registrationLinkEnabled'] === true) return null;
  }
  if (!user && body.action === 'getOneByField' && body.collection === 'auctions' && body.field === 'publicPlayerListToken') return null;

  if (!user) throw new Error('Authentication is required.');

  const profile = await firestore.doc(`users/${user.uid}`).get();
  if (profile.exists && profile.data()?.['active'] !== true) throw new Error('This user account is inactive.');
  if (body.collection === 'auctions' && body.action === 'getAll') return user;
  const isAdmin = profile.data()?.['role'] === 'admin';
  if (isAdmin) return user;

  if (body.collection === 'auctions'
    && body.id
    && ['getById', 'update'].includes(body.action)) {
    const auction = await firestore.doc(`auctions/${body.id}`).get();
    if (ownsAuction(user, auction.data())) return user;
  }
  if (body.collection === 'users' && body.id === user.uid && ['getById', 'set', 'update'].includes(body.action)) return user;
  if (body.collection === `users/${user.uid}/preferences`
    || body.collection.startsWith(`users/${user.uid}/preferences/`)) return user;
  if (body.collection === 'auctionSettings'
    && body.id === `current_${user.uid}`
    && body.action === 'getById') return user;

  if (auctionId) {
    const auction = await firestore.doc(`auctions/${auctionId}`).get();
    if (ownsAuction(user, auction.data())) return user;
  }
  if (body.collection === 'auctions' && body.action === 'add') return user;
  throw new Error('You do not have access to this auction.');
}

async function requireAuctionManager(req: express.Request, auctionId: string) {
  const user = await authenticatedUser(req);
  if (!user) throw new Error('Authentication is required.');
  const [profile, auction] = await Promise.all([
    firestore.doc(`users/${user.uid}`).get(),
    firestore.doc(`auctions/${auctionId}`).get()
  ]);
  if (!auction.exists) throw new Error('Auction not found.');
  if (profile.data()?.['active'] !== true) throw new Error('This user account is inactive.');
  if (profile.data()?.['role'] === 'admin' || ownsAuction(user, auction.data())) return user;
  throw new Error('You do not have access to this auction.');
}

async function deleteCollectionInBatches(collectionPath: string, auctionId?: string): Promise<void> {
  const collection = firestore.collection(collectionPath);

  while (true) {
    const query = auctionId
      ? collection.where('auctionId', '==', auctionId).limit(400)
      : collection.limit(400);
    const snapshot = await query.get();
    if (snapshot.empty) return;

    const batch = firestore.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

const handleFirestoreRequest: express.RequestHandler = async (req, res) => {
  const body = req.body as FirestoreRequest;
  try {
    if (!body?.action || !body.collection) throw new Error('Invalid request.');
    const user = await authorizeDataRequest(req, body);
    const records = collectionReference(body.collection);
    const payload = body.data || {};

    // Never allow a client to assign an auction to a different owner.
    if (body.collection === 'auctions' && body.action === 'add' && user) payload['createdBy'] = user.uid;
    if (body.collection === 'users' && body.id && user && body.id === user.uid && ['set', 'update'].includes(body.action)) {
      const existing = await records.doc(body.id).get();
      if (existing.exists) {
        payload['role'] = existing.data()?.['role'];
        payload['active'] = existing.data()?.['active'];
        payload['teamLimit'] = existing.data()?.['teamLimit'];
        payload['playerLimit'] = existing.data()?.['playerLimit'];
        payload['email'] = existing.data()?.['email'];
      } else {
        const anyProfile = await records.limit(1).get();
        payload['role'] = anyProfile.empty ? 'admin' : 'user';
        payload['active'] = true;
      }
      payload['uid'] = user.uid;
    }

    switch (body.action) {
      case 'getAll': {
        const profile = user && body.collection === 'auctions'
          ? await firestore.doc(`users/${user.uid}`).get()
          : null;
        const isAdmin = profile?.data()?.['role'] === 'admin';
        const snapshots = user && body.collection === 'auctions' && !isAdmin
          ? await Promise.all([
            records.where('createdBy', '==', user.uid).get(),
            ...(user.email_verified === true && user.email
              ? [records.where('createdByEmail', '==', user.email).get()]
              : [])
          ])
          : [await records.get()];
        const entries = new Map(snapshots.flatMap((snapshot) => snapshot.docs)
          .map((entry) => [entry.id, { id: entry.id, ...entry.data() }]));
        const responseEntries = [...entries.values()];
        res.json(user ? responseEntries : responseEntries.map((entry) => publicResponse(body.collection, entry)));
        return;
      }
      case 'getById': {
        if (!body.id) throw new Error('Document id is required.');
        const entry = await records.doc(body.id).get();
        const result = entry.exists ? { id: entry.id, ...entry.data() } : null;
        res.json(result && !user ? publicResponse(body.collection, result) : result);
        return;
      }
      case 'getOneByField': {
        if (!body.field) throw new Error('Field is required.');
        const snapshot = await records.where(body.field, '==', body.value).limit(1).get();
        const entry = snapshot.docs[0];
        const result = entry ? { id: entry.id, ...entry.data() } : null;
        res.json(result && !user ? publicResponse(body.collection, result) : result);
        return;
      }
      case 'add': {
        const entry = await records.add(payload);
        res.status(201).json({ id: entry.id });
        return;
      }
      case 'set':
      case 'update': {
        if (!body.id) throw new Error('Document id is required.');
        const entry = records.doc(body.id);
        if (body.action === 'set') await entry.set(payload); else await entry.update(payload);
        res.status(204).end();
        return;
      }
      case 'delete': {
        if (!body.id) throw new Error('Document id is required.');
        await records.doc(body.id).delete();
        res.status(204).end();
        return;
      }
      case 'createIfNoMatchingField': {
        if (!body.id || !body.field) throw new Error('Document id and field are required.');
        const created = await firestore.runTransaction((transaction) =>
          transaction.get(records.where(body.field!, '==', body.value).limit(1)).then((duplicate) => {
            if (!duplicate.empty) return false;
            const entry = records.doc(body.id!);
            return transaction.get(entry).then((existing) => {
              if (existing.exists) return false;
              transaction.set(entry, payload);
              return true;
            });
          })
        );
        res.status(created ? 201 : 409).json({ created });
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process data request.';
    const status = /Authentication|access/.test(message) ? 403 : 400;
    res.status(status).json({ error: message });
  }
};

app.post('/api/data/{*path}', handleFirestoreRequest);
// Kept temporarily for browsers that still have the prior frontend bundle cached.
app.post('/api/firestore', handleFirestoreRequest);

/** Deletes an auction and its legacy records after verifying ownership. */
app.post('/api/auctions/:auctionId/delete', async (req, res) => {
  const { auctionId } = req.params;

  try {
    const user = await requireAuctionManager(req, auctionId);
    await Promise.all([
      ...['teams', 'players', 'bids', 'categories'].map((name) =>
        deleteCollectionInBatches(`auctions/${auctionId}/${name}`)
      ),
      ...['teams', 'players', 'bids', 'playerCategories'].map((name) =>
        deleteCollectionInBatches(name, auctionId)
      )
    ]);

    await firestore.doc(`auctionSettings/${auctionId}`).delete();
    const legacySelectionIds = [
      `current_${user.uid}`,
      ...(await firestore.doc(`users/${user.uid}`).get()).data()?.['role'] === 'admin' ? ['current'] : []
    ];
    await Promise.all(legacySelectionIds.map(async (id) => {
      const selection = firestore.doc(`auctionSettings/${id}`);
      const snapshot = await selection.get();
      if (snapshot.data()?.['activeAuctionId'] === auctionId) await selection.delete();
    }));

    await firestore.doc(`auctions/${auctionId}`).delete();
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete auction.';
    const status = /Authentication|access/.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

/** Supplies only the duplicate/limit checks needed by the anonymous registration form. */
app.post('/api/public/auctions/:auctionId/registration-check', async (req, res) => {
  const { auctionId } = req.params;
  const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile.trim() : '';
  try {
    const auction = await firestore.doc(`auctions/${auctionId}`).get();
    if (!auction.exists || auction.data()?.['registrationLinkEnabled'] !== true) {
      res.status(404).json({ error: 'Registration is unavailable.' });
      return;
    }
    const players = firestore.collection(`auctions/${auctionId}/players`);
    const [matchingMobile, allPlayers] = await Promise.all([
      mobile ? players.where('mobile', '==', mobile).limit(1).get() : Promise.resolve(null),
      players.count().get()
    ]);
    const playerLimit = Number(auction.data()?.['playerLimit'] ?? 10);
    res.json({
      mobileRegistered: matchingMobile ? !matchingMobile.empty : false,
      canRegister: allPlayers.data().count < playerLimit
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to check registration.' });
  }
});

/** Creates a public registration from a fixed schema; the browser cannot set sale or payment state. */
app.post('/api/public/auctions/:auctionId/registrations', async (req, res) => {
  const { auctionId } = req.params;
  const input = req.body as Record<string, unknown>;
  const text = (name: string, max: number, required = false) => {
    const value = typeof input[name] === 'string' ? input[name].trim() : '';
    if ((required && !value) || value.length > max) throw new Error(`Invalid ${name}.`);
    return value;
  };

  try {
    const auctionRef = firestore.doc(`auctions/${auctionId}`);
    const auctionSnapshot = await auctionRef.get();
    const auction = auctionSnapshot.data();
    if (!auctionSnapshot.exists || auction?.['registrationLinkEnabled'] !== true) throw new Error('Registration is unavailable.');

    const firstName = text('firstName', 80, true);
    const lastName = text('lastName', 80);
    const mobile = text('mobile', 10, true);
    const jerseyNumber = text('jerseyNumber', 3);
    const playerType = text('playerType', 50);
    const currentTeam = text('currentTeam', 100);
    const categoryId = text('categoryId', 128);
    const tshirtSize = text('tshirtSize', 30);
    const trouserSize = text('trouserSize', 30);
    const note = text('note', 500);
    const photo = text('photo', 2000, true);
    if (!/^\d{10}$/.test(mobile) || (jerseyNumber && !/^\d{1,3}$/.test(jerseyNumber)) || !isPlayerPhotoUrl(photo)) {
      throw new Error('Registration details are invalid.');
    }

    let category: Record<string, unknown> | undefined;
    if (categoryId) {
      const categorySnapshot = await firestore.doc(`auctions/${auctionId}/categories/${categoryId}`).get();
      if (!categorySnapshot.exists) throw new Error('Selected category is unavailable.');
      category = categorySnapshot.data();
    }

    const paymentRequired = auction['registrationPaymentEnabled'] === true;
    const paymentId = paymentRequired ? text('paymentId', 128, true) : '';
    const paymentOrderId = paymentRequired ? text('paymentOrderId', 128, true) : '';
    const expectedAmount = Math.round(Number(auction['registrationPaymentAmount'] || 0) * 100);
    if (paymentRequired) {
      if (!razorpay || expectedAmount < 100) throw new Error('Registration payment is not configured.');
      const [payment, order] = await Promise.all([
        razorpay.payments.fetch(paymentId),
        razorpay.orders.fetch(paymentOrderId)
      ]);
      if (payment.order_id !== paymentOrderId || payment.status !== 'captured'
        || order.notes?.['auctionId'] !== auctionId || order.amount !== expectedAmount || payment.amount !== expectedAmount) {
        throw new Error('Registration payment could not be verified.');
      }
    }

    const players = firestore.collection(`auctions/${auctionId}/players`);
    const created = await firestore.runTransaction((transaction) => {
      // Return this chain explicitly. The Admin SDK requires the transaction
      // callback itself to return a Promise on every execution attempt.
      return Promise.all([
        transaction.get(players.where('mobile', '==', mobile).limit(1)),
        transaction.get(players.limit(Math.max(1, Number(auction['playerLimit'] ?? 10)))),
        paymentRequired ? transaction.get(players.where('paymentId', '==', paymentId).limit(1)) : Promise.resolve(null)
      ]).then(([sameMobile, existingPlayers, samePayment]) => {
        if (!sameMobile.empty) throw new Error('Player with this mobile number already exists.');
        if (paymentRequired && samePayment && !samePayment.empty) throw new Error('This payment has already been used.');
        if (existingPlayers.size >= Math.max(0, Number(auction['playerLimit'] ?? 10))) throw new Error('Player limit reached.');

        const playerRef = players.doc(mobile);
        transaction.set(playerRef, {
          auctionId, firstName, lastName, mobile, jerseyNumber, playerType, currentTeam,
          categoryId, categoryName: String(category?.['name'] || ''), tshirtSize, trouserSize, note, photo,
          baseBid: Number(category?.['basePrice'] ?? auction['basePlayerPrice'] ?? auction['minimumBid'] ?? 0),
          bidIncreaseBy: Number(category?.['bidIncreaseBy'] ?? auction['bidIncreaseBy'] ?? 0),
          paymentRequired, paymentOrderId, paymentId, paymentAmount: paymentRequired ? expectedAmount / 100 : 0,
          paymentPaidAt: paymentRequired ? new Date().toISOString() : '',
          paymentStatus: paymentRequired ? 'Verified' : 'Not required', status: 'Available'
        });
        return playerRef.id;
      });
    });
    res.status(201).json({ id: created });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to submit registration.' });
  }
});

/** Atomically records a sale, deducts points, increments the team count, and marks the player sold. */
app.post('/api/auctions/:auctionId/sales', async (req, res) => {
  const { auctionId } = req.params;
  const playerId = typeof req.body?.playerId === 'string' ? req.body.playerId : '';
  const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : '';
  const bidAmount = Number(req.body?.bidAmount);
  try {
    await requireAuctionManager(req, auctionId);
    if (!playerId || !teamId || !Number.isFinite(bidAmount) || bidAmount <= 0) throw new Error('Valid player, team, and bid are required.');

    const result = await firestore.runTransaction(async (transaction) => {
      const playerRef = firestore.doc(`auctions/${auctionId}/players/${playerId}`);
      const teamRef = firestore.doc(`auctions/${auctionId}/teams/${teamId}`);
      const [playerSnapshot, teamSnapshot] = await Promise.all([transaction.get(playerRef), transaction.get(teamRef)]);
      if (!playerSnapshot.exists || !teamSnapshot.exists) throw new Error('Player or team no longer exists.');
      const player = playerSnapshot.data()!;
      const team = teamSnapshot.data()!;
      if (player['status'] !== 'Available') throw new Error('This player is no longer available.');
      if (Number(team['remainingPoints'] || 0) < bidAmount) throw new Error('This team does not have enough points.');
      if (Number(team['playersBought'] || 0) >= Number(team['playerLimit'] || Infinity)) throw new Error('This team has reached its player limit.');

      const bidRef = firestore.collection(`auctions/${auctionId}/bids`).doc();
      const soldDate = new Date().toISOString();
      transaction.set(bidRef, {
        auctionId, playerId, playerName: `${player['firstName'] || ''} ${player['lastName'] || ''}`.trim(),
        teamId, teamName: team['teamName'] || '', bidAmount,
        mobile: player['mobile'] || '', jerseyNumber: player['jerseyNumber'] || '',
        tshirtSize: player['tshirtSize'] || '', trouserSize: player['trouserSize'] || '',
        photoUrl: player['photo'] || '', sold: true, soldDate
      });
      transaction.update(playerRef, { status: 'Sold', soldToTeamId: teamId, soldPrice: bidAmount });
      transaction.update(teamRef, {
        remainingPoints: Number(team['remainingPoints'] || 0) - bidAmount,
        playersBought: Number(team['playersBought'] || 0) + 1
      });
      return { bidId: bidRef.id, player: { id: playerId, ...player, status: 'Sold', soldToTeamId: teamId, soldPrice: bidAmount }, team: { id: teamId, ...team, remainingPoints: Number(team['remainingPoints'] || 0) - bidAmount, playersBought: Number(team['playersBought'] || 0) + 1 } };
    });
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record sale.';
    res.status(/Authentication|access/.test(message) ? 403 : 400).json({ error: message });
  }
});

app.post('/api/create-order', async (req, res) => {
  if (!razorpay || !razorpayKeyId) {
    res.status(500).json({ error: 'Payment service is not configured.' });
    return;
  }

  const auctionId = typeof req.body?.auctionId === 'string' ? req.body.auctionId.trim() : '';

  if (!auctionId) {
    res.status(400).json({ error: 'A valid auction is required.' });
    return;
  }

  try {
    const auction = await firestore.doc(`auctions/${auctionId}`).get();
    const settings = auction.data();
    const amount = Math.round(Number(settings?.['registrationPaymentAmount'] || 0) * 100);
    if (!auction.exists || settings?.['registrationLinkEnabled'] !== true
      || settings?.['registrationPaymentEnabled'] !== true || amount < 100) {
      res.status(400).json({ error: 'Registration payment is unavailable.' });
      return;
    }
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
    const [order, auction] = await Promise.all([
      razorpay.orders.fetch(orderId),
      firestore.doc(`auctions/${auctionId}`).get()
    ]);
    const expectedAmount = Math.round(Number(auction.data()?.['registrationPaymentAmount'] || 0) * 100);
    if (!auction.exists || auction.data()?.['registrationPaymentEnabled'] !== true
      || order.notes?.['auctionId'] !== auctionId || order.amount !== expectedAmount) {
      res.status(400).json({ error: 'This payment does not belong to the selected auction.' });
      return;
    }

    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.status !== 'captured' || payment.amount !== expectedAmount) {
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
