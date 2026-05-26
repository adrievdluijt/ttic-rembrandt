// =============================================================================
// /api/stripe/webhook — receives subscription lifecycle events from Stripe
//
// Listens for five events configured in Stripe Dashboard → Webhooks:
//   - checkout.session.completed     → new subscription is born; upgrade tier
//   - customer.subscription.updated  → status change (renewal, cancellation
//                                      scheduled, plan change); sync state
//   - customer.subscription.deleted  → subscription has actually ended;
//                                      downgrade tier to free
//   - invoice.payment_succeeded      → renewal payment confirmed; defensive
//                                      sync of current_period_end
//   - invoice.payment_failed         → renewal failed; mark subscription
//                                      past_due (don't drop tier yet —
//                                      Stripe will retry for up to 4 weeks
//                                      before the subscription is deleted)
//
// IMPORTANT: this endpoint must read the raw request body, not parsed JSON,
// because Stripe signs the raw bytes. The bodyParser: false config disables
// Vercel's automatic JSON parsing for this route only.
// =============================================================================

import Stripe from 'stripe';
import { getSupabaseAdmin } from '../_lib/supabase-server.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = {
  api: {
    bodyParser: false,
  },
};

// -----------------------------------------------------------------------------
// Read raw request body as a Buffer for signature verification
// -----------------------------------------------------------------------------
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// -----------------------------------------------------------------------------
// Determine tier from a Stripe subscription
//
// The product name set in Stripe Dashboard ("Rembrandt Editor Professional"
// vs "Rembrandt Editor Team") determines which tier to apply. If you ever
// add more tiers, extend this function. Anything not matching falls back
// to 'professional' rather than 'free' — we don't want a misnamed product
// to silently break paid users.
// -----------------------------------------------------------------------------
function tierFromSubscription(subscription) {
  const productName = subscription?.items?.data?.[0]?.price?.product?.name || '';
  return productName.toLowerCase().includes('team') ? 'team' : 'professional';
}

// -----------------------------------------------------------------------------
// Event handlers — one per Stripe event type we care about
// -----------------------------------------------------------------------------
async function handleCheckoutCompleted(event) {
  const session = event.data.object;
  const userId = session.client_reference_id;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId) {
    console.error('checkout.session.completed: missing client_reference_id', { sessionId: session.id });
    return;
  }
  if (!subscriptionId) {
    console.error('checkout.session.completed: not a subscription session', { sessionId: session.id });
    return;
  }

  // Fetch the subscription with product expanded so we can read the tier
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });

  const tier = tierFromSubscription(subscription);
  const priceId = subscription.items.data[0].price.id;
  const supabase = getSupabaseAdmin();

  // 1. Update profile with customer ID and tier
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      stripe_customer_id: customerId,
      tier,
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Failed to update profile on checkout completed:', profileError);
    throw profileError;
  }

  // 2. Upsert subscription row (upsert handles Stripe replaying the event)
  const { error: subscriptionError } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        tier,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      },
      { onConflict: 'stripe_subscription_id' }
    );

  if (subscriptionError) {
    console.error('Failed to upsert subscription on checkout completed:', subscriptionError);
    throw subscriptionError;
  }

  console.log(`Subscription created: user=${userId}, tier=${tier}, subscription=${subscription.id}`);
}

async function handleSubscriptionUpdated(event) {
  const subscription = event.data.object;
  const supabase = getSupabaseAdmin();

  // Look up the user_id from the existing subscription row
  const { data: existing, error: lookupError } = await supabase
    .from('subscriptions')
    .select('user_id, tier')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (lookupError || !existing) {
    console.error(
      `customer.subscription.updated: no local row for ${subscription.id} — this is expected if checkout.session.completed has not yet been processed`
    );
    return;
  }

  // Re-fetch with product expansion to read tier (in case the user upgraded
  // from Pro to Team or vice versa)
  const expanded = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ['items.data.price.product'],
  });
  const tier = tierFromSubscription(expanded);
  const priceId = expanded.items.data[0].price.id;

  // Update the subscription row
  const { error: subUpdateError } = await supabase
    .from('subscriptions')
    .update({
      stripe_price_id: priceId,
      status: subscription.status,
      tier,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq('stripe_subscription_id', subscription.id);

  if (subUpdateError) {
    console.error('Failed to update subscription row:', subUpdateError);
    throw subUpdateError;
  }

  // Sync profile tier — covers plan changes (Pro ↔ Team), and also handles
  // active/trialing → professional, anything else stays at current tier
  // (we drop to free only when subscription.deleted fires).
  const profileTier = ['active', 'trialing'].includes(subscription.status) ? tier : existing.tier;

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ tier: profileTier })
    .eq('id', existing.user_id);

  if (profileUpdateError) {
    console.error('Failed to sync profile tier:', profileUpdateError);
    throw profileUpdateError;
  }

  console.log(`Subscription updated: user=${existing.user_id}, status=${subscription.status}, tier=${profileTier}`);
}

async function handleSubscriptionDeleted(event) {
  const subscription = event.data.object;
  const supabase = getSupabaseAdmin();

  // Look up the user_id
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  // Mark the subscription as canceled
  await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscription.id);

  // Drop the user back to free tier
  if (existing?.user_id) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ tier: 'free' })
      .eq('id', existing.user_id);

    if (profileError) {
      console.error('Failed to downgrade profile to free:', profileError);
      throw profileError;
    }

    console.log(`Subscription deleted: user=${existing.user_id} downgraded to free`);
  }
}

async function handleInvoicePaymentSucceeded(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return; // non-subscription invoice, ignore

  // Defensive: re-sync current_period_end on each successful renewal
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const supabase = getSupabaseAdmin();

  await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  console.log(`Invoice payment succeeded: subscription=${subscription.id}`);
}

async function handleInvoicePaymentFailed(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const supabase = getSupabaseAdmin();

  // Mark the subscription as past_due. Do NOT drop tier — Stripe will retry
  // payments for up to 4 weeks. If retries fail, customer.subscription.deleted
  // will fire and that handler will downgrade the tier.
  await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);

  console.warn(`Invoice payment FAILED: subscription=${subscriptionId} — tier left intact pending Stripe retry`);
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe env vars not set: need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET');
    return res.status(500).send('Server not configured');
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).send('Missing stripe-signature header');
  }

  // Read raw body for signature verification
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('Failed to read request body:', err);
    return res.status(400).send('Could not read body');
  }

  // Verify the signature and parse the event
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Dispatch by event type. Anything we don't recognise is acknowledged
  // with 200 so Stripe doesn't retry it.
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Failed to handle ${event.type}:`, err);
    // Return 500 so Stripe retries the webhook — important for transient
    // Supabase errors. Stripe retries with exponential backoff for 3 days.
    return res.status(500).send('Handler error');
  }
}
