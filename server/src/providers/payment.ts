// Confirms that KHQR gift money really arrived. For now a host confirms by hand after checking
// their bank app (ManualPaymentProvider). An automatic provider (Bakong or a bank's API) will
// implement the same interface and confirm gifts without the host.
import type { Gift, Prisma } from "@prisma/client";

export interface PaymentProvider {
  readonly name: string;
  /** Records the confirmed payment for a gift and returns the payment id to link to it. */
  recordConfirmation(tx: Prisma.TransactionClient, gift: Gift, confirmedById: string): Promise<string>;
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual";

  async recordConfirmation(tx: Prisma.TransactionClient, gift: Gift, confirmedById: string) {
    const payment = await tx.payment.create({
      data: {
        eventId: gift.eventId,
        provider: this.name,
        reference: gift.id,
        amount: gift.amount,
        currency: gift.currency,
        status: "PAID",
        providerPayload: { confirmedBy: confirmedById },
      },
    });
    return payment.id;
  }
}

export const paymentProvider: PaymentProvider = new ManualPaymentProvider();
