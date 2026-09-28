import { Injectable } from '@angular/core';

interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface VerifiedPayment {
  orderId: string;
  paymentId: string;
  amount: number;
}

interface RazorpayCheckout {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}

interface RazorpayWindow extends Window {
  Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private checkoutScript?: Promise<void>;

  async payForRegistration(auctionId: string, auctionName: string, amountInRupees: number): Promise<VerifiedPayment> {
    const amount = Math.round(amountInRupees * 100);
    if (!Number.isInteger(amount) || amount < 100) {
      throw new Error('Registration payment must be at least ₹1.');
    }

    const order = await this.createOrder(auctionId, amount);
    await this.loadCheckoutScript();
    const payment = await this.openCheckout(order, auctionName);
    return this.verifyPayment(payment, auctionId);
  }

  private async createOrder(auctionId: string, amount: number): Promise<CreateOrderResponse> {
    const response = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, amount })
    });
    const data = await response.json() as CreateOrderResponse & { error?: string };
    if (!response.ok) throw new Error(data.error || 'Unable to start payment.');
    return data;
  }

  private async verifyPayment(payment: RazorpaySuccessResponse, auctionId: string): Promise<VerifiedPayment> {
    const response = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payment, auctionId })
    });
    const data = await response.json() as { success?: boolean; amount?: number; error?: string };
    if (!response.ok || !data.success) throw new Error(data.error || 'Payment verification failed.');
    const amount = Number(data.amount);
    if (!Number.isInteger(amount) || amount < 1) throw new Error('Payment amount could not be verified.');
    return { orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, amount: amount / 100 };
  }

  async getVerifiedPaymentAmount(auctionId: string, paymentId: string): Promise<number> {
    const response = await fetch('/api/payment-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, paymentId })
    });
    const data = await response.json() as { success?: boolean; amount?: number; error?: string };
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to retrieve payment amount.');
    const amount = Number(data.amount);
    if (!Number.isInteger(amount) || amount < 1) throw new Error('Payment amount is invalid.');
    return amount / 100;
  }

  private loadCheckoutScript(): Promise<void> {
    if (this.checkoutScript) return this.checkoutScript;
    if ((window as RazorpayWindow).Razorpay) return Promise.resolve();

    this.checkoutScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Razorpay Checkout. Please check your connection.'));
      document.head.appendChild(script);
    });
    return this.checkoutScript;
  }

  private openCheckout(order: CreateOrderResponse, auctionName: string): Promise<RazorpaySuccessResponse> {
    return new Promise((resolve, reject) => {
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) {
        reject(new Error('Razorpay Checkout is unavailable.'));
        return;
      }

      let completed = false;
      const checkout = new Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: auctionName || 'Cricket Auction',
        description: 'Player registration payment',
        order_id: order.order_id,
        handler: (response: RazorpaySuccessResponse) => {
          completed = true;
          resolve(response);
        },
        modal: {
          ondismiss: () => {
            if (!completed) reject(new Error('Payment was cancelled.'));
          }
        }
      });
      checkout.on('payment.failed', (response) => reject(new Error(response.error?.description || 'Payment failed. Please try again.')));
      checkout.open();
    });
  }
}
