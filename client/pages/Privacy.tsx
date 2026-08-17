import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { Layout } from "@/components/Layout";

const LAST_UPDATED = "17 August 2026";
const CONTACT_EMAIL = "support@oxygenlow.com";
const OPERATOR = "Oxygen Low's Software";
const SITE_URL = "https://oxygenlow.com";

interface SectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  index: number;
}

function Section({ id, title, children, index }: SectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: "easeOut" }}
      className="space-y-3"
    >
      <h2 className="text-xl font-bold tracking-tight border-b border-border/40 pb-2">
        {title}
      </h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
        {children}
      </div>
    </motion.section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 pl-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function Privacy() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full px-2 py-6 space-y-10 pb-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex items-start gap-4"
        >
          <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-inner shrink-0">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Privacy Policy
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Operated by{" "}
              <span className="font-medium text-foreground">{OPERATOR}</span>
              &nbsp;·&nbsp; United Kingdom
            </p>
          </div>
        </motion.div>

        {/* Intro */}
        <Section id="introduction" title="1. Introduction" index={1}>
          <P>
            Welcome to <strong>{OPERATOR}</strong> ("{OPERATOR}", "we", "us",
            or "our"). We operate the web application and desktop client
            available at{" "}
            <a
              href={SITE_URL}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {SITE_URL}
            </a>{" "}
            (collectively, the "Service").
          </P>
          <P>
            This Privacy Policy explains what personal data we collect, how we
            use and protect it, and the rights you have in relation to it. It
            applies to all users of the Service, wherever they are located. If
            you are in the European Economic Area (EEA) or the United Kingdom,
            the UK GDPR and UK Data Protection Act 2018 apply to our processing
            of your data. If you are a California resident, the California
            Consumer Privacy Act (CCPA) / CPRA also applies.
          </P>
          <P>
            If you have any questions about this policy or wish to exercise your
            rights, please contact us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </P>
        </Section>

        {/* Data we collect */}
        <Section id="data-collected" title="2. Information We Collect" index={2}>
          <P>We collect the following categories of information:</P>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-foreground">
                2.1 Account Data
              </p>
              <P>
                When you register or update your profile, we collect your email
                address, username, display name, biography, and profile picture.
                Your email address is used for authentication and account
                security. You can choose whether your email is visible on your
                public profile.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.2 Cloud Storage Files
              </p>
              <P>
                The Service provides up to 30 MB of personal cloud storage per
                user for images, documents, and audio files. Any files you
                upload are stored securely in your account and are accessible
                only to you unless you explicitly make them public (e.g. a
                public profile picture).
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.3 AI &amp; Chatbot Usage
              </p>
              <P>
                When you use our AI features (including the Chatbot, LLM Agent,
                and AI Characters), the prompts and conversation content you
                submit may be forwarded to one or more third-party AI providers
                in order to generate a response. See Section 4 for the list of
                providers. We do not permanently store the content of AI
                conversations on our servers beyond what is necessary to deliver
                the response.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.4 Authentication Data
              </p>
              <P>
                We use <strong>Supabase Auth</strong> to handle account
                creation, login, and session management. Supabase stores your
                email address and hashed password (or OAuth provider token)
                securely. OAuth sign-in (e.g. via a third-party provider)
                shares only the information granted by your consent with that
                provider.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.5 Support Tickets
              </p>
              <P>
                When you submit a support ticket, we collect the ticket title,
                description, type, and priority you provide. This information is
                used solely to respond to and resolve your request.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.6 Cookies &amp; Session Data
              </p>
              <P>
                We use essential session cookies to keep you logged in while
                you use the Service. These cookies are strictly necessary and
                cannot be disabled without breaking the Service. We do not use
                advertising, tracking, or analytics cookies.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.7 VPN &amp; Proxy Features
              </p>
              <P>
                Some features route network requests through our server as a
                proxy. We do not log the content of proxied requests beyond
                transient processing needed to deliver the response. We track 
                your daily bandwidth usage (to enforce the 50MB daily limit) and 
                temporarily retain IP addresses and request metadata for abuse 
                prevention purposes.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.8 Technical &amp; Log Data
              </p>
              <P>
                Our server automatically records standard HTTP request
                information, including your IP address, browser type, referring
                URL, and timestamps. This data is used for security monitoring,
                debugging, and abuse prevention. It is not used for profiling or
                advertising.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.9 Saved App Data
              </p>
              <P>
                The "Data Saves" feature allows you to store arbitrary text, notes, and 
                data keys. This content is securely stored in our database linked to 
                your account and is not accessible to other users.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.10 Social Features &amp; Friends
              </p>
              <P>
                If you use the Friends feature, we collect your friend requests and 
                connections. Your profile information (display name, username, bio, 
                and profile picture) will be visible to other users.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.11 User-Created AI Characters
              </p>
              <P>
                You can create custom AI characters and universes. If you choose to 
                publish them, they become accessible to other users in the Public 
                Characters directory. The details, prompts, and configurations of 
                these characters are stored in our database.
              </P>
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.12 Web Defender &amp; Security Services
              </p>
              <P>
                If you use our Web Defender security service or install the @oxygenlow/webdefender package 
                on your infrastructure, we process metadata about incoming web requests (such as 
                IP addresses, user agents, request paths, and potential attack vectors) and outbound 
                connection data. This information is used to provide rate limiting, threat blocking, 
                and security analytics for your protected applications. We use third-party IP geolocation 
                services to support country-level blocking.
              </P>
            </div>
          </div>
        </Section>

        {/* How we use data */}
        <Section id="how-we-use" title="3. How We Use Your Information" index={3}>
          <P>We use the information we collect to:</P>
          <Ul
            items={[
              "Create and manage your account and authenticate you securely.",
              "Provide, maintain, and improve the features of the Service.",
              "Store and retrieve your cloud files, app data saves, and custom AI characters.",
              "Facilitate social connections through the Friends system.",
              "Forward AI prompts to third-party providers and return the generated response to you.",
              "Respond to support tickets and communicate with you about your account.",
              "Detect and prevent fraud, abuse, and security incidents (including enforcing VPN bandwidth limits).",
              "Comply with applicable legal obligations.",
            ]}
          />
          <P>
            We process your data on the following legal bases (UK GDPR Article
            6): (a) <strong>contract</strong> — to perform the Service you have
            signed up for; (b) <strong>legitimate interests</strong> — for
            security monitoring, fraud prevention, and system stability; (c){" "}
            <strong>legal obligation</strong> — where the law requires us to
            retain or disclose data; and (d) <strong>consent</strong> — where you
            have explicitly given consent for optional features (such as making
            your profile public, sharing custom characters, or authorizing OAuth
            applications).
          </P>
        </Section>

        {/* Data sharing */}
        <Section
          id="data-sharing"
          title="4. Data Sharing &amp; Third-Party Services"
          index={4}
        >
          <P>
            We do not sell your personal data. We share data only with the
            following third-party processors, strictly to the extent necessary
            to operate the Service:
          </P>
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-xs min-w-[480px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-semibold text-foreground">
                    Processor
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground">
                    Purpose
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground">
                    Data Shared
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {[
                  [
                    "Supabase",
                    "Database, authentication & file storage",
                    "Account data, storage files, support tickets",
                  ],
                  [
                    "OpenAI",
                    "AI response generation",
                    "AI prompts you submit",
                  ],
                  [
                    "Anthropic",
                    "AI response generation",
                    "AI prompts you submit",
                  ],
                  [
                    "Google (Gemini)",
                    "AI response generation",
                    "AI prompts you submit",
                  ],
                  [
                    "xAI (Grok)",
                    "AI response generation",
                    "AI prompts you submit",
                  ],
                  [
                    "OpenRouter",
                    "AI model routing",
                    "AI prompts you submit",
                  ],
                  [
                    "Stable Horde",
                    "Image generation",
                    "Image generation prompts",
                  ],
                  [
                    "DuckDuckGo",
                    "Web search queries",
                    "Search terms generated from your AI prompts",
                  ],
                  [
                    "Cloudflare",
                    "Infrastructure, DDoS protection, & AI generation",
                    "IP address, request metadata, AI prompts",
                  ],
                  [
                    "ip-api.com",
                    "IP Geolocation for Web Defender",
                    "IP address",
                  ],
                  [
                    "Tor Project",
                    "TOR Exit Node Detection",
                    "No personal data shared (we fetch their public exit node list)",
                  ],
                ].map(([proc, purpose, data]) => (
                  <tr key={proc} className="hover:bg-muted/10 transition-colors">
                    <td className="p-3 font-medium text-foreground">{proc}</td>
                    <td className="p-3">{purpose}</td>
                    <td className="p-3">{data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 pt-2">
            <p className="font-semibold text-foreground">
              4.1 International Data Transfers
            </p>
            <P>
              Because some of our third-party infrastructure and AI processors
              (including OpenAI, Anthropic, Google, and Supabase) are based in the
              United States or other countries outside the United Kingdom and
              European Economic Area, your personal data may be transferred
              internationally. We ensure that appropriate safeguards are in place
              in accordance with UK GDPR Chapter V and EU GDPR Articles 44–49,
              such as the UK International Data Transfer Agreement (IDTA), the UK
              Addendum to the EU Standard Contractual Clauses (SCCs), and applicable
              adequacy decisions (including participation in the Data Privacy
              Framework where applicable).
            </P>
          </div>
          <P>
            Each third-party processor is bound by their own privacy policy and,
            where applicable, a Data Processing Agreement. We encourage you to
            review the privacy policies of these providers.
          </P>
          <P>
            We may also disclose data if required to do so by law, court order,
            or governmental authority, or to protect the rights, property, or
            safety of {OPERATOR}, our users, or the public.
          </P>
        </Section>

        {/* Retention */}
        <Section id="retention" title="5. Data Retention" index={5}>
          <P>
            We retain your personal data for as long as your account is active.
            When you delete your account (via a support ticket of type "Account
            Deletion Request"), we will remove your profile data, storage files,
            and support tickets within a reasonable period.
          </P>
          <P>
            Server log data and security-related records may be retained for up
            to 90 days for abuse-prevention purposes. AI prompt data forwarded
            to third-party providers is subject to those providers' own
            retention policies.
          </P>
        </Section>

        {/* GDPR rights */}
        <Section
          id="gdpr-rights"
          title="6. Your Rights Under UK &amp; EU GDPR"
          index={6}
        >
          <P>
            If you are located in the United Kingdom or EEA, you have the
            following rights in relation to your personal data:
          </P>
          <Ul
            items={[
              <><strong>Right of access</strong> — Request a copy of the personal data we hold about you.</>,
              <><strong>Right to rectification</strong> — Ask us to correct inaccurate or incomplete data.</>,
              <><strong>Right to erasure</strong> — Request deletion of your data ("right to be forgotten").</>,
              <><strong>Right to restriction</strong> — Ask us to pause processing of your data in certain circumstances.</>,
              <><strong>Right to data portability</strong> — Receive your data in a structured, machine-readable format.</>,
              <><strong>Right to object</strong> — Object to processing based on legitimate interests.</>,
              <><strong>Right to withdraw consent</strong> — Where processing is based on consent, withdraw it at any time without affecting prior processing.</>,
            ]}
          />
          <P>
            To exercise any of these rights, please contact us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {CONTACT_EMAIL}
            </a>
            . We will respond within one month. If you are in the UK, you also
            have the right to lodge a complaint with the{" "}
            <a
              href="https://ico.org.uk"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              Information Commissioner's Office (ICO)
            </a>
            . If you are located in the EEA, you may lodge a complaint with your
            national Data Protection Authority (supervisory authority) in your
            country of residence.
          </P>
        </Section>

        {/* CCPA rights */}
        <Section
          id="ccpa-rights"
          title="7. Your Rights Under CCPA / CPRA (California)"
          index={7}
        >
          <P>
            If you are a California resident, you have the following rights
            under the California Consumer Privacy Act:
          </P>
          <Ul
            items={[
              <><strong>Right to know</strong> — Request disclosure of the categories and specific pieces of personal information we have collected about you.</>,
              <><strong>Right to delete</strong> — Request deletion of personal information we hold about you, subject to certain exceptions.</>,
              <><strong>Right to opt-out of sale or sharing</strong> — We do not sell or share your personal information for cross-context behavioural advertising. No opt-out is required.</>,
              <><strong>Right to correct</strong> — Request correction of inaccurate personal information.</>,
              <><strong>Right to non-discrimination</strong> — We will not discriminate against you for exercising any of your CCPA rights.</>,
            ]}
          />
          <P>
            To submit a request, contact us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {CONTACT_EMAIL}
            </a>
            . We will verify your identity before processing requests related
            to personal information.
          </P>
        </Section>

        {/* Cookies */}
        <Section id="cookies" title="8. Cookies" index={8}>
          <P>
            We use only <strong>strictly necessary cookies</strong> to maintain
            your authenticated session. These cookies are set by Supabase Auth
            and are essential for the Service to function. They are not used to
            track you across other websites and are deleted when you sign out or
            when your session expires.
          </P>
          <P>
            We do not use advertising, analytics, social media, or any other
            non-essential cookies.
          </P>
        </Section>

        {/* Children */}
        <Section id="children" title="9. Children's Privacy" index={9}>
          <P>
            The Service is not directed at children under the age of 13. In the
            UK, pursuant to the Data Protection Act 2018 (Section 9) and UK GDPR
            Article 8, the age of digital consent for information society services
            is 13. Users in the EEA must meet their respective national age of
            digital consent (up to 16, unless a lower age has been enacted under
            domestic legislation). We do not knowingly collect personal data from
            children below these applicable age limits. If you believe a child has
            provided us with personal data, please contact us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and we will take steps to delete it promptly.
          </P>
        </Section>

        {/* Changes */}
        <Section
          id="changes"
          title="10. Changes to This Policy"
          index={10}
        >
          <P>
            We may update this Privacy Policy from time to time. When we do, we
            will revise the "Last updated" date at the top of this page. If the
            changes are material, we will make reasonable efforts to notify you
            (for example, via an in-app notice). Continued use of the Service
            after changes become effective constitutes your acceptance of the
            revised policy.
          </P>
        </Section>

        {/* Contact */}
        <Section id="contact" title="11. Contact Us" index={11}>
          <P>
            If you have any questions, concerns, or requests regarding this
            Privacy Policy or our data practices, please reach out to us:
          </P>
          <div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-1">
            <p className="font-semibold text-foreground">{OPERATOR}</p>
            <p>
              Email:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>Website: {SITE_URL}</p>
            <p>Jurisdiction: United Kingdom</p>
          </div>
        </Section>
      </div>
    </Layout>
  );
}
