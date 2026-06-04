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

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy · RentAI</title>
        <meta name="description" content="How RentAI collects, uses, and protects your personal data." />
      </Head>

      <div className="bg-gray-50 font-sans">
        <section className="bg-gradient-to-br from-blue-500 to-blue-600 py-14 text-white">
          <div className="mx-auto max-w-3xl px-6">
            <h1 className="text-4xl font-bold">Privacy Policy</h1>
            <p className="mt-2 text-blue-100">Last updated: {EFFECTIVE_DATE}</p>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <p className="mb-8 text-[15px] leading-relaxed text-gray-700">
              This Privacy Policy explains what personal data RentAI (&ldquo;we&rdquo;) collects,
              why we collect it, and the choices you have. It applies to your use of the RentAI
              marketplace. By using the Platform, you consent to the practices described here.
            </p>

            <div className="space-y-8">
              <Section id="collect" title="1. Data we collect">
                <ul className="list-disc space-y-1 pl-6">
                  <li>
                    <strong>Account data:</strong> your name, email address, phone number, and a securely
                    hashed password. If you sign in with Google, we receive your basic Google profile.
                  </li>
                  <li>
                    <strong>Profile &amp; location:</strong> your avatar and an optional home location
                    (city / coordinates) used to show nearby rentals.
                  </li>
                  <li>
                    <strong>Verification (KYC):</strong> identity documents and verification status, where
                    you choose to verify your identity to become a trusted host.
                  </li>
                  <li>
                    <strong>Listings &amp; transactions:</strong> the listings you create, bookings,
                    payments, payouts, reviews, and disputes.
                  </li>
                  <li>
                    <strong>Messages:</strong> the content of chats you exchange with other users.
                  </li>
                  <li>
                    <strong>Activity signals:</strong> items you view, wishlist, book, and review. We use
                    these to personalize the listings we recommend to you.
                  </li>
                  <li>
                    <strong>Technical data:</strong> device, browser, and approximate location derived
                    from your network, plus standard log data.
                  </li>
                </ul>
              </Section>

              <Section id="use" title="2. How we use your data">
                <ul className="list-disc space-y-1 pl-6">
                  <li>To operate the marketplace: accounts, listings, bookings, payments, and payouts;</li>
                  <li>To personalize recommendations and search results based on your activity;</li>
                  <li>To verify identity, prevent fraud, and keep the community safe;</li>
                  <li>To send you transactional notifications (email/SMS) about your bookings and account;</li>
                  <li>To provide support and resolve disputes;</li>
                  <li>To comply with legal obligations.</li>
                </ul>
              </Section>

              <Section id="sharing" title="3. When we share data">
                <p>
                  We share data with other users only as needed to complete a rental — for example, a
                  Host sees a Renter&rsquo;s name and booking details. We do not sell your personal data.
                  We use trusted service providers to run the Platform, including:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li><strong>Cloudinary</strong> — hosting of listing and profile images;</li>
                  <li><strong>Google</strong> — sign-in (OAuth) and AI features (search &amp; recommendations);</li>
                  <li><strong>Email/SMS providers</strong> — delivery of verification codes and notifications;</li>
                  <li><strong>Payment provider</strong> — processing of rental payments.</li>
                </ul>
                <p>
                  These providers process data on our behalf under their own security and privacy
                  commitments. We may also disclose data where required by law.
                </p>
              </Section>

              <Section id="cookies" title="4. Cookies and local storage">
                <p>
                  We use your browser&rsquo;s local storage to keep you signed in (authentication tokens),
                  remember your host/renter mode, and temporarily save a listing draft while you create
                  it. These are essential to how the Platform works. We do not use third-party
                  advertising cookies.
                </p>
              </Section>

              <Section id="retention" title="5. Data retention">
                <p>
                  We keep your data for as long as your account is active and as needed to provide the
                  service, comply with legal and tax obligations, resolve disputes, and enforce our
                  agreements. When you delete your account, we remove or anonymize your personal data
                  except where we must retain certain records (for example, transaction history).
                </p>
              </Section>

              <Section id="rights" title="6. Your rights">
                <p>
                  You can access and update most of your information from your profile. You may request a
                  copy of your data, ask us to correct or delete it, or withdraw consent, by contacting
                  us. We will respond within a reasonable time, subject to legal limits.
                </p>
              </Section>

              <Section id="security" title="7. Security">
                <p>
                  We protect your data with industry-standard measures: passwords are hashed, traffic is
                  encrypted in transit, and access to systems is restricted. No method of transmission or
                  storage is perfectly secure, but we work to protect your information and to notify you
                  of significant incidents where required.
                </p>
              </Section>

              <Section id="children" title="8. Children">
                <p>
                  RentAI is not directed to anyone under 18, and we do not knowingly collect data
                  from minors. If you believe a minor has provided us data, please contact us so we can
                  remove it.
                </p>
              </Section>

              <Section id="contact" title="9. Contact us">
                <p>
                  For privacy questions or requests, email{' '}
                  <a className="text-blue-600 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
              </Section>
            </div>

            <div className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-500">
              See also our{' '}
              <Link href="/terms" className="text-blue-600 hover:underline">
                Terms of Service
              </Link>
              .
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
