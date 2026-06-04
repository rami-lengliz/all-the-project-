import Head from 'next/head';
import Link from 'next/link';

const EFFECTIVE_DATE = 'May 31, 2026';
const CONTACT_EMAIL = 'support@renteverything.tn';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 text-xl font-bold text-gray-900">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Terms of Service · RentAI</title>
        <meta name="description" content="The terms governing your use of the RentAI rental marketplace." />
      </Head>

      <div className="bg-gray-50 font-sans">
        <section className="bg-gradient-to-br from-blue-500 to-blue-600 py-14 text-white">
          <div className="mx-auto max-w-3xl px-6">
            <h1 className="text-4xl font-bold">Terms of Service</h1>
            <p className="mt-2 text-blue-100">Last updated: {EFFECTIVE_DATE}</p>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <p className="mb-8 text-[15px] leading-relaxed text-gray-700">
              Welcome to RentAI (&ldquo;the Platform&rdquo;), a peer-to-peer rental marketplace
              operating primarily in Tunisia. These Terms of Service (&ldquo;Terms&rdquo;) form a binding
              agreement between you and RentAI. By creating an account or using the Platform,
              you agree to these Terms. If you do not agree, please do not use the Platform.
            </p>

            <div className="space-y-8">
              <Section id="accounts" title="1. Your account">
                <p>
                  You must be at least 18 years old to use RentAI. You are responsible for the
                  accuracy of the information on your account and for keeping your login credentials
                  secure. You are responsible for all activity that occurs under your account.
                </p>
                <p>
                  To list items or accept bookings as a host, you must verify at least one contact
                  channel (email or phone) and accept the host terms. We may require identity
                  verification (KYC) before enabling payouts or higher-trust features.
                </p>
              </Section>

              <Section id="marketplace" title="2. The marketplace">
                <p>
                  RentAI connects people who want to rent items, vehicles, stays, and equipment
                  (&ldquo;Renters&rdquo;) with people who own them (&ldquo;Hosts&rdquo;). We are a venue
                  and technology provider. The rental agreement for any booking is directly between the
                  Renter and the Host. We are not a party to that agreement and do not own, inspect, or
                  control any listed item.
                </p>
              </Section>

              <Section id="bookings" title="3. Bookings and payments">
                <p>
                  When a Renter requests a booking, the Host may accept or decline it. Once a Host
                  accepts and the Renter pays, the booking is confirmed. Prices, availability, and
                  rental rules are set by the Host.
                </p>
                <p>
                  RentAI charges a service commission (currently 10%) on completed bookings,
                  which is deducted from the Host&rsquo;s earnings. Payouts to Hosts are aggregated and
                  released according to our payout schedule. All amounts are in Tunisian Dinar (TND)
                  unless stated otherwise.
                </p>
              </Section>

              <Section id="cancellations" title="4. Cancellations and refunds">
                <p>
                  Cancellation outcomes depend on the timing and the Host&rsquo;s policy shown on the
                  listing. Where a Renter is entitled to a refund, the service commission may be
                  retained to cover processing costs. Disputes can be raised through the in-app dispute
                  process, which our team reviews.
                </p>
              </Section>

              <Section id="conduct" title="5. Acceptable use">
                <p>You agree not to use the Platform to:</p>
                <ul className="list-disc space-y-1 pl-6">
                  <li>List illegal, stolen, counterfeit, or unsafe items;</li>
                  <li>Circumvent the Platform to avoid fees, or arrange payment off-platform;</li>
                  <li>Post false, misleading, or fraudulent listings, reviews, or messages;</li>
                  <li>Harass, threaten, or discriminate against other users;</li>
                  <li>Scrape, reverse-engineer, or disrupt the Platform or its security.</li>
                </ul>
                <p>
                  We may suspend or terminate accounts that violate these Terms or that create risk for
                  the community.
                </p>
              </Section>

              <Section id="content" title="6. Your content">
                <p>
                  You retain ownership of the listings, photos, and messages you submit. You grant
                  RentAI a non-exclusive, worldwide license to host, display, and use that
                  content for operating and promoting the Platform. You are responsible for having the
                  rights to anything you upload.
                </p>
              </Section>

              <Section id="liability" title="7. Disclaimers and liability">
                <p>
                  The Platform is provided &ldquo;as is.&rdquo; To the maximum extent permitted by law,
                  RentAI is not liable for the condition, safety, legality, or quality of any
                  listed item, for the conduct of any user, or for any indirect or consequential
                  damages arising from a rental. Renters and Hosts deal with each other at their own
                  risk.
                </p>
              </Section>

              <Section id="changes" title="8. Changes to these Terms">
                <p>
                  We may update these Terms from time to time. When we make material changes, we will
                  update the &ldquo;Last updated&rdquo; date and, where appropriate, notify you in the
                  app. Continued use after changes take effect means you accept the revised Terms.
                </p>
              </Section>

              <Section id="contact" title="9. Contact">
                <p>
                  Questions about these Terms? Email us at{' '}
                  <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
              </Section>
            </div>

            <div className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-500">
              See also our{' '}
              <Link href="/privacy" className="text-blue-600 hover:underline">
                Privacy Policy
              </Link>
              .
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
